import { Plus, FolderPlus, Upload, AlertCircle, Loader2, FileText, FolderOpen } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Document, Folder } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface DocumentActionsProps {
  projectId: string;
  currentFolderId?: string;
  folders: Folder[];
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (name: string, type: Document['type'], file: File, folderId?: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ['application/pdf'];

export default function DocumentActions({
  projectId,
  currentFolderId,
  folders,
  onCreateFolder,
  onCreateDocument,
  onRefresh
}: DocumentActionsProps) {
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [showFileInput, setShowFileInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(currentFolderId);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const folderInputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderInputRef.current && !folderInputRef.current.contains(event.target as Node)) {
        setShowFolderInput(false);
        setNewFolderName('');
        setError('');
      }
      if (fileInputRef.current && !fileInputRef.current.contains(event.target as Node)) {
        setShowFileInput(false);
        setSelectedFile(null);
        setNewFileName('');
        setError('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get available folders for selection
  const getAvailableFolders = (parentId?: string): Folder[] => {
    return folders.filter(folder => folder.parentId === parentId);
  };

  // Get folder path for display
  const getFolderPath = (folderId?: string): string => {
    if (!folderId) return 'Root';
    
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return 'Root';

    const path: string[] = [folder.name];
    let current = folder;
    
    while (current.parentId) {
      const parent = folders.find(f => f.id === current.parentId);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }

    return path.join(' / ');
  };

  const validateFile = (file: File): string | null => {
    if (!file.type && !file.name.toLowerCase().endsWith('.pdf')) {
      return 'Only PDF files are allowed';
    }
    
    if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
      return 'Only PDF files are allowed';
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    
    return null;
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }

    setError('');
    setSelectedFile(file);
    // Extract filename without extension for the document name
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setNewFileName(baseName);
  };

  const handleCreateFolder = async () => {
    if (isProcessing || !newFolderName.trim()) return;

    try {
      setIsProcessing(true);
      setError('');
      await onCreateFolder(newFolderName.trim(), currentFolderId);
      if (onRefresh) await onRefresh();
      setNewFolderName('');
      setShowFolderInput(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create folder');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateDocument = async () => {
    if (isProcessing || !selectedFile || !newFileName.trim()) {
      setError('Please select a file and provide a name');
      return;
    }

    try {
      setIsProcessing(true);
      setIsUploading(true);
      setError('');
      setUploadProgress(0);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      await onCreateDocument(newFileName.trim(), 'pdf', selectedFile, selectedFolderId);
      if (onRefresh) await onRefresh();
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        setNewFileName('');
        setSelectedFile(null);
        setSelectedFolderId(currentFolderId);
        setShowFileInput(false);
        setUploadProgress(0);
      }, 500);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowFolderInput(true)}
          disabled={isProcessing}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Folder</span>
        </button>
        <button
          onClick={() => {
            setShowFileInput(true);
            setSelectedFolderId(currentFolderId);
          }}
          disabled={isProcessing}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          <span>Upload PDF</span>
        </button>
      </div>

      <AnimatePresence>
        {showFolderInput && (
          <motion.div
            ref={folderInputRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-12 z-10 w-64 p-3 bg-white border border-gray-200 rounded-md shadow-lg"
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              disabled={isProcessing}
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={isProcessing || !newFolderName.trim()}
              className="w-full py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Folder</span>
                </>
              )}
            </button>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </motion.div>
        )}

        {showFileInput && (
          <motion.div
            ref={fileInputRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-12 z-10 w-80 p-4 bg-white border border-gray-200 rounded-md shadow-lg"
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload to Folder
              </label>
              <div className="relative">
                <select
                  value={selectedFolderId || ''}
                  onChange={(e) => setSelectedFolderId(e.target.value || undefined)}
                  className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="">Root</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {getFolderPath(folder.id)}
                    </option>
                  ))}
                </select>
                <FolderOpen className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <FileText className="w-12 h-12 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 mb-1">
                    Drag & drop your PDF here
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    or
                  </p>
                  <label className="inline-block">
                    <span className="px-4 py-2 text-sm text-blue-500 bg-blue-50 rounded-md hover:bg-blue-100 cursor-pointer transition-colors">
                      Browse Files
                    </span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileSelect(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-2 bg-red-50 border border-red-200 rounded-md flex items-center text-sm text-red-600"
              >
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {selectedFile && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            )}

            {isUploading && (
              <div className="mb-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  {uploadProgress}% uploaded
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowFileInput(false);
                  setSelectedFile(null);
                  setNewFileName('');
                  setError('');
                  setSelectedFolderId(currentFolderId);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDocument}
                disabled={!selectedFile || !newFileName.trim() || isUploading}
                className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload PDF</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}