import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  FileDown,
  FileUp,
  HelpCircle,
  Maximize,
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
  onFitToWidth,
  onExportCurrentPage,
  onExportAllPages,
  onExportAnnotations,
  onImportAnnotations,
}) => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        onImportAnnotations(files[0]);
      }
    };
    input.click();
  };

  return (
    <div className="bg-white border-b flex w-full items-center justify-between py-2 px-4 select-none">
      <div className="flex items-center">
        <div className="flex items-center">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className={`p-1 rounded ${
              currentPage <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
            }`}
            title="Previous Page (Left Arrow)"
            aria-label="Previous Page"
          >
            <ChevronLeft className="text-gray-700" size={20} />
          </button>
          <span className="mx-2 text-sm font-medium text-gray-700 min-w-[4rem] text-center">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className={`p-1 rounded ${
              currentPage >= totalPages ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
            }`}
            title="Next Page (Right Arrow)"
            aria-label="Next Page"
          >
            <ChevronRight className="text-gray-700" size={20} />
          </button>

          <div className="h-6 w-px bg-gray-200 ml-1" />
  
        </div>

        <div className="h-6 w-px bg-gray-200" />
        
        
        
        <div className="h-6 w-px bg-gray-200" />
        
        <button
          onClick={onExportAllPages}
          className="p-1 flex items-center gap-2 rounded hover:bg-blue-100 ml-2 transition-colors duration-200"
          title="Download PDF with annotations exactly as shown in the viewer"
          disabled={isExporting}
        >
          <Download size={20} className={isExporting ? "text-gray-400" : "text-blue-600"} /> Download PDF
          {isExporting && (
            <span className="ml-1 text-xs text-gray-500">Exporting...</span>
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
