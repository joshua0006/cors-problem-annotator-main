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
import { drawAnnotation } from "./canvas/drawingUtils";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useToast } from "../contexts/ToastContext";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";

interface PDFViewerProps {
  file: File | string;
  documentId: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, documentId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const { annotations, currentTool } = useAnnotationStore();

  const { pdf, error: pdfError } = usePDFDocument(file);
  const { page, error: pageError } = usePDFPage(pdf, currentPage, scale);
  const { showToast } = useToast();

  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    error: string | null;
  }>({
    loading: false,
    error: null,
  });

  const store = useAnnotationStore();

  const { isShortcutGuideOpen, setIsShortcutGuideOpen } =
    useKeyboardShortcutGuide();

  // Modify the useEffect that handles PDF page rendering to include auto-scaling
  useEffect(() => {
    if (!page || !canvasRef.current) return;

    // Use the default scale of 1.0 (100%)
    const scaledViewport = page.getViewport({ scale: 1.0 });
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport,
    };

    page.render(renderContext).promise.catch((error) => {
      console.error("Error rendering PDF page:", error);
    });
  }, [page]);

  // Update container dimensions effect to recalculate scale on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && page) {
        setContainerWidth(containerRef.current.clientWidth);
        setContainerHeight(containerRef.current.clientHeight);

        // Just update the container dimensions without changing the scale
        const viewport = page.getViewport({ scale });
        canvasRef.current!.width = viewport.width;
        canvasRef.current!.height = viewport.height;

        // Re-render the page with the current scale
        page
          .render({
            canvasContext: canvasRef.current!.getContext("2d")!,
            viewport,
          })
          .promise.catch((error) => {
            console.error("Error re-rendering PDF page:", error);
          });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [page, scale]);

  // Add keyboard shortcuts with documentId and current page
  useKeyboardShortcuts(documentId, currentPage);

  // Update cursor based on current tool
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cursorMap = {
      select: "default",
      freehand: "crosshair",
      line: "crosshair",
      arrow: "crosshair",
      rectangle: "crosshair",
      circle: "crosshair",
      text: "text",
      highlight: "crosshair",
      stamp: "crosshair",
    };

    container.style.cursor = cursorMap[currentTool] || "default";
  }, [currentTool]);

  const exportAllPages = async () => {
    if (!pdf) return;
    setIsExporting(true);

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "px",
      });

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        // Create temporary canvas for each page
        const tempCanvas = document.createElement("canvas");
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const ctx = tempCanvas.getContext("2d")!;

        // Render PDF page
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        // Draw annotations for this page
        const pageAnnotations = annotations.filter(
          (a) => a.pageNumber === pageNum
        );
        pageAnnotations.forEach((annotation) => {
          drawAnnotation(ctx, annotation, scale);
        });

        // Add page to PDF
        if (pageNum > 1) {
          doc.addPage([viewport.width, viewport.height]);
        }
        doc.addImage(
          tempCanvas.toDataURL("image/png"),
          "PNG",
          0,
          0,
          viewport.width,
          viewport.height
        );
      }

      doc.save("annotated-document.pdf");
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.5));
  const handleZoomReset = () => setScale(1);
  const handleNextPage = () =>
    setCurrentPage((p) => Math.min(p + 1, pdf?.numPages || p));
  const handlePrevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));

  const handleExportCurrentPage = async (format: "png" | "pdf") => {
    if (!page || !canvasRef.current) return;

    const pageAnnotations = annotations.filter(
      (a) => a.pageNumber === currentPage
    );
    const { canvas, viewport } = await createExportCanvas(
      page,
      scale,
      pageAnnotations
    );

    if (format === "png") {
      exportToPNG(canvas, currentPage);
    } else {
      await exportToPDF(canvas, viewport, currentPage);
    }
  };

  const handleExportAnnotations = () => {
    exportAnnotations(annotations, documentId);
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
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">Error loading PDF</p>
      </div>
    );
  }

  if (!pdf || !page) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading PDF...</p>
      </div>
    );
  }

  const viewport = page.getViewport({ scale });

  return (
    <>
      <div className="flex flex-col h-full" ref={containerRef}>
        {/* Controls Bar */}
        <div className="flex items-center justify-between p-2 border-b bg-white">
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
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div
            className="relative mx-auto bg-white shadow-lg"
            style={{
              width: viewport.width,
              height: viewport.height,
            }}
          >
            {/* Base PDF Canvas */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0"
              style={{
                width: viewport.width,
                height: viewport.height,
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
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide onClose={() => setIsShortcutGuideOpen(false)} />
      )}
    </>
  );
};
