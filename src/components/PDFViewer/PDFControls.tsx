import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  Upload,
  FileDown,
  FileUp,
  HelpCircle,
} from "lucide-react";
import { useKeyboardShortcutGuide } from "../../hooks/useKeyboardShortcutGuide";

interface PDFControlsProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  isExporting: boolean;
  isImporting: boolean;
  importError: string | null;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExportCurrentPage: (format: "png" | "pdf") => void;
  onExportAllPages: () => void;
  onExportAnnotations: () => void;
  onImportAnnotations: (file: File) => void;
}

export const PDFControls: React.FC<PDFControlsProps> = ({
  currentPage,
  totalPages,
  scale,
  isExporting,
  isImporting,
  importError,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onExportCurrentPage,
  onExportAllPages,
  onExportAnnotations,
  onImportAnnotations,
}) => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onImportAnnotations(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex items-center justify-between p-2 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        <button
          onClick={onPrevPage}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors duration-200"
          disabled={currentPage === 1}
          title="Previous Page (Left Arrow)"
          aria-label="Previous Page"
        >
          <ChevronLeft className="text-gray-700" size={20} />
        </button>
        <span className="text-sm font-medium text-gray-700 select-none">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={onNextPage}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors duration-200"
          disabled={currentPage === totalPages}
          title="Next Page (Right Arrow)"
          aria-label="Next Page"
        >
          <ChevronRight className="text-gray-700" size={20} />
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsShortcutGuideOpen(true)}
          className="p-2 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-700"
          title="Show keyboard shortcuts (?)"
        >
          <HelpCircle size={20} />
        </button>
        <div className="h-6 w-px bg-gray-200" />
        <div className="relative group">
          <button className="p-1 rounded hover:bg-gray-100">
            <Download size={20} />
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border rounded shadow-lg p-1">
            <button
              onClick={() => onExportCurrentPage("png")}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
            >
              Export Page as PNG
            </button>
            <button
              onClick={() => onExportCurrentPage("pdf")}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
            >
              Export Page as PDF
            </button>
            <button
              onClick={onExportAllPages}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export All Pages"}
            </button>
          </div>
        </div>
        <button
          onClick={onExportAnnotations}
          className="p-1 rounded hover:bg-gray-100"
          title="Export Annotations"
        >
          <FileDown size={20} />
        </button>
        <button
          onClick={handleImportClick}
          className={`p-1 rounded hover:bg-gray-100 relative ${
            isImporting ? "opacity-50" : ""
          }`}
          title="Import Annotations"
          disabled={isImporting}
        >
          <FileUp size={20} />
          {isImporting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
        </button>
      </div>
      {importError && (
        <div className="absolute top-full right-0 mt-1 bg-red-100 text-red-600 text-sm p-2 rounded shadow">
          {importError}
        </div>
      )}
    </div>
  );
};
