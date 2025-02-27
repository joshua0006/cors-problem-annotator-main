import React, { useRef, useState, useEffect, useCallback } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { PDFControls } from "./PDFViewer/PDFControls";
import { usePDFDocument } from "../hooks/usePDFDocument";
import { usePDFPage } from "../hooks/usePDFPage";
import {
  createExportCanvas,
  exportToPNG,
  exportToPDF,
  exportAnnotations,
  importAnnotations,
  saveAnnotations,
  loadAnnotations,
} from "../utils/exportUtils";
import { drawAnnotation } from "../utils/drawingUtils";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useToast } from "../contexts/ToastContext";
import { ChevronLeft, ChevronRight, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";

interface PDFViewerProps {
  file: File | string;
  documentId: string;
}

// Function to determine if a PDF has mostly text (for better export strategy)
async function isTextBasedPDF(pdfDocument: any) {
  try {
    // Check a sample of pages (first, middle, last)
    const numPages = pdfDocument.numPages;
    const pagesToCheck = [
      1, 
      Math.floor(numPages / 2), 
      numPages
    ].filter((pageNum, index, self) => self.indexOf(pageNum) === index);
    
    let textCount = 0;
    let imageCount = 0;
    
    for (const pageNum of pagesToCheck) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      textCount += textContent.items.length;
      
      const operatorList = await page.getOperatorList();
      // Count image operators as a rough estimate
      const imageOps = operatorList.fnArray.filter((op: number) => op === 82); // 82 is the code for "paintImageXObject"
      imageCount += imageOps.length;
    }
    
    // If there's significantly more text than images, consider it text-based
    return textCount > imageCount * 3;
  } catch (error) {
    console.error("Error checking PDF type:", error);
    return false; // Default to treating as image-based
  }
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, documentId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(0.75);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [autoFitApplied, setAutoFitApplied] = useState(false);
  const [renderAttempts, setRenderAttempts] = useState(0);
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const renderTaskRef = useRef<any>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { currentTool } = useAnnotationStore();
  const store = useAnnotationStore();

  const { showToast } = useToast();

  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    error: string | null;
  }>({
    loading: false,
    error: null,
  });

  const { isShortcutGuideOpen, setIsShortcutGuideOpen } =
    useKeyboardShortcutGuide();

  // Convert string URL to File object if needed
  useEffect(() => {
    const loadPdfFromUrl = async (url: string) => {
      try {
        setIsRendering(true);
        setRenderError(null);
        console.log('Loading PDF from URL:', url);
        
        // Support both relative and absolute URLs
        const fullUrl = url.startsWith('http') ? url : new URL(url, window.location.href).toString();
        
        // First try with default mode
        try {
          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/pdf',
              'Cache-Control': 'no-cache',
            },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const fileName = url.split('/').pop() || "document.pdf";
          const file = new File([blob], fileName, { type: "application/pdf" });
          
          if (file.size === 0) {
            throw new Error("Downloaded PDF is empty (0 bytes)");
          }
          
          console.log('Successfully loaded PDF from URL, file size:', file.size);
          setPdfFile(file);
        } catch (error) {
          console.warn("First fetch attempt failed, trying with CORS mode:", error);
          
          // Fallback to explicit cors mode
          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/pdf',
              'Cache-Control': 'no-cache',
            },
            mode: 'cors',
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const fileName = url.split('/').pop() || "document.pdf";
          const file = new File([blob], fileName, { type: "application/pdf" });
          
          if (file.size === 0) {
            throw new Error("Downloaded PDF is empty (0 bytes)");
          }
          
          console.log('Successfully loaded PDF from URL with CORS mode, file size:', file.size);
          setPdfFile(file);
        }
      } catch (error) {
        console.error("Failed to load PDF from URL:", error);
        setRenderError(error instanceof Error ? error : new Error(`Failed to load PDF: ${error}`));
        showToast(`Failed to load PDF: ${(error as Error).message}`, "error");
      } finally {
        setIsRendering(false);
      }
    };
    
    if (typeof file === "string") {
      loadPdfFromUrl(file);
    } else if (file instanceof File) {
      if (file.size === 0) {
        setRenderError(new Error("PDF file is empty (0 bytes)"));
        showToast("PDF file is empty or invalid", "error");
      } else {
        console.log('Loading PDF from File object, name:', file.name, 'size:', file.size);
        setRenderError(null);
        setPdfFile(file);
      }
    }
  }, [file]);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const { pdf, error: pdfError, isLoading: isPdfLoading } = usePDFDocument(pdfFile);
  const { page, error: pageError, isLoading: isPageLoading } = usePDFPage(pdf, currentPage, scale);

  // Log PDF info once it's loaded
  useEffect(() => {
    if (pdf) {
      console.log(`PDF loaded: ${pdf.numPages} pages`);
      setIsViewerReady(true);
    } else {
      setIsViewerReady(false);
    }
  }, [pdf]);

  // Add error handling display
  useEffect(() => {
    if (pdfError) {
      console.error('PDF document error:', pdfError);
      setRenderError(pdfError);
      showToast(`Failed to load PDF document: ${pdfError.message}`, "error");
    }
    
    if (pageError) {
      console.error('PDF page error:', pageError);
      showToast(`Failed to load page ${currentPage}: ${pageError.message}`, "error");
    }
  }, [pdfError, pageError, currentPage]);

  const renderPdfPage = useCallback(() => {
    if (!page || !canvasRef.current) {
      console.log('Cannot render: page or canvas not ready');
      return false;
    }
    
    // Cancel any in-progress rendering
    if (renderTaskRef.current) {
      console.log('Cancelling existing render task');
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    // Clear any pending timeouts
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }

    setIsRendering(true);
    setRenderError(null);
    console.log('Starting render for page', currentPage, 'with scale', scale, '(attempt:', renderAttempts + 1, ')');
    
    // Use the current scale with a slight boost to ensure crisp rendering
    const renderScale = scale * 1.1; // Slight increase in scale for better rendering
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = canvasRef.current;
    
    // Check if canvas dimensions are valid
    if (viewport.width <= 0 || viewport.height <= 0) {
      const error = new Error(`Invalid viewport dimensions: ${viewport.width}x${viewport.height}`);
      console.error(error);
      setRenderError(error);
      setIsRendering(false);
      return false;
    }
    
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) {
      const error = new Error("Failed to get canvas context");
      console.error(error);
      setRenderError(error);
      setIsRendering(false);
      return false;
    }

    try {
      // Clear canvas and set correct dimensions with a margin to prevent clipping
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / 1.1)}px`; // Adjust back for display
      canvas.style.height = `${Math.ceil(viewport.height / 1.1)}px`; // Adjust back for display
      
      // Set white background
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'display',
      };

      // Store the render task reference
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      renderTask.promise
        .then(() => {
          console.log('Render completed for page', currentPage);
          setIsRendering(false);
          setRenderAttempts(0); // Reset attempts counter on success
          renderTaskRef.current = null;
          setRenderError(null);
        })
        .catch((error) => {
          if (error.message.includes('cancelled')) {
            console.log('Render operation was cancelled');
          } else {
            console.error("Error rendering PDF page:", error);
            setRenderError(error);
            
            // Auto-retry up to 3 times with increasing delays
            if (renderAttempts < 3) {
              const retryDelay = Math.pow(2, renderAttempts) * 500; // Exponential backoff
              console.log(`Retrying render in ${retryDelay}ms (attempt ${renderAttempts + 1}/3)`);
              
              renderTimeoutRef.current = setTimeout(() => {
                setRenderAttempts(prev => prev + 1);
                renderPdfPage();
              }, retryDelay);
            } else {
              showToast("Failed to render PDF after multiple attempts. Try refreshing the page.", "error");
            }
          }
          setIsRendering(false);
          renderTaskRef.current = null;
        });
      
      return true;
    } catch (error) {
      console.error("Exception during render setup:", error);
      setRenderError(error instanceof Error ? error : new Error('Failed to set up render'));
      setIsRendering(false);
      return false;
    }
  }, [page, scale, currentPage, renderAttempts]);

  // Modify the useEffect that handles PDF page rendering
  useEffect(() => {
    renderPdfPage();
    // Return cleanup function if needed
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [renderPdfPage]);

  // Add debouncing for resize handling
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        
        // Only update if dimensions have actually changed
        if (newWidth !== containerWidth || newHeight !== containerHeight) {
          setContainerWidth(newWidth);
          setContainerHeight(newHeight);
          console.log(`Container dimensions updated: ${newWidth}x${newHeight}`);
        }
      }
    };
    
    // Debounced render function to avoid multiple rapid renders
    const debouncedRender = () => {
      if (isRendering || !page || !canvasRef.current) return;
      renderPdfPage();
    };

    // Immediately update dimensions
    updateDimensions();
    
    // Set up the resize handler with debouncing
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      updateDimensions();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(debouncedRender, 100);
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
      
      // Clean up any pending render tasks
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      
      // Clean up any retry timeouts
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }
    };
  }, [page, renderPdfPage, isRendering, containerWidth, containerHeight]);

  // Add keyboard shortcuts with documentId and current page
  useKeyboardShortcuts(documentId, currentPage);

  // Update cursor based on current tool
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cursorMap: { [key: string]: string } = {
      select: "default",
      freehand: "crosshair",
      line: "crosshair",
      arrow: "crosshair",
      doubleArrow: "crosshair",
      rectangle: "crosshair",
      circle: "crosshair",
      triangle: "crosshair",
      text: "text",
      stickyNote: "text",
      highlight: "crosshair",
      stamp: "crosshair",
    };

    container.style.cursor = cursorMap[currentTool] || "default";
  }, [currentTool]);

  // Add function to fit the PDF to the container width
  const fitToWidth = useCallback(() => {
    if (!page || !containerRef.current || isRendering) return;
    
    // Get the original viewport to determine the PDF's native dimensions
    const originalViewport = page.getViewport({ scale: 1.0 });
    
    // Calculate the scale needed to fit the width
    const containerWidth = containerRef.current.clientWidth;
    
    // Increased padding to ensure content isn't cropped at edges
    // Using a larger minimum padding of 60px instead of 40px
    const padding = Math.max(60, containerWidth * 0.08); // 8% of container width or at least 60px
    const targetWidth = containerWidth - padding;
    
    // Calculate new scale with constraints to avoid extreme scaling
    let newScale = targetWidth / originalViewport.width;
    
    // Ensure scale is within reasonable bounds for readability
    // Increased minimum scale from 0.5 to 0.6 for better visibility
    newScale = Math.max(0.6, Math.min(newScale, 2.0));
    
    console.log('Fitting PDF to width. Container:', containerWidth, 'Scale:', newScale.toFixed(2));
    
    setScale(newScale);
    return newScale;
  }, [page, isRendering]);

  // Function to center the document in the viewport
  const scrollToCenterDocument = useCallback(() => {
    if (!containerRef.current || !page) return;
    
    const container = containerRef.current.querySelector('.overflow-auto');
    if (container) {
      // Get container dimensions
      const containerRect = container.getBoundingClientRect();
      
      // Get content dimensions
      const content = container.querySelector('.pdf-viewer-container');
      if (content) {
        const contentRect = content.getBoundingClientRect();
        
        // Calculate center positions
        const scrollToX = (contentRect.width - containerRect.width) / 2;
        const scrollToY = (contentRect.height - containerRect.height) / 2;
        
        // Scroll container to center the content
        container.scrollTo({
          left: Math.max(0, scrollToX),
          top: Math.max(0, scrollToY),
          behavior: 'smooth'
        });
        
        console.log('Centered document in view');
      }
    }
  }, [page]);

  // Add an effect to measure container dimensions when mounted
  useEffect(() => {
    if (containerRef.current) {
      const updateDimensions = () => {
        setContainerWidth(containerRef.current?.clientWidth || 0);
        setContainerHeight(containerRef.current?.clientHeight || 0);
      };
      
      updateDimensions();
      
      // Also update dimensions when window is resized
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, []);

  // Auto-fit when PDF page is loaded
  useEffect(() => {
    if (page && containerRef.current && containerWidth > 0 && !autoFitApplied) {
      // Short delay to ensure the container has been properly measured
      const timer = setTimeout(() => {
        fitToWidth();
        setAutoFitApplied(true);
        
        // Add additional delay before centering to let render complete
        setTimeout(() => {
          scrollToCenterDocument();
          console.log('Auto-centered PDF after fit-to-width');
        }, 300);
        
        console.log('Auto-fitted PDF to width on load');
      }, 200); // Increased delay from 100ms to 200ms for more reliable sizing
      
      return () => clearTimeout(timer);
    }
  }, [page, containerRef, containerWidth, fitToWidth, autoFitApplied, scrollToCenterDocument]);

  // Reset auto-fit flag when PDF changes
  useEffect(() => {
    if (pdfFile) {
      setAutoFitApplied(false);
      setRenderAttempts(0);
      console.log('New PDF loaded, will auto-fit when ready');
    }
  }, [pdfFile]);

  // Function to handle manual retry of rendering
  const handleRetryRender = useCallback(() => {
    setRenderAttempts(0);
    setRenderError(null);
    
    // For URL-based PDFs, we might need to reload the file
    if (typeof file === "string") {
      console.log("Reloading PDF from URL");
      
      // Create a new URL object with a cache-busting parameter
      const timestamp = Date.now();
      const url = file.includes('?') 
        ? `${file}&cacheBust=${timestamp}` 
        : `${file}?cacheBust=${timestamp}`;
        
      // Load the PDF again with cache-busting
      const loadPdfFromUrl = async () => {
        try {
          setIsRendering(true);
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/pdf',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            mode: 'cors',
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const fileName = url.split('/').pop()?.split('?')[0] || "document.pdf";
          const newFile = new File([blob], fileName, { type: "application/pdf" });
          setPdfFile(newFile);
        } catch (error) {
          console.error("Failed to reload PDF:", error);
          setRenderError(error instanceof Error ? error : new Error(`Failed to reload PDF: ${error}`));
          showToast(`Failed to reload PDF: ${(error as Error).message}`, "error");
        } finally {
          setIsRendering(false);
        }
      };
      
      loadPdfFromUrl();
    } else {
      // For File objects, just try rendering again
      renderPdfPage();
    }
  }, [file, renderPdfPage]);

  const exportAllPages = async () => {
    if (!pdf) return;
    
    // Ensure we're not already exporting or rendering
    if (isExporting || isRendering) {
      showToast("Another operation is in progress. Please wait...", "error");
      return;
    }
    
    setIsExporting(true);
    showToast("Preparing PDF for download...", "success");

    try {
      // Cancel any existing render tasks
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      
      // Store the current visible scale for consistent export
      const currentViewScale = scale;
      console.log(`Exporting PDF with scale: ${currentViewScale.toFixed(2)}`);
      
      // Get the first page to determine original dimensions
      const firstPage = await pdf.getPage(1);
      const originalViewport = firstPage.getViewport({ scale: 1.0 });
      
      // Determine whether this is a text-heavy PDF 
      const isTextBased = await isTextBasedPDF(pdf);
      
      // Use original PDF dimensions and format for better quality
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: originalViewport.width > originalViewport.height ? "landscape" : "portrait",
        unit: "pt", // Use points for more precise sizing
        format: [originalViewport.width, originalViewport.height],
        compress: true, // Enable compression for smaller file size
      });

      // Set PDF metadata
      doc.setProperties({
        title: `Annotated Document - ${documentId}`,
        subject: "Document with annotations",
        creator: "CORS Problem Annotator",
        author: "CORS Problem Annotator User",
        keywords: "annotated, pdf, cors-problem-annotator"
      });

      // Track progress
      let processedPages = 0;
      const totalPages = pdf.numPages;

      // Get document annotations
      const documentAnnotations = store.documents[documentId]?.annotations || [];

      // Use the same scale as currently displayed in the viewer for consistent results
      // Just slightly higher resolution for better quality output
      const renderScale = currentViewScale * 1.2;
      
      // Process pages in smaller batches to manage memory better
      const BATCH_SIZE = 2;
      
      showToast("Rendering PDF exactly as shown in the viewer...", "success");
      
      for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        
        // Process each batch of pages
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          try {
            showToast(`Processing page ${pageNum} of ${totalPages}...`, "success");
            
            // Create temporary canvas for each page
            const tempCanvas = document.createElement("canvas");
            const page = await pdf.getPage(pageNum);
            
            // Use the same viewport calculation as the viewer
            const viewport = page.getViewport({ scale: renderScale });
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const ctx = tempCanvas.getContext("2d", { alpha: false })!;
            
            // Set white background to avoid transparency issues
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Render PDF page
            await page.render({
              canvasContext: ctx,
              viewport,
              intent: "display"
            }).promise;

            // Filter annotations for this page
            const pageAnnotations = documentAnnotations.filter(
              (a: any) => a.pageNumber === pageNum
            );
            
            // Draw annotations with standard method (same as viewer)
            pageAnnotations.forEach((annotation: any) => {
              try {
                drawAnnotation(ctx, annotation, renderScale);
              } catch (drawError) {
                console.error(`Error drawing annotation:`, drawError);
              }
            });

            // Add page to PDF (first page is added automatically)
            if (pageNum > 1) {
              doc.addPage([originalViewport.width, originalViewport.height]);
            }

            // Use PNG format for better quality
            const imgData = tempCanvas.toDataURL("image/png", 1.0);
            
            // Calculate proper scaling ratio to maintain the view ratio
            const scaleRatio = originalViewport.width / viewport.width;
            const scaledHeight = viewport.height * scaleRatio;
            
            // Center the content if needed
            const yOffset = Math.max(0, (originalViewport.height - scaledHeight) / 2);
            
            // Add image to PDF
            doc.addImage(
              imgData,
              "PNG",
              0,
              yOffset,
              originalViewport.width,
              scaledHeight,
              undefined,
              'FAST'
            );

            // Clean up resources
            processedPages++;
            page.cleanup();
            tempCanvas.width = 0;
            tempCanvas.height = 0;
            
          } catch (pageError) {
            console.error(`Error processing page ${pageNum}:`, pageError);
            showToast(`Error on page ${pageNum}. Continuing...`, "error");
          }
        }
        
        // Add a small delay between batches to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      showToast("Finalizing PDF...", "success");
      
      // Generate filename based on documentId with date
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `annotated-${documentId}-${dateString}.pdf`;
      
      doc.save(filename);
      showToast("PDF downloaded successfully!", "success");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      showToast("Failed to download PDF. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Enhanced drawing function for improved visibility of complex shapes
  function drawAnnotationWithEnhancedVisibility(ctx: CanvasRenderingContext2D, annotation: any, scale: number) {
    if (!ctx || !annotation || !annotation.style) {
      console.warn('Invalid parameters for drawAnnotationWithEnhancedVisibility', { 
        hasCtx: !!ctx, 
        hasAnnotation: !!annotation,
        hasStyle: !!(annotation && annotation.style)
      });
      return;
    }
    
    try {
      // Store original line width
      const originalLineWidth = annotation.style.lineWidth || 1;
      
      // Create a temporary modified annotation with increased visibility
      // but without shadow effects
      const enhancedAnnotation = {
        ...annotation,
        style: {
          ...annotation.style,
          lineWidth: Math.max(2, originalLineWidth * 1.5), // Use slightly thicker lines
          opacity: 1.0 // Full opacity for complex shapes
        }
      };
      
      // Draw the annotation without shadows, just once with enhanced line width
      drawAnnotation(ctx, enhancedAnnotation, scale);
    } catch (error) {
      console.error('Error in drawAnnotationWithEnhancedVisibility:', error);
    }
  }

  const handleZoomIn = () => {
    if (isRendering || isExporting) return;
    setScale((prev) => Math.min(prev + 0.1, 3));
  };
  
  const handleZoomOut = () => {
    if (isRendering || isExporting) return;
    setScale((prev) => Math.max(prev - 0.1, 0.5));
  };
  
  const handleZoomReset = () => {
    if (isRendering || isExporting) return;
    setScale(1.0); // Reset to 100%
  };
  
  const handleNextPage = () => {
    if (isRendering || isExporting) return;
    setCurrentPage((p) => Math.min(p + 1, pdf?.numPages || p));
  };
  
  const handlePrevPage = () => {
    if (isRendering || isExporting) return;
    setCurrentPage((p) => Math.max(p - 1, 1));
  };

  const handleExportCurrentPage = async (format: "png" | "pdf") => {
    if (!page || !canvasRef.current) return;
    
    // Prevent export if another operation is in progress
    if (isExporting || isRendering) {
      showToast("Another operation is in progress. Please wait...", "error");
      return;
    }
    
    setIsExporting(true);
    
    try {
      // Cancel any existing render tasks
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const documentAnnotations = store.documents[documentId]?.annotations || [];
      const pageAnnotations = documentAnnotations.filter(
        (a: any) => a.pageNumber === currentPage
      );
      
      const { canvas, viewport } = await createExportCanvas(
        page,
        scale,
        pageAnnotations
      );

      if (format === "png") {
        exportToPNG(canvas, currentPage);
        showToast("PNG image downloaded successfully!", "success");
      } else {
        await exportToPDF(canvas, viewport, currentPage);
        showToast("PDF page downloaded successfully!", "success");
      }
    } catch (error) {
      console.error(`Error exporting page as ${format}:`, error);
      showToast(`Failed to export as ${format}. Please try again.`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAnnotations = () => {
    const documentAnnotations = store.documents[documentId]?.annotations || [];
    exportAnnotations(documentAnnotations, documentId);
  };

  const handleImportAnnotations = async (file: File) => {
    setImportStatus({ loading: true, error: null });
    try {
      const importedAnnotations = await importAnnotations(file);
      useAnnotationStore
        .getState()
        .importAnnotations(documentId, importedAnnotations);
      setImportStatus({ loading: false, error: null });
    } catch (error) {
      console.error("Failed to import annotations:", error);
      setImportStatus({
        loading: false,
        error: "Failed to import annotations. Please check the file format.",
      });
    }
  };

  // Add save functionality
  useEffect(() => {
    // Save annotations when they change
    const document = store.documents[documentId];
    if (document) {
      saveAnnotations(documentId);
    }
  }, [store.documents[documentId]?.annotations]);

  // Add load functionality
  useEffect(() => {
    // Load annotations when component mounts
    const savedAnnotations = loadAnnotations(documentId);
    if (savedAnnotations) {
      store.importAnnotations(documentId, savedAnnotations, "replace");
    }
  }, [documentId]);

  // Render error state
  if (renderError && !isRendering && renderAttempts >= 3) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="text-red-500 font-medium mb-2 flex items-center">
          <AlertTriangle className="mr-2" size={20} />
          Failed to render PDF
        </div>
        <div className="text-gray-700 text-sm mb-4 max-w-md text-center">
          {renderError.message || "The PDF could not be displayed. This might be due to network issues or a corrupted file."}
        </div>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
          onClick={handleRetryRender}
        >
          <RefreshCw className="mr-2" size={16} />
          Retry Loading PDF
        </button>
      </div>
    );
  }

  // Error state for PDF document or page loading errors
  if (pdfError || pageError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="text-red-500 font-medium mb-2 flex items-center">
          <AlertTriangle className="mr-2" size={20} />
          Error loading PDF
        </div>
        <div className="text-gray-700 text-sm mb-4 max-w-md text-center">
          {pdfError?.message || pageError?.message || "Unknown error occurred while loading the PDF document."}
        </div>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-2" size={16} />
          Reload Page
        </button>
      </div>
    );
  }

  // Loading state
  if (isPdfLoading || isPageLoading || (isRendering && !page)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-700">Loading PDF document...</p>
      </div>
    );
  }

  if (!pdf || !page) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-center p-4">
          {pdfFile ? "Preparing PDF viewer..." : "No PDF document loaded"}
        </div>
      </div>
    );
  }

  const viewport = page.getViewport({ scale });

  return (
    <div className="relative flex flex-col h-full">
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide
          onClose={() => setIsShortcutGuideOpen(false)}
        />
      )}
      {pdf && (
        <PDFControls
          currentPage={currentPage}
          totalPages={pdf.numPages}
          scale={scale}
          isExporting={isExporting}
          isImporting={importStatus.loading}
          importError={importStatus.error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onFitToWidth={fitToWidth}
          onExportCurrentPage={handleExportCurrentPage}
          onExportAllPages={exportAllPages}
          onExportAnnotations={handleExportAnnotations}
          onImportAnnotations={handleImportAnnotations}
        />
      )}
      
      <div className="pdf-container-fixed h-full flex-1 overflow-hidden" ref={containerRef}>
        {/* PDF Viewer - Fixed container with scrollable content */}
        <div className="relative flex-1 overflow-auto bg-gray-100 p-2 md:p-4">
          <div 
            className="pdf-viewer-container mx-auto"
            style={{
              width: page ? `${viewport.width}px` : `${containerWidth}px`,
              height: page ? `${viewport.height}px` : `${containerHeight}px`,
              position: 'relative',
              maxWidth: '100%',
              marginBottom: '20px', // Add bottom margin to ensure visibility
              opacity: isRendering ? 0.7 : 1, // Show slight fade during rendering
              transition: 'opacity 0.2s ease-in-out',
            }}
          >
            {page && (
              <>
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 z-10"
                  style={{
                    margin: '0 auto',
                  }}
                />
                {/* Only render annotation canvas when the PDF is ready */}
                {isViewerReady && (
                  <AnnotationCanvas
                    documentId={documentId}
                    pageNumber={currentPage}
                    scale={scale}
                    width={viewport.width}
                    height={viewport.height}
                  />
                )}
              </>
            )}
            
            {/* Rendering indicator - more subtle than the full screen loader */}
            {isRendering && page && (
              <div className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full p-1 z-50 shadow-md">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            )}
            
            {/* Center content button */}
            {page && (
              <button 
                onClick={scrollToCenterDocument}
                className="absolute bottom-2 right-2 bg-white bg-opacity-80 rounded-full p-2 z-50 shadow-md hover:bg-opacity-100"
                title="Center Document in View"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
              </button>
            )}
            
            {isExporting && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-4 rounded-lg shadow-lg">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-center mt-4">Processing PDF...</p>
                  <p className="text-center text-sm text-gray-500">This may take a few minutes for large documents.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
