import React, { useRef, useState, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
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
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const renderTaskRef = useRef<any>(null);
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
        console.log('Loading PDF from URL:', url);
        
        // Support both relative and absolute URLs
        const fullUrl = url.startsWith('http') ? url : new URL(url, window.location.href).toString();
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'no-cache',
          },
          mode: 'cors', // Try with cors mode first
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const fileName = url.split('/').pop() || "document.pdf";
        const file = new File([blob], fileName, { type: "application/pdf" });
        console.log('Successfully loaded PDF from URL, file size:', file.size);
        setPdfFile(file);
      } catch (error) {
        console.error("Failed to load PDF from URL:", error);
        showToast(`Failed to load PDF: ${(error as Error).message}`, "error");
      } finally {
        setIsRendering(false);
      }
    };
    
    if (typeof file === "string") {
      loadPdfFromUrl(file);
    } else if (file instanceof File) {
      console.log('Loading PDF from File object, name:', file.name, 'size:', file.size);
      setPdfFile(file);
    }
  }, [file]);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const { pdf, error: pdfError } = usePDFDocument(pdfFile);
  const { page, error: pageError } = usePDFPage(pdf, currentPage, scale);

  // Log PDF info once it's loaded
  useEffect(() => {
    if (pdf) {
      console.log(`PDF loaded: ${pdf.numPages} pages`);
    }
  }, [pdf]);

  // Add error handling display
  useEffect(() => {
    if (pdfError) {
      console.error('PDF document error:', pdfError);
      showToast(`Failed to load PDF document: ${pdfError.message}`, "error");
    }
    
    if (pageError) {
      console.error('PDF page error:', pageError);
      showToast(`Failed to load page ${currentPage}: ${pageError.message}`, "error");
    }
  }, [pdfError, pageError, currentPage]);

  // Modify the useEffect that handles PDF page rendering to include render task tracking
  useEffect(() => {
    if (!page || !canvasRef.current) return;

    // Cancel any in-progress rendering
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setIsRendering(true);
    console.log('Starting render for page', currentPage, 'with scale', scale);
    
    // Use the current scale with a slight boost to ensure crisp rendering
    const renderScale = scale * 1.1; // Slight increase in scale for better rendering
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) {
      console.error("Failed to get canvas context");
      return;
    }

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
        renderTaskRef.current = null;
      })
      .catch((error) => {
        if (error.message.includes('cancelled')) {
          console.log('Render operation was cancelled');
        } else {
          console.error("Error rendering PDF page:", error);
        }
        setIsRendering(false);
        renderTaskRef.current = null;
      });
      
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [page, scale, currentPage]);

  // Add debouncing for resize handling
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && page) {
        setContainerWidth(containerRef.current.clientWidth);
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    
    // Debounced render function to avoid multiple rapid renders
    const debouncedRender = () => {
      if (!page || !canvasRef.current || isRendering) return;
      
      // Cancel any in-progress rendering
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      
      setIsRendering(true);
      
      // Get viewport with enhanced scale for better quality
      const renderScale = scale * 1.1;
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!ctx) return;
      
      // Clear and set dimensions with proper rounding to avoid fractional pixels
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / 1.1)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / 1.1)}px`;
      
      // Set white background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Start a new render operation with improved settings
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        intent: 'display',
      });
      
      renderTaskRef.current = renderTask;
      
      renderTask.promise
        .then(() => {
          setIsRendering(false);
          renderTaskRef.current = null;
        })
        .catch((error) => {
          if (error.message.includes('cancelled')) {
            console.log('Render operation was cancelled');
          } else {
            console.error("Error re-rendering PDF page:", error);
          }
          setIsRendering(false);
          renderTaskRef.current = null;
        });
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
    };
  }, [page, scale, isRendering]);

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
      
      // Get the first page to determine original dimensions
      const firstPage = await pdf.getPage(1);
      const originalViewport = firstPage.getViewport({ scale: 1.0 });
      
      // Determine whether this is a text-heavy PDF 
      const isTextBased = await isTextBasedPDF(pdf);
      showToast(
        `Detected ${isTextBased ? "text-based" : "graphics-based"} document. Optimizing export...`, 
        "success"
      );

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

      // Use a higher rendering scale for better quality of complex shapes
      const renderScale = isTextBased ? 2.5 : 4.0; // Increased scale for better quality
      
      // Process pages in smaller batches to manage memory better
      const BATCH_SIZE = isTextBased ? 3 : 2; // Reduced batch size due to higher scale
      
      for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        
        // Process each batch of pages
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          try {
            showToast(`Processing page ${pageNum} of ${totalPages}...`, "success");
            
            // Create temporary canvas for each page
            const tempCanvas = document.createElement("canvas");
            const page = await pdf.getPage(pageNum);
            
            // Use an appropriate scale for quality rendering
            const viewport = page.getViewport({ scale: renderScale });
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const ctx = tempCanvas.getContext("2d", { alpha: false })!;
            
            // Set white background to avoid transparency issues
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Render PDF page with high quality settings
            await page.render({
              canvasContext: ctx,
              viewport,
              intent: "display" // Use display intent for better color accuracy
            }).promise;

            // Filter annotations for this page
            const pageAnnotations = documentAnnotations.filter(
              (a: any) => a.pageNumber === pageNum
            );
            
            // Draw annotations in three passes to ensure correct layering
            // First pass: Draw highlights with proper blending
            const highlightAnnotations = pageAnnotations.filter(
              (a: any) => a.type === 'highlight'
            );
            
            if (highlightAnnotations.length > 0) {
              ctx.save();
              // Use a blend mode that works well for highlights
              ctx.globalCompositeOperation = 'multiply';
              
              highlightAnnotations.forEach((annotation: any) => {
                try {
                  // Draw highlights with special handling
                  const enhancedHighlight = {
                    ...annotation,
                    style: {
                      ...annotation.style,
                      opacity: Math.min(0.4, annotation.style.opacity) // Consistent highlight opacity
                    }
                  };
                  drawAnnotation(ctx, enhancedHighlight, renderScale);
                } catch (drawError) {
                  console.error("Error drawing highlight annotation:", drawError);
                }
              });
              
              ctx.restore();
            }
            
            // Second pass: Draw regular annotations
            const regularAnnotations = pageAnnotations.filter(
              (a: any) => a.type !== 'highlight' && 
                           !['triangle', 'star', 'door', 'window', 'fireExit', 'stairs', 'elevator', 'toilet'].includes(a.type)
            );
            
            regularAnnotations.forEach((annotation: any) => {
              try {
                drawAnnotation(ctx, annotation, renderScale);
              } catch (drawError) {
                console.error(`Error drawing annotation type ${annotation.type}:`, drawError);
              }
            });
            
            // Third pass: Draw complex shapes with enhanced visibility
            const complexShapeAnnotations = pageAnnotations.filter(
              (a: any) => ['triangle', 'star', 'door', 'window', 'fireExit', 'stairs', 'elevator', 'toilet'].includes(a.type)
            );
            
            if (complexShapeAnnotations.length > 0) {
              ctx.save();
              complexShapeAnnotations.forEach((annotation: any) => {
                try {
                  drawAnnotationWithEnhancedVisibility(ctx, annotation, renderScale);
                } catch (drawError) {
                  console.error(`Error drawing complex shape ${annotation.type}:`, drawError);
                }
              });
              ctx.restore();
            }

            // Add page to PDF (first page is added automatically)
            if (pageNum > 1) {
              doc.addPage([originalViewport.width, originalViewport.height]);
            }

            // Always use PNG for better shape quality
            const imgFormat = "PNG"; 
            const imgQuality = 1.0;
            
            // Convert canvas to image data with high quality
            const imgData = tempCanvas.toDataURL(`image/${imgFormat.toLowerCase()}`, imgQuality);
            
            // Add image to PDF, matching the page dimensions
            doc.addImage(
              imgData,
              imgFormat,
              0,
              0,
              originalViewport.width,
              originalViewport.height,
              undefined, // No alias
              'FAST' // Use fast compression
            );

            // Update progress and clean up
            processedPages++;
            
            // Clean up resources to prevent memory leaks
            page.cleanup();
            
            // Allow canvas to be garbage collected
            tempCanvas.width = 0;
            tempCanvas.height = 0;
            
          } catch (pageError) {
            console.error(`Error processing page ${pageNum}:`, pageError);
            showToast(`Error on page ${pageNum}. Continuing with other pages...`, "error");
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
    setScale(1);
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

  if (pdfError || pageError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="text-red-500 font-medium mb-2">Error loading PDF</div>
        <div className="text-gray-700 text-sm mb-4">
          {pdfError?.message || pageError?.message || "Unknown error occurred"}
        </div>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
      </div>
    );
  }

  if (!pdf || !page) {
    return (
      <div className="flex items-center justify-center h-full">
        {/* Loading indicator removed as requested */}
      </div>
    );
  }

  const viewport = page.getViewport({ scale });

  return (
    <>
      <div className="pdf-container-fixed" ref={containerRef}>
        {/* Controls Bar - Fixed size regardless of zoom */}
        <div className="flex items-center justify-between p-2 border-b bg-white zoom-invariant">
          <div className="flex items-center gap-4">
            {/* Page Controls */}
            <button
              onClick={handlePrevPage}
              className="p-1 rounded hover:bg-gray-100"
              disabled={currentPage === 1}
              title="Previous Page"
            >
              <ChevronLeft className="text-gray-700" size={20} />
            </button>
            <span className="text-sm font-medium text-gray-700">
              Page {currentPage} of {pdf?.numPages || 0}
            </span>
            <button
              onClick={handleNextPage}
              className="p-1 rounded hover:bg-gray-100"
              disabled={currentPage === pdf?.numPages || false}
              title="Next Page"
            >
              <ChevronRight className="text-gray-700" size={20} />
            </button>

            {/* Divider */}
            <div className="h-6 w-px bg-gray-200" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                className="p-1 rounded hover:bg-gray-100"
                title="Zoom Out"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </button>
              <span className="text-sm font-medium w-16 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1 rounded hover:bg-gray-100"
                title="Zoom In"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button
                onClick={handleZoomReset}
                className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Reset
              </button>
            </div>
            
            {/* Divider */}
            <div className="h-6 w-px bg-gray-200" />
            
            {/* Download Button */}
            <button
              onClick={exportAllPages}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
              title="Download Annotated PDF"
              disabled={isExporting}
            >
              <Download size={18} />
              <span>{isExporting ? "Exporting..." : "Download PDF"}</span>
            </button>
          </div>
        </div>

        {/* PDF Viewer - Fixed container with scrollable content */}
        <div className="pdf-content-scrollable bg-gray-100 p-4">
          {isRendering && (
            <div className="text-center mb-2 text-blue-600 text-sm font-medium bg-blue-50 py-1 px-2 rounded zoom-invariant">
              Rendering page {currentPage}...
            </div>
          )}
          
          <div
            className="pdf-canvas-wrapper"
            style={{
              maxWidth: 'none', // Remove max-width constraint to prevent clipping
              margin: '0 auto',
              overflow: 'visible' // Ensure content isn't clipped
            }}
          >
            {/* Use a wrapper div with padding to ensure margins are visible */}
            <div
              style={{
                width: viewport.width + 'px',
                height: viewport.height + 'px',
                position: 'relative',
                padding: '1px', // Tiny padding to prevent edge clipping
                margin: '10px' // Add margin to ensure content isn't cut off
              }}
            >
              {/* Base PDF Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0"
                width={viewport.width}
                height={viewport.height}
                style={{
                  width: viewport.width + 'px',
                  height: viewport.height + 'px',
                }}
              />
              {/* Annotation Canvas */}
              <AnnotationCanvas
                documentId={documentId}
                pageNumber={currentPage}
                scale={scale}
                width={viewport.width}
                height={viewport.height}
              />
            </div>
          </div>
        </div>
      </div>
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide onClose={() => setIsShortcutGuideOpen(false)} />
      )}
    </>
  );
};
