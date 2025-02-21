import { PDFPageProxy } from "pdfjs-dist";
import { Annotation } from "../types/annotation";
import { drawAnnotation } from "../components/canvas/drawingUtils";
import { jsPDF } from "jspdf";
import { useAnnotationStore } from "../store/useAnnotationStore";

export const createExportCanvas = async (
  page: PDFPageProxy,
  scale: number,
  annotations: Annotation[]
) => {
  const exportCanvas = document.createElement("canvas");
  const viewport = page.getViewport({ scale });
  exportCanvas.width = viewport.width;
  exportCanvas.height = viewport.height;
  const ctx = exportCanvas.getContext("2d")!;

  // Render the PDF page
  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  // Draw annotations
  annotations.forEach((annotation) => {
    drawAnnotation(ctx, annotation, scale);
  });

  return { canvas: exportCanvas, viewport };
};

export const exportToPNG = (canvas: HTMLCanvasElement, pageNumber: number) => {
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `page-${pageNumber}.png`;
  a.click();
};

export const exportToPDF = async (
  canvas: HTMLCanvasElement,
  viewport: { width: number; height: number },
  pageNumber: number
) => {
  const pdf = new jsPDF({
    orientation: viewport.width > viewport.height ? "landscape" : "portrait",
    unit: "px",
    format: [viewport.width, viewport.height],
  });

  // Add the page with annotations
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    viewport.width,
    viewport.height
  );

  // Save the PDF
  pdf.save(`annotated-page-${pageNumber}.pdf`);
};

// Export annotations to JSON
export const exportAnnotations = (
  annotations: Annotation[],
  documentId: string
) => {
  const data = JSON.stringify(annotations, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `annotations-${documentId}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

// Import annotations from JSON file
export const importAnnotations = async (file: File): Promise<Annotation[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const annotations = JSON.parse(e.target?.result as string);
        resolve(annotations);
      } catch (error) {
        reject(new Error("Failed to parse annotations file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

// Add function to save annotations separately
export const saveAnnotations = (documentId: string) => {
  const state = useAnnotationStore.getState();
  const document = state.documents[documentId];
  
  if (!document) return;

  try {
    const data = JSON.stringify({
      annotations: document.annotations,
      timestamp: Date.now(),
      version: 1,
    });

    localStorage.setItem(`annotations-${documentId}`, data);
  } catch (error) {
    console.error('Error saving annotations:', error);
  }
};

// Add function to load annotations
export const loadAnnotations = (documentId: string) => {
  try {
    const data = localStorage.getItem(`annotations-${documentId}`);
    if (!data) return null;

    const parsed = JSON.parse(data);
    return parsed.annotations;
  } catch (error) {
    console.error('Error loading annotations:', error);
    return null;
  }
};
