import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { PDFControls } from "./PDFViewer/PDFControls";
import { usePDFDocument } from "../hooks/usePDFDocument";
import { usePDFPage } from "../hooks/usePDFPage";
import { PDFPageProxy } from "pdfjs-dist";
import { Annotation, AnnotationType, Point } from "../types/annotation";
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
import { jsPDF } from "jspdf";

interface PDFViewerProps {
  file: File | string;
  documentId: string;
}

// Add these outside the component to persist between renders and track loads
const alreadyRenderedFiles = new Map<string, Set<number>>();
const fileLoadTimestamps = new Map<string, number>();
let currentlyRenderingFile: string | null = null;

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
  
  // Add missing refs
  const renderTaskRef = useRef<any>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderLockRef = useRef<boolean>(false);
  const renderCooldownActiveRef = useRef<boolean>(false);
  const renderAttemptTimestampRef = useRef<number>(0);
  const initializationStartedRef = useRef<boolean>(false);
  
  // State declarations
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState<boolean>(false);
  const [renderAttempts, setRenderAttempts] = useState(0);
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const [scale, setScale] = useState(1.2);
  const [pageChangeInProgress, setPageChangeInProgress] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Track which pages have been rendered to prevent duplicates
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const initialRenderCompletedRef = useRef<boolean>(false);
  const disableFitToWidthRef = useRef<boolean>(false);
  const hasRenderedOnceRef = useRef<{[pageNum: number]: boolean}>({});
  
  // Track page changes to prevent multiple renders
  const lastRenderedPageRef = useRef<number>(0);
  
  const { showToast } = useToast();
  const annotationStore = useAnnotationStore();
  
  const { currentTool } = useAnnotationStore();
  
  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    error: string | null;
  }>({
    loading: false,
    error: null,
  });

  const { isShortcutGuideOpen, setIsShortcutGuideOpen } =
    useKeyboardShortcutGuide();

  // Add this state variable at the top with other state declarations
  const [currentAnnotations, setCurrentAnnotations] = useState<any[]>([]);

  // Early file identification
  const fileId = useMemo(() => {
    if (!file) {
      return "empty_file";
    }
    return typeof file === 'string' ? file : `${file.name}_${file.size}_${file.lastModified}`;
  }, [file]);

  // PDF document and page hooks
  const { pdf, error: pdfError, isLoading: isPdfLoading } = usePDFDocument(pdfFile);
  const { page, error: pageError, isLoading: isPageLoading } = usePDFPage(pdf, currentPage, scale);

  // Get viewport dimensions for the current page
  const viewport = useMemo(() => {
    if (!page) return { width: 800, height: 600 };
    return page.getViewport({ scale });
  }, [page, scale]);

  // Function to center the document in the view
  const scrollToCenterDocument = useCallback(() => {
    if (!containerRef.current || !page) return;
    
    const container = containerRef.current;
    const scrollContainer = container.querySelector('.overflow-auto');
    if (!scrollContainer) return;
    
    // Calculate center position
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    const contentWidth = viewport.width;
    const contentHeight = viewport.height;
    
    // Calculate scroll positions
    const scrollLeft = Math.max(0, (contentWidth - viewportWidth) / 2);
    const scrollTop = Math.max(0, (contentHeight - viewportHeight) / 2);
    
    // Scroll to center
    scrollContainer.scrollLeft = scrollLeft;
    scrollContainer.scrollTop = scrollTop;
    
    console.log(`[PDFViewer] Centered document: scrollLeft=${scrollLeft}, scrollTop=${scrollTop}`);
  }, [page, viewport]);

  // Helper function to get annotations for a specific page
  const getAnnotationsForPage = useCallback((documentId: string, pageNumber: number) => {
    // Get all annotations for the document
    const documentAnnotations = annotationStore.documents[documentId]?.annotations || [];
    
    // Filter annotations for this specific page
    return documentAnnotations.filter(annotation => annotation.pageNumber === pageNumber);
  }, [annotationStore.documents]);

  // Update the navigation handlers
  const handlePrevPage = useCallback(() => {
    // Don't allow navigation while exporting
    if (isExporting) {
      console.log('[PDFViewer] Navigation ignored - export in progress');
      return;
    }
    
    // Check if we can navigate to the previous page
    const prevPage = Math.max(currentPage - 1, 1);
    if (prevPage === currentPage) {
      return; // Already on first page
    }
    
    // If we're currently changing pages or rendering, we'll queue this navigation
    if (pageChangeInProgress || isRendering) {
      // If page change is already in progress but seems stuck, force clear it
      if (pageChangeInProgress) {
        const timeSinceLastChange = Date.now() - renderAttemptTimestampRef.current;
        if (timeSinceLastChange > 2000) { // If it's been stuck for more than 2 seconds
          console.log('[PDFViewer] Forcing navigation despite page change in progress');
          // Cancel any current render
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
              console.error('[PDFViewer] Error cancelling render task:', error);
            }
          }
          renderLockRef.current = false;
        } else {
          console.log('[PDFViewer] Navigation ignored - page change already in progress');
          return;
        }
      } else {
        console.log('[PDFViewer] Navigation ignored - rendering in progress');
        return;
      }
    }
    
    console.log('[PDFViewer] Navigating to previous page:', prevPage);
    
    // Cancel any current render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (error) {
        console.error('[PDFViewer] Error cancelling render task:', error);
      }
      renderTaskRef.current = null;
    }
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    
    // Set flags to indicate page change is in progress
    setPageChangeInProgress(true);
    setIsRendering(false); // Reset any existing render state
    
    // Change the page
    setCurrentPage(prevPage);
  }, [currentPage, isExporting, pageChangeInProgress, isRendering]);

  const handleNextPage = useCallback(() => {
    // Don't allow navigation while exporting
    if (isExporting) {
      console.log('[PDFViewer] Navigation ignored - export in progress');
      return;
    }
    
    // Check if we can navigate to the next page
    const nextPage = Math.min(currentPage + 1, pdf?.numPages || currentPage);
    if (nextPage === currentPage) {
      return; // Already on last page
    }
    
    // If we're currently changing pages or rendering, we'll queue this navigation
    if (pageChangeInProgress || isRendering) {
      // If page change is already in progress but seems stuck, force clear it
      if (pageChangeInProgress) {
        const timeSinceLastChange = Date.now() - renderAttemptTimestampRef.current;
        if (timeSinceLastChange > 2000) { // If it's been stuck for more than 2 seconds
          console.log('[PDFViewer] Forcing navigation despite page change in progress');
          // Cancel any current render
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
              console.error('[PDFViewer] Error cancelling render task:', error);
            }
          }
          renderLockRef.current = false;
        } else {
          console.log('[PDFViewer] Navigation ignored - page change already in progress');
          return;
        }
      } else {
        console.log('[PDFViewer] Navigation ignored - rendering in progress');
        return;
      }
    }
    
    console.log('[PDFViewer] Navigating to next page:', nextPage);
    
    // Cancel any current render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (error) {
        console.error('[PDFViewer] Error cancelling render task:', error);
      }
      renderTaskRef.current = null;
    }
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    
    // Set flags to indicate page change is in progress
    setPageChangeInProgress(true);
    setIsRendering(false); // Reset any existing render state
    
    // Change the page
    setCurrentPage(nextPage);
  }, [currentPage, pdf?.numPages, isExporting, pageChangeInProgress, isRendering]);

  // Add this at the top, right after refs
  let hasLoggedRenderSkip = false;

  // Update the renderPdfPage function to properly reset pageChangeInProgress
  const renderPdfPage = useCallback(() => {
    try {
      // Skip if we're in the middle of a page change or the page is not properly set
      if (!currentPage) {
        return;
      }

      // Check if render lock is active, which prevents overlapping renders
      if (renderLockRef.current) {
        return;
      }

      // Skip if we don't have all the required elements
      if (!canvasRef.current || !pdf || !fileId) {
        // If we're in the middle of a page change but we don't have required elements,
        // we should reset the flag to avoid getting stuck
        if (pageChangeInProgress) {
          console.log('[PDFViewer] Resetting page change state - missing required elements');
          setPageChangeInProgress(false);
        }
        return;
      }

      // Get canvas context - if this fails, we can't render
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[PDFViewer] Failed to get canvas context');
        setPageChangeInProgress(false); // Reset page change state if we can't get context
        return;
      }

      // Cancel any in-progress render tasks
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      // Set render lock to prevent overlapping renders
      renderLockRef.current = true;
      
      // Set state to indicate rendering is in progress
      setIsRendering(true);
      
      // Log only when starting a new render (not for retries)
      console.log(`[PDFViewer] Rendering page ${currentPage}`);

      // Get the PDF page
      pdf.getPage(currentPage).then(
        (page) => {
          try {
            // Set up viewport
            let viewport = page.getViewport({ scale: 1 });
            const containerWidth = containerRef.current?.clientWidth || 800;
            const containerHeight = containerRef.current?.clientHeight || 1200;
            
            // Calculate scale to fit the container
            const widthScale = containerWidth / viewport.width;
            const heightScale = containerHeight / viewport.height;
            const scale = Math.min(widthScale, heightScale) * 0.95;
            
            viewport = page.getViewport({ scale });

            // Set canvas dimensions
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Define render parameters
            const renderContext = {
              canvasContext: ctx,
              viewport: viewport,
            };

            // Start the render task
            renderTaskRef.current = page.render(renderContext);
            
            // Handle successful render
            renderTaskRef.current.promise.then(
              () => {
                // Reset render lock
                renderLockRef.current = false;
                
                // Get annotations for the current page
                let annotations: any[] = [];
                try {
                  // Check if documentId and current page are available
                  if (documentId && currentPage) {
                    // Get annotations from the document annotations for this page
                    annotations = annotationStore.documents[documentId]?.annotations?.filter(
                      (a: any) => a.pageNumber === currentPage
                    ) || [];
                  }
                } catch (err) {
                  console.warn('[PDFViewer] Error accessing annotations:', err);
                }
                
                // Trigger annotation rendering if needed
                setCurrentAnnotations(annotations);
                
                // Dispatch annotation rendering event
                document.dispatchEvent(
                  new CustomEvent('renderAnnotations', {
                    detail: { 
                      pageNumber: currentPage,
                      annotations 
                    },
                  })
                );
                
                // Mark this page as rendered
                if (!hasRenderedOnceRef.current[currentPage]) {
                  hasRenderedOnceRef.current[currentPage] = true;
                }
                renderedPagesRef.current.add(currentPage);
                if (alreadyRenderedFiles.has(fileId)) {
                  alreadyRenderedFiles.get(fileId)?.add(currentPage);
                }
                
                // Page change and rendering are complete
                setPageChangeInProgress(false);
                setIsRendering(false);
                setRenderComplete(true);
                
                // Center the document after a brief delay to ensure UI is updated
                setTimeout(() => {
                  scrollToCenterDocument();
                }, 50);
              },
              (error: Error) => {
                // Handle render failure
                console.error(`[PDFViewer] Error rendering page ${currentPage}:`, error);
                
                // Reset all state flags on error
                renderLockRef.current = false;
                setIsRendering(false);
                setPageChangeInProgress(false);
                
                // Clear any previous timeout
                if (renderTimeoutRef.current) {
                  clearTimeout(renderTimeoutRef.current);
                  renderTimeoutRef.current = null;
                }
              }
            );
          } catch (err) {
            console.error('[PDFViewer] Error setting up render:', err);
            renderLockRef.current = false;
            setIsRendering(false);
            setPageChangeInProgress(false);
          }
        },
        (error) => {
          console.error(`[PDFViewer] Failed to get page ${currentPage}:`, error);
          renderLockRef.current = false;
          setIsRendering(false);
          setPageChangeInProgress(false);
        }
      );
    } catch (err) {
      console.error('[PDFViewer] Exception during render:', err);
      renderLockRef.current = false;
      setIsRendering(false);
      setPageChangeInProgress(false);
    }
  }, [pdf, currentPage, fileId, pageChangeInProgress, setIsRendering, annotationStore, setCurrentAnnotations, documentId, scrollToCenterDocument, setRenderComplete]);

  // Update the useEffect for page changes
  useEffect(() => {
    // Skip if we don't have a valid page or file
    if (!currentPage || !pdf || !fileId) {
      return;
    }
    
    // Check if PDF document is still valid
    if (!pdf.numPages) {
      console.error('[PDFViewer] PDF document is no longer valid');
      setPageChangeInProgress(false); // Clear page change state if PDF is invalid
      return;
    }
    
    // Set a timeout to force clear the page change flag if it gets stuck
    const pageChangeTimeout = setTimeout(() => {
      if (pageChangeInProgress) {
        console.log('[PDFViewer] Force clearing page change state after timeout');
        setPageChangeInProgress(false);
      }
    }, 5000); // 5 second safety timeout
    
    // Always attempt to render when the page changes
    if (pageChangeInProgress) {
      console.log(`[PDFViewer] Page change detected to page ${currentPage}, starting render`);
      
      // Reset render tracking state for the new page to force a fresh render
      hasRenderedOnceRef.current[currentPage] = false;
      renderedPagesRef.current.delete(currentPage);
      
      // Allow a small delay for the page change state to take effect before rendering
      setTimeout(() => {
        // Start the render process
        renderPdfPage();
      }, 50);
    }
    
    return () => {
      // Clean up the safety timeout when the effect is cleaned up
      clearTimeout(pageChangeTimeout);
    };
  }, [currentPage, pdf, fileId, pageChangeInProgress, renderPdfPage]);

  // Update the useEffect for rendering the PDF page
  useEffect(() => {
    // Skip if there's no valid page to render or necessary components
    if (!page || !canvasRef.current || !fileId || !pdf) {
      return;
    }
    
    // If we were navigating to this page, the dedicated page change effect will handle it
    if (pageChangeInProgress) {
      return;
    }
    
    // Don't render if there's an active render
    if (isRendering || renderLockRef.current) {
      console.log("[PDFViewer] Skipping render - already in progress");
      return;
    }
    
    // Check for annotation-only updates from AnnotationCanvas
    const annotationCanvas = document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
    const isAnnotationUpdate = annotationCanvas?.dataset?.forceRender === 'true';
    
    // Only skip rendering if this isn't an annotation update and the page has already been rendered
    if (!isAnnotationUpdate && 
        hasRenderedOnceRef.current[currentPage] && 
        (renderedPagesRef.current.has(currentPage) || 
          alreadyRenderedFiles.get(fileId)?.has(currentPage))) {
      
      // Ensure state is set correctly
      setRenderComplete(true);
      setIsRendering(false);
      
      // Make sure the page is centered
      setTimeout(() => {
        scrollToCenterDocument();
      }, 100);
      
      return;
    }
    
    // Start the rendering process
    setIsRendering(true);
    
    // Log rendering reason
    if (isAnnotationUpdate) {
      console.log(`[PDFViewer] Rendering page ${currentPage} for annotation update`);
    } else {
      console.log(`[PDFViewer] Rendering page ${currentPage} (initial or forced render)`);
    }
    
    // Initialize file tracking if needed
    if (!alreadyRenderedFiles.has(fileId)) {
      alreadyRenderedFiles.set(fileId, new Set());
    }
    
    // Render the PDF page
    renderPdfPage();
  }, [page, canvasRef, renderPdfPage, isRendering, pageChangeInProgress, fileId, pdf, currentPage, scrollToCenterDocument]);

  // Mark viewer as ready when the PDF is loaded
  useEffect(() => {
    if (!pdf) {
      setIsViewerReady(false);
      return;
    }
    
    console.log(`[PDFViewer] PDF document loaded with ${pdf.numPages} pages`);
    
    // Mark the viewer as ready
    setIsViewerReady(true);
    
    // Reset render state to ensure first page renders properly
    setRenderComplete(false);
    setIsRendering(false);
    
  }, [pdf]);

  // Setup container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateContainerSize = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const { width, height } = container.getBoundingClientRect();
      setContainerWidth(width);
      setContainerHeight(height);
    };
    
    // Initial size
    updateContainerSize();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

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

  // Export current page with annotations
  const handleExportCurrentPage = useCallback(async (format: "png" | "pdf" = "pdf") => {
    if (!page || !canvasRef.current || !viewport) {
      showToast("Cannot export - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get annotations for the current page from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const pageAnnotations = currentDoc?.annotations?.filter(
        a => a.pageNumber === currentPage
      ) || [];
      
      console.log(`[PDFViewer] Exporting page ${currentPage} with ${pageAnnotations.length} annotations`);
      
      // Create a canvas with both PDF and annotations
      const exportCanvas = await createExportCanvas(
        page, 
        scale, 
        pageAnnotations
      );

      // Ensure annotations are drawn at the correct scale
      if (pageAnnotations.length > 0) {
        const ctx = exportCanvas.canvas.getContext('2d');
        if (ctx) {
          // Draw annotations on top of the PDF content
          pageAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, scale);
            } catch (error) {
              console.error("Error drawing annotation for export:", error, annotation);
            }
          });
        }
      }
      
      if (format === "pdf") {
        // Export to PDF with correct dimensions
        exportToPDF(
          exportCanvas.canvas, 
          { width: viewport.width, height: viewport.height },
          currentPage
        );
        showToast("PDF exported successfully with annotations", "success");
      } else {
        // Export to PNG
        exportToPNG(exportCanvas.canvas, currentPage);
        showToast("PNG exported successfully with annotations", "success");
      }
    } catch (error) {
      console.error("Export error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [page, canvasRef, viewport, scale, currentPage, document, documentId, showToast]);
  
  // Export all annotations as JSON
  const handleExportAnnotations = useCallback(() => {
    try {
      // Get all annotations for the current document from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const allAnnotations = currentDoc?.annotations || [];
      
      if (allAnnotations.length === 0) {
        showToast("No annotations to export", "success");
        return;
      }
      
      exportAnnotations(allAnnotations, documentId);
      showToast("Annotations exported successfully", "success");
    } catch (error) {
      console.error("Export annotations error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  }, [document, documentId, showToast]);
  
  // Import annotations from JSON file
  const handleImportAnnotations = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setImportStatus({ loading: true, error: null });
      
      try {
        const importedAnnotations = await importAnnotations(file);
        
        // Add imported annotations to the store
        const store = useAnnotationStore.getState();
        importedAnnotations.forEach(annotation => {
          store.addAnnotation(documentId, annotation);
        });
        
        showToast(`Imported ${importedAnnotations.length} annotations`, "success");
      } catch (error) {
        console.error("Import error:", error);
        setImportStatus({ loading: false, error: error instanceof Error ? error.message : 'Unknown error' });
        showToast(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      } finally {
        setImportStatus({ loading: false, error: null });
      }
    };
    
    input.click();
  }, [documentId, showToast]);

  // Remove zoom functions
  
  const handleFitToWidth = useCallback(() => {
    if (!containerRef.current || !page) return;
    
    const containerWidth = containerRef.current.clientWidth - 32; // Subtract padding
    const viewport = page.getViewport({ scale: 1.0 });
    const newScale = containerWidth / viewport.width;
    setScale(newScale);
  }, [page]);

  // Function to generate a canvas with PDF content and annotations
  const createAnnotatedCanvas = useCallback(async (targetPage: PDFPageProxy, annotations: Annotation[]) => {
    // Create a new canvas for exporting
    const exportCanvas = document.createElement("canvas");
    const viewport = targetPage.getViewport({ scale });
    exportCanvas.width = viewport.width;
    exportCanvas.height = viewport.height;
    
    // Get 2D context with alpha support for better annotation rendering
    const ctx = exportCanvas.getContext("2d", { alpha: true })!;
    
    // Set white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Render PDF
    console.log(`[PDFViewer] Rendering PDF content to export canvas`);
    const renderTask = targetPage.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: "display"
    });
    
    // Wait for PDF rendering to complete
    await renderTask.promise;
    
    // Now draw annotations on top
    console.log(`[PDFViewer] Drawing ${annotations.length} annotations on export canvas`);
    
    // First draw non-highlight annotations
    const regularAnnotations = annotations.filter(a => a.type !== 'highlight');
    regularAnnotations.forEach(annotation => {
      try {
        drawAnnotation(ctx, annotation, scale);
      } catch (err) {
        console.error("Error drawing annotation during export:", err);
      }
    });
    
    // Then draw highlights with multiply blend mode
    const highlightAnnotations = annotations.filter(a => a.type === 'highlight');
    if (highlightAnnotations.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      
      highlightAnnotations.forEach(annotation => {
        try {
          drawAnnotation(ctx, annotation, scale);
        } catch (err) {
          console.error("Error drawing highlight during export:", err);
        }
      });
      
      ctx.restore();
    }
    
    return { canvas: exportCanvas, viewport };
  }, [scale]);
  
  // Export all pages with annotations
  const handleExportAllPages = useCallback(async () => {
    if (!pdf || !canvasRef.current || !viewport) {
      showToast("Cannot export - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get all annotations from the store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      if (!currentDoc) {
        showToast("Document not found in store", "error");
        return;
      }
      
      // Create a PDF with multiple pages
      const multiPagePdf = new jsPDF({
        orientation: viewport.width > viewport.height ? "landscape" : "portrait",
        unit: "px",
        format: [viewport.width, viewport.height],
      });
      
      showToast("Starting export of all pages with annotations...", "success");
      
      // Export each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Get the page
          const pageObj = await pdf.getPage(pageNum);
          
          // Get annotations for this page
          const pageAnnotations = currentDoc.annotations.filter(
            (a: Annotation) => a.pageNumber === pageNum
          );
          
          // Create a canvas with both PDF and annotations using our improved function
          const exportCanvas = await createAnnotatedCanvas(pageObj, pageAnnotations);
          
          // If not the first page, add a new page to the PDF
          if (pageNum > 1) {
            multiPagePdf.addPage([viewport.width, viewport.height]);
          }
          
          // Add the page with annotations
          multiPagePdf.addImage(
            exportCanvas.canvas.toDataURL("image/png", 1.0),
            "PNG",
            0,
            0,
            viewport.width,
            viewport.height
          );
          
          // Update progress through console
          console.log(`Processed page ${pageNum} of ${pdf.numPages} with ${pageAnnotations.length} annotations`);
        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          showToast(`Error on page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      }
      
      // Save the complete PDF with a timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      multiPagePdf.save(`${documentId}-annotated-${timestamp}.pdf`);
      showToast("All pages exported successfully with annotations", "success");
    } catch (error) {
      console.error("Export all pages error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, canvasRef, viewport, scale, document, documentId, showToast, createAnnotatedCanvas]);

  // Set up event listeners
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Variable to track scheduled renders
    let renderTimeout: NodeJS.Timeout | null = null;
    let lastRenderTime = 0;
    const RENDER_COOLDOWN = 100; // Even shorter cooldown (ms) for more responsive feedback
    
    // Function to handle annotation changes
    const handleAnnotationChange = (event: CustomEvent) => {
      // Get event details
      const source = event.detail.source || 'unknown';
      const targetPageNumber = event.detail.pageNumber || currentPage;
      const forceRender = event.detail.forceRender === true;
      
      console.log(`[PDFViewer] Annotation change detected from ${source} for page ${targetPageNumber}`);
      
      // User interactions should always trigger a render
      const isUserInteraction = source === 'userDrawing' || source === 'userEdit' || 
                               source === 'userAction' || forceRender;
      
      // If there's a pending render timeout, clear it
      if (renderTimeout) {
        clearTimeout(renderTimeout);
        renderTimeout = null;
      }
      
      // If this is from user interaction, render immediately
      if (isUserInteraction) {
        console.log(`[PDFViewer] Processing immediate render for user interaction (${source})`);
        lastRenderTime = Date.now();
        
        // Only render if the event is for the current page
        if (targetPageNumber === currentPage) {
          // Force a fresh render
          hasRenderedOnceRef.current[currentPage] = false;
          renderedPagesRef.current.delete(currentPage);
          
          // Immediate render - even shorter delay
          setTimeout(() => {
            renderPdfPage();
          }, 0); // Immediate execution in next tick
        }
        return;
      }
      
      // Shorter cooldown time for all other events
      const now = Date.now();
      if (now - lastRenderTime < RENDER_COOLDOWN) {
        console.log(`[PDFViewer] Throttling render due to cooldown (${now - lastRenderTime}ms)`);
        
        // Schedule with shorter delay
        renderTimeout = setTimeout(() => {
          console.log('[PDFViewer] Executing delayed render after cooldown');
          lastRenderTime = Date.now();
          
          if (targetPageNumber === currentPage) {
            hasRenderedOnceRef.current[currentPage] = false;
            renderedPagesRef.current.delete(currentPage);
            renderPdfPage();
          }
        }, 50); // Very short delay for better responsiveness
        
        return;
      }
      
      // Update the last render time
      lastRenderTime = now;
      
      // If we're on the page that was modified, render immediately
      if (targetPageNumber === currentPage) {
        console.log(`[PDFViewer] Triggering regular render for non-user change (${source})`);
        
        hasRenderedOnceRef.current[currentPage] = false;
        renderedPagesRef.current.delete(currentPage);
        
        // Set force render flag on annotation canvas
        const annotationCanvas = document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
        if (annotationCanvas) {
          annotationCanvas.dataset.forceRender = 'true';
        }
        
        // Immediate render
        setTimeout(() => {
          renderPdfPage();
        }, 0);
      }
    };
    
    // Add event listeners to multiple sources to ensure we catch all events
    containerRef.current.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    // Also listen on document body for events that might bubble up there
    document.body.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    // Cleanup function
    return () => {
      // Remove event listeners
      containerRef.current?.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
      document.body.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
      
      // Clear any pending timeouts
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
    };
  }, [canvasRef, containerRef, currentPage, pageChangeInProgress, renderPdfPage, isRendering]);

  // Function to verify annotation integrity
  const verifyAnnotationIntegrity = useCallback((documentId: string, pageNumber: number) => {
    // Get annotations for this page
    const annotations = getAnnotationsForPage(documentId, pageNumber);
    
    // Check if annotations are valid
    const invalidAnnotations = annotations.filter(annotation => {
      // Check for required properties
      if (!annotation.id || !annotation.type || !annotation.pageNumber) {
        console.error('[PDFViewer] Invalid annotation found:', annotation);
        return true;
      }
      
      // Check for valid coordinates
      if (annotation.type !== 'text') {
        if (!annotation.points || annotation.points.length === 0) {
          console.error('[PDFViewer] Annotation missing points:', annotation);
          return true;
        }
        
        // Check if points are within page bounds
        if (page && viewport) {
          const outOfBounds = annotation.points.some(point => 
            point.x < 0 || point.x > viewport.width || 
            point.y < 0 || point.y > viewport.height
          );
          
          if (outOfBounds) {
            console.warn('[PDFViewer] Annotation has out-of-bounds points:', annotation);
            // We don't mark these as invalid, just log a warning
          }
        }
      }
      
      return false;
    });
    
    if (invalidAnnotations.length > 0) {
      console.warn(`[PDFViewer] Found ${invalidAnnotations.length} invalid annotations on page ${pageNumber}`);
      showToast(`Found ${invalidAnnotations.length} invalid annotations. They may not display correctly.`, "error");
      return false;
    }
    
    console.log(`[PDFViewer] All ${annotations.length} annotations on page ${pageNumber} are valid`);
    return true;
  }, [getAnnotationsForPage, page, viewport, showToast]);
  
  // Effect to verify annotations when page changes
  useEffect(() => {
    if (pdf && documentId) {
      // Verify annotations for the current page
      verifyAnnotationIntegrity(documentId, currentPage);
    }
  }, [currentPage, pdf, documentId, verifyAnnotationIntegrity]);

  // Function to verify PDF integrity
  const verifyPDFIntegrity = useCallback(async () => {
    if (!pdf) return false;
    
    try {
      // Check if document can be accessed
      const metadata = await pdf.getMetadata();
      const title = metadata?.info ? (metadata.info as any).Title || 'Untitled' : 'Untitled';
      console.log('[PDFViewer] PDF metadata verified:', title);
      
      // Verify page access - check first, middle and last page
      const numPages = pdf.numPages;
      const pagesToCheck = [1, Math.ceil(numPages / 2), numPages];
      
      for (const pageNum of pagesToCheck) {
        try {
          await pdf.getPage(pageNum);
        } catch (error) {
          console.error(`[PDFViewer] Failed to access page ${pageNum}:`, error);
          showToast(`Error accessing page ${pageNum}. The PDF may be corrupted.`, "error");
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('[PDFViewer] PDF integrity check failed:', error);
      showToast('PDF integrity check failed. The document may be corrupted.', "error");
      return false;
    }
  }, [pdf, showToast]);

  // Reset loading state when file changes
  useEffect(() => {
    // Don't do anything if there's no file
    if (!file) {
      console.log('[PDFViewer] No file provided, skipping load');
      return;
    }
    
    // Generate a unique ID for this file
    const currentFileId = typeof file === 'string' ? file : `${file.name}_${file.lastModified}`;
    
    console.log(`[PDFViewer] Processing file: ${currentFileId}`);
    
    // Clear state for a fresh load
    setHasStartedLoading(false);
    setCurrentPage(1);
    setRenderError(null);
    
    // Reset render tracking
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    
    // Simple load process with retry
    const loadPdf = () => {
      console.log(`[PDFViewer] Loading PDF file: ${currentFileId}`);
      
      if (typeof file === "string") {
        // For URL, fetch it first
        fetch(file)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch PDF: ${response.status}`);
            }
            return response.blob();
          })
          .then(blob => {
            const pdfFile = new File([blob], file.split('/').pop() || 'document.pdf', { type: 'application/pdf' });
            setPdfFile(pdfFile);
            setHasStartedLoading(true);
          })
          .catch(error => {
            console.error('[PDFViewer] Error loading PDF from URL:', error);
            setRenderError(error instanceof Error ? error : new Error(String(error)));
            // Try once more with a different approach if it failed
            setTimeout(() => {
              setPdfFile(null);
              setPdfFile(file as any); // Try direct loading via string as fallback
            }, 500);
          });
      } else {
        // For File object, load directly
        setPdfFile(null); // Clear first
        setTimeout(() => {
          setPdfFile(file);
          setHasStartedLoading(true);
        }, 50);
      }
    };
    
    // Attempt to load the PDF
    loadPdf();
    
    // Cleanup function
    return () => {
      // If we need to cancel any pending operations, do it here
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (error) {
          console.error('[PDFViewer] Error cancelling render task:', error);
        }
        renderTaskRef.current = null;
      }
    };
  }, [file]); // Only depend on file to prevent loops

  // Effect to handle PDF document loading and verification
  useEffect(() => {
    if (!pdf) return;
    
    // Limit the frequency of log messages to prevent spam
    const now = Date.now();
    const lastLog = pdfLoadLogTimestampRef.current;
    if (now - lastLog < 1000) {
      // Don't log if less than 1 second since last log
      return;
    }
    pdfLoadLogTimestampRef.current = now;
    
    console.log("[PDFViewer] PDF document loaded successfully:", pdf.numPages, "pages");
    
    // Verify PDF integrity only if not already verified for this document
    if (!pdfVerifiedRef.current) {
      verifyPDFIntegrity().then(isValid => {
        if (isValid) {
          console.log('[PDFViewer] PDF integrity check passed');
          pdfVerifiedRef.current = true;
          
          // Set the document ID in the annotation store to load annotations
          annotationStore.setCurrentDocument(documentId);
          
          // Force render of first page with annotations (if renderPdfPage exists)
          if (typeof renderPdfPage === 'function') {
            // Clear any previous render lock that might be blocking rendering
            renderLockRef.current = false;
            
            // Only trigger render if we're not already rendering
            if (!isRendering && !pageChangeInProgress) {
              console.log("[PDFViewer] Triggering initial render");
              setTimeout(() => {
                renderPdfPage();
              }, 100); // Small delay to ensure everything is ready
            }
          }
        }
      });
    }
  }, [pdf, documentId, annotationStore, verifyPDFIntegrity, isRendering, pageChangeInProgress, renderPdfPage]);

  // Add these refs near the top with other refs
  const pdfLoadLogTimestampRef = useRef<number>(0);
  const pdfVerifiedRef = useRef<boolean>(false);

  // Function to handle stamp annotations
  const handleStampAnnotation = useCallback((event: MouseEvent) => {
    // Only process if current tool is a stamp type
    if (!currentTool || !['stamp', 'stampApproved', 'stampRejected', 'stampRevision'].includes(currentTool)) {
      return;
    }

    // Get canvas and container references
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container || !pdf || !page || !viewport) {
      console.warn('[PDFViewer] Cannot create stamp: canvas, container, pdf, page or viewport is missing');
      return;
    }

    // Get relative mouse position on canvas
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left);
    const y = (event.clientY - rect.top);

    // Convert to unscaled PDF coordinates
    let pointInPdfCoordinates: Point;
    
    // Check if viewport has convertToPdfPoint method
    if ('convertToPdfPoint' in viewport) {
      const pdfPoint = (viewport as any).convertToPdfPoint(x, y);
      pointInPdfCoordinates = {
        x: pdfPoint[0] / scale,
        y: pdfPoint[1] / scale
      };
    } else {
      // Fallback to standard conversion
      pointInPdfCoordinates = {
        x: x / scale,
        y: y / scale
      };
    }

    // Determine which stamp type to use based on the current tool
    let stampType: "approved" | "rejected" | "revision" = "approved";
    
    if (currentTool === 'stampRejected') {
      stampType = "rejected";
    } else if (currentTool === 'stampRevision') {
      stampType = "revision";
    }

    // Create the stamp annotation
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: currentTool as AnnotationType,
      points: [pointInPdfCoordinates],
      style: {
        color: currentTool === 'stampRejected' ? '#FF0000' : 
              currentTool === 'stampRevision' ? '#0000FF' : '#00AA00',
        lineWidth: 2,
        opacity: 1,
        stampType
      },
      pageNumber: currentPage,
      timestamp: Date.now(),
      userId: "current-user",
      version: 1,
    };

    // Add the annotation to the store
    annotationStore.addAnnotation(documentId, newAnnotation);

    // Dispatch event to ensure immediate rendering - try multiple approaches
    // Method 1: Dispatch to PDF container
    const pdfContainer = document.querySelector('.pdf-container') || document.querySelector('.pdf-container-fixed');
    if (pdfContainer) {
      const customEvent = new CustomEvent('annotationChanged', {
        detail: {
          pageNumber: currentPage,
          source: 'userDrawing',
          forceRender: true
        },
      });
      pdfContainer.dispatchEvent(customEvent);
      console.log('[PDFViewer] Stamp annotation added and event dispatched to container');
    }
    
    // Method 2: Dispatch to annotation canvas directly
    const annotationCanvas = document.querySelector('.annotation-canvas-container canvas');
    if (annotationCanvas) {
      // Set data attribute to force render
      (annotationCanvas as HTMLCanvasElement).dataset.forceRender = 'true';
      
      // Create and dispatch event
      const canvasEvent = new CustomEvent('annotationChanged', {
        detail: {
          pageNumber: currentPage,
          source: 'userDrawing',
          forceRender: true
        },
      });
      annotationCanvas.dispatchEvent(canvasEvent);
      console.log('[PDFViewer] Event dispatched to annotation canvas');
    }
    
    // Method 3: Directly trigger via document event
    document.dispatchEvent(new CustomEvent('annotationChanged', {
      detail: {
        pageNumber: currentPage,
        source: 'userDrawing',
        forceRender: true
      }
    }));
    
    // Reset rendered state to force a refresh
    if (hasRenderedOnceRef.current) {
      hasRenderedOnceRef.current[currentPage] = false;
    }
    renderedPagesRef.current.delete(currentPage);
    
    console.log('[PDFViewer] Stamp added successfully, triggered multiple render methods');
  }, [annotationStore, currentPage, currentTool, documentId, hasRenderedOnceRef, page, pdf, renderedPagesRef, scale, viewport]);
  
  // Add event listener for stamp tool when appropriate
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only add click listener if we're using a stamp tool
    if (['stamp', 'stampApproved', 'stampRejected', 'stampRevision'].includes(currentTool)) {
      canvas.addEventListener('click', handleStampAnnotation);
      
      // Update cursor to indicate stamp placement
      canvas.style.cursor = 'crosshair';
    }

    return () => {
      // Clean up event listener
      canvas.removeEventListener('click', handleStampAnnotation);
    };
  }, [currentTool, handleStampAnnotation]);

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
          onExportCurrentPage={handleExportCurrentPage}
          onExportAllPages={handleExportAllPages}
          onExportAnnotations={handleExportAnnotations}
          onImportAnnotations={handleImportAnnotations}
          onFitToWidth={handleFitToWidth}
        />
      )}
      
      {/* Page indicator for event targeting */}
      {pdf && (
        <div className="hidden">
          <span className="page-number-display">{`${currentPage} / ${pdf.numPages}`}</span>
          <div id="tool-change-indicator" data-tool-changed="false"></div>
        </div>
      )}

      <div className="pdf-container h-full flex-1 overflow-hidden" ref={containerRef}>
        {/* PDF Viewer - Fixed container with scrollable content */}
        <div className="relative flex-1 overflow-auto bg-gray-100 p-2 md:p-4">
          <div 
            className="pdf-viewer-container mx-auto"
            style={{
              width: page ? `${viewport.width}px` : `${containerWidth}px`,
              height: page ? `${viewport.height}px` : `${containerHeight}px`,
              position: 'relative',
              maxWidth: '100%',
              marginBottom: '20px',
              opacity: isRendering ? 0.7 : 1,
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
                {/* Always render the annotation canvas once the PDF is initially loaded */}
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
            
            {/* Loading indicator during rendering */}
            {(isRendering || pageChangeInProgress) && (
              <div className="absolute top-0 left-0 z-50 w-full h-full flex items-center justify-center bg-white bg-opacity-70">
                <div className="flex flex-col items-center bg-white p-4 rounded-lg shadow-lg">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-2"></div>
                  <div className="text-gray-700">
                    {pageChangeInProgress ? `Loading page ${currentPage}...` : 'Rendering PDF...'}
                  </div>
                  {renderAttempts > 0 && (
                    <div className="text-amber-600 text-xs mt-1">
                      Attempt {renderAttempts + 1}/3
                    </div>
                  )}
                </div>
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
