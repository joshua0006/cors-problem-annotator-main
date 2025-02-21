import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { uploadPdfToFolder } from "../services/uploadService";
import { Loader2 } from "lucide-react";

interface PdfUploaderProps {
  folderId: string;
  onUploadSuccess?: (result: {
    downloadUrl: string;
    documentId: string;
  }) => void;
  onUploadError?: (error: Error) => void;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({
  folderId,
  onUploadSuccess,
  onUploadError,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes("pdf")) {
      onUploadError?.(new Error("Please select a PDF file"));
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      onUploadError?.(new Error("File size must be less than 50MB"));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      const result = await uploadPdfToFolder(folderId, file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      onUploadSuccess?.(result);
    } catch (error) {
      onUploadError?.(error as Error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file && file.type === "application/pdf") {
        handleFileChange({
          target: { files: [file] },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    },
    [handleFileChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: false,
  });

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div
        {...getRootProps()}
        className={`
          w-full max-w-lg p-8 
          border-2 border-dashed rounded-lg 
          transition-colors duration-200 ease-in-out
          flex flex-col items-center justify-center
          cursor-pointer
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }
        `}
      >
        <input {...getInputProps()} />
        <Upload
          className={`w-12 h-12 mb-4 ${
            isDragActive ? "text-blue-500" : "text-gray-400"
          }`}
        />
        <p className="text-center text-gray-600">
          Drag & drop your PDF here
          <br />
          <span className="text-sm text-gray-500">or</span>
        </p>
        <button className="mt-2 text-blue-500 hover:text-blue-600 font-medium">
          Browse Files
        </button>
      </div>
    </div>
  );
};
