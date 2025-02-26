import React, { useState } from "react";
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
  Maximize,
  RotateCcw,
  ChevronDown,
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
  onZoomReset: () => void;
  onFitToWidth: () => void;
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
  onZoomReset,
  onFitToWidth,
  onExportCurrentPage,
  onExportAllPages,
  onExportAnnotations,
  onImportAnnotations,
}) => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();
  const [showZoomOptions, setShowZoomOptions] = useState(false);

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

        <div className="h-6 w-px bg-gray-200 ml-1" />

        <div className="flex items-center gap-2 ml-1">
          <button
            onClick={onZoomOut}
            className="p-1 rounded hover:bg-gray-100"
            title="Zoom Out (-)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="text-gray-700" size={20} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[4rem] text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            className="p-1 rounded hover:bg-gray-100"
            title="Zoom In (+)"
            aria-label="Zoom In"
          >
            <ZoomIn className="text-gray-700" size={20} />
          </button>
          <div className="relative">
            <button
              onClick={onZoomReset}
              className="p-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors flex items-center"
              title="Reset Zoom (100%)"
              aria-label="Reset Zoom"
              onMouseEnter={() => setShowZoomOptions(true)}
              onMouseLeave={() => setShowZoomOptions(false)}
            >
              <RotateCcw className="text-blue-600" size={20} />
            </button>
            
            {showZoomOptions && (
              <div 
                className="absolute left-0 top-full mt-1 bg-white border rounded shadow-lg p-1 z-10"
                onMouseEnter={() => setShowZoomOptions(true)}
                onMouseLeave={() => setShowZoomOptions(false)}
              >
                <button
                  onClick={onZoomReset}
                  className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
                >
                  Reset to 100%
                </button>
                <button
                  onClick={onFitToWidth}
                  className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
                >
                  Fit to Width
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="h-6 w-px bg-gray-200" />
        
        <button
          onClick={() => setIsShortcutGuideOpen(true)}
          className="p-2 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-700"
          title="Show keyboard shortcuts (?)"
        >
          <HelpCircle size={20} />
        </button>
        
        <div className="h-6 w-px bg-gray-200" />
        
        <button
          onClick={onExportAllPages}
          className="p-1 rounded hover:bg-gray-100 bg-blue-50 transition-colors duration-200"
          title="Download PDF with annotations exactly as shown in the viewer"
          disabled={isExporting}
        >
          <Download size={20} className={isExporting ? "text-gray-400" : "text-blue-600"} />
          {isExporting && (
            <span className="ml-1 text-xs text-gray-500">Exporting...</span>
          )}
        </button>
        
        <div className="relative group">
          <button 
            className="p-1 rounded hover:bg-gray-100"
            title="More export options"
          >
            <FileDown size={20} className="text-gray-700" />
          </button>
          <div className="absolute left-0 top-full mt-1 hidden group-hover:block bg-white border rounded shadow-lg p-1 z-10 w-48">
            <div className="text-xs text-gray-500 px-3 py-1 border-b mb-1">Export Options:</div>
            <button
              onClick={() => onExportCurrentPage("png")}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
              title="Export current page as PNG image"
            >
              Export Page as PNG
            </button>
            <button
              onClick={() => onExportCurrentPage("pdf")}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
              title="Export current page as PDF document"
            >
              Export Page as PDF
            </button>
            <button
              onClick={onExportAnnotations}
              className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 rounded"
              title="Export annotations as JSON for sharing or backup"
            >
              Export Annotations
            </button>
          </div>
        </div>
        
        <button
          onClick={handleImportClick}
          className={`p-1 rounded hover:bg-gray-100 relative ${
            isImporting ? "opacity-50" : ""
          }`}
          title="Import Annotations"
          disabled={isImporting}
        >
          <FileUp size={20} className="text-gray-700" />
          {isImporting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
        </button>
      </div>
      
      <div></div>
      
      {importError && (
        <div className="absolute top-full right-0 mt-1 bg-red-100 text-red-600 text-sm p-2 rounded shadow">
          {importError}
        </div>
      )}
    </div>
  );
};
