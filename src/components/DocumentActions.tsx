import { Plus, FolderPlus, Upload, AlertCircle, Loader2, FileText, FolderOpen, Link } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Document, Folder } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import GenerateUploadToken from './GenerateUploadToken';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DocumentActionsProps {
  projectId: string;
  currentFolderId?: string;
  folders: Folder[];
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (name: string, type: Document['type'], file: File, folderId?: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES: string[] = []; // Empty array means all file types are allowed

// Create a custom interface for directory input
interface DirectoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  webkitdirectory?: string;
  directory?: string;
}

export default function DocumentActions({
  projectId,
  currentFolderId,
  folders,
  onCreateFolder,
  onCreateDocument,
  onRefresh
}: DocumentActionsProps) {
  const { user } = useAuth();
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [showFileInput, setShowFileInput] = useState(false);
  const [showTokenGenerator, setShowTokenGenerator] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(currentFolderId);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploaderName, setUploaderName] = useState(user?.displayName || '');
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');
  const [processingFile, setProcessingFile] = useState<string>('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const folderNameInputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const tokenGeneratorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderNameInputRef.current && !folderNameInputRef.current.contains(event.target as Node)) {
        setShowFolderInput(false);
        setNewFolderName('');
        setError('');
      }
      if (fileInputRef.current && !fileInputRef.current.contains(event.target as Node)) {
        setShowFileInput(false);
        setSelectedFile(null);
        setError('');
      }
      if (tokenGeneratorRef.current && !tokenGeneratorRef.current.contains(event.target as Node)) {
        setShowTokenGenerator(false);
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
    // Only validate file size, no file type restrictions
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

  const getDocumentType = (file: File): Document['type'] => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    if (file.name.toLowerCase().endsWith('.dwg')) {
      return 'dwg';
    }
    // All other file types are classified as 'other'
    return 'other';
  };

  const handleCreateDocument = async () => {
    if (isProcessing || !selectedFile || !newFileName.trim()) {
      setError('Please select a file and provide a name');
      return;
    }

    // Only require guest name/email if user is not logged in
    if (!user && !uploaderName.trim()) {
      setError('Please provide your name or email');
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

      // Upload the document with the name/email provided
      const documentType = getDocumentType(selectedFile);
      await onCreateDocument(newFileName.trim(), documentType, selectedFile, selectedFolderId);
      
      // Create a notification for the file upload
      try {
        // Get folder name
        const folder = selectedFolderId 
          ? folders.find(f => f.id === selectedFolderId) 
          : { name: "Root" };
        
        const folderName = folder?.name || "Unknown Folder";
        
        // Use the user's name if logged in, otherwise use the entered uploader name
        const uploader = user?.displayName || uploaderName.trim();
        
        // Create the link to the document with proper context
        let link = `/documents`;
          
        if (projectId) {
          link = `/documents/projects/${projectId}`;
          
          if (selectedFolderId) {
            link += `/folders/${selectedFolderId}`;
            // We'll only link to the folder level since we don't have a reliable way to get the file ID
          }
        } else if (selectedFolderId) {
          link += `/folders/${selectedFolderId}`;
        }
        
        // Create notification directly in Firestore
        const notificationsRef = collection(db, 'notifications');
        await addDoc(notificationsRef, {
          iconType: 'file-upload',
          type: 'info',
          message: `${uploader} uploaded "${newFileName.trim()}" to ${folderName}`,
          link: link,
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          metadata: {
            contentType: selectedFile.type,
            fileName: selectedFile.name,
            folderId: selectedFolderId || '',
            folderName: folderName,
            guestName: uploader,
            uploadDate: new Date().toISOString(),
            projectId: projectId || ''
          }
        });
        
        console.log('Upload notification created successfully');
      } catch (notificationError) {
        console.error('Error creating upload notification:', notificationError);
      }
      
      if (onRefresh) await onRefresh();
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        setNewFileName('');
        setSelectedFile(null);
        setUploaderName('');
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

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setIsFolderUpload(true);
    
    const files = event.target.files;
    if (!files || files.length === 0) {
      setError('No files selected. Make sure you selected a folder with files.');
      return;
    }
    
    // Convert FileList to array
    const fileArray = Array.from(files);
    console.log(`Folder selected with ${fileArray.length} files`);
    
    // Check if any of the files have webkitRelativePath or relativePath (for browser compatibility)
    const hasPath = fileArray.some(file => {
      return file.webkitRelativePath || (file as any).relativePath;
    });
    
    if (!hasPath) {
      setError('The selected files don\'t contain path information. Browser may not support folder uploads.');
      return;
    }
    
    setFolderFiles(fileArray);
    
    // Extract folder name from the first file's path
    const getRelativePath = (file: File) => {
      return file.webkitRelativePath || (file as any).relativePath || '';
    };
    
    if (fileArray.length > 0) {
      const path = getRelativePath(fileArray[0]);
      if (path) {
        const folderPath = path.split('/')[0];
        setCurrentFolderPath(folderPath);
        setNewFileName(folderPath);
        console.log(`Detected folder name: ${folderPath}`);
      } else {
        setError('Could not determine folder name. Try selecting the folder again.');
      }
    }
  };

  // Add a helper function to extract file paths safely
  const extractFilePath = (file: File): {baseName: string, filePath: string[], fileName: string} => {
    // Get the path using webkitRelativePath or fallback to any browser-specific property
    const fullPath = file.webkitRelativePath || (file as any).relativePath || '';
    
    if (!fullPath) {
      // Fallback for browsers without proper path support
      return {
        baseName: '',
        filePath: [],
        fileName: file.name
      };
    }
    
    // Split the path into components
    const pathParts = fullPath.split('/');
    
    // First part is the base folder name
    const baseName = pathParts.shift() || '';
    
    // Last part is the file name
    const fileName = pathParts.length > 0 ? pathParts.pop() || file.name : file.name;
    
    // Everything in between is the subfolders
    return {
      baseName,
      filePath: pathParts,
      fileName
    };
  };

  const handleFolderUpload = async () => {
    if (isProcessing || folderFiles.length === 0 || !newFileName.trim()) {
      setError('Please select a folder and provide a name');
      return;
    }

    try {
      setIsProcessing(true);
      setIsUploading(true);
      setError('');
      setUploadProgress(0);
      setProcessedCount(0);
      setTotalCount(folderFiles.length);
      
      // First create the folder structure
      const baseFolderName = newFileName.trim();
      console.log(`Creating folder: ${baseFolderName} with ${folderFiles.length} files`);
      
      // Log the first few files to help with debugging
      folderFiles.slice(0, 3).forEach(file => {
        console.log(`Sample file: ${file.name}, Path: ${file.webkitRelativePath}, Size: ${file.size} bytes`);
      });
      
      // Create the parent folder first
      await onCreateFolder(baseFolderName, selectedFolderId);
      console.log(`Created parent folder: ${baseFolderName}`);
      
      // Refresh to get the updated folder structure
      if (onRefresh) await onRefresh();
      
      // Get the newly created folder
      let parentFolderId = '';
      
      // Find the folder by name and parent
      const updatedFolders = [...folders]; // Create a copy to modify as we go
      const createdFolder = updatedFolders.find(
        f => f.name === baseFolderName && f.parentId === (selectedFolderId || undefined)
      );
      
      if (!createdFolder) {
        throw new Error(`Failed to locate created folder: ${baseFolderName}`);
      }
      
      parentFolderId = createdFolder.id;
      console.log(`Found parent folder ID: ${parentFolderId}`);
      
      // Create a map to track created folders to avoid duplicates and simplify lookups
      const folderPathMap = new Map<string, string>();
      // Initialize with parent folder
      folderPathMap.set('', parentFolderId);
      
      // Add state tracking for UI updates
      let processedFiles = 0;
      let successfulUploads = 0;
      let failedUploads = 0;
      const totalFiles = folderFiles.length;
      
      // For the UI to show the current progress
      const updateProgress = () => {
        setProcessedCount(prev => {
          const newCount = prev + 1;
          setUploadProgress(Math.floor((newCount / totalCount) * 100));
          return newCount;
        });
        setProcessingFile('');
      };
      
      // Batch processing configuration - process files in smaller batches to avoid overwhelming the system
      const BATCH_SIZE = 5; // How many files to process at once
      const BATCH_DELAY = 500; // Milliseconds to wait between batches

      // Process files in batches to avoid overwhelming the system
      const processBatch = async (filesBatch: File[]) => {
        const promises = filesBatch.map(async (file) => {
          try {
            setProcessingFile(file.name);
            
            // Extract path information using our helper
            const { baseName, filePath, fileName } = extractFilePath(file);
            
            if (!fileName) {
              console.log(`Skipping file with invalid path: ${file.webkitRelativePath}`);
              return; // Skip if we couldn't extract a filename
            }
            
            // Join subfolder paths with /
            const subfolderPath = filePath.join('/');
            
            // Get or create the target folder ID for this file
            let targetFolderId = parentFolderId;
            
            // Only process subdirectories if they exist
            if (filePath.length > 0) {
              // Check if we've already created this folder path
              if (folderPathMap.has(subfolderPath)) {
                targetFolderId = folderPathMap.get(subfolderPath) || '';
                console.log(`Using existing folder path: ${subfolderPath} → ${targetFolderId}`);
              } else {
                // Create the folder path as needed
                let currentPath = '';
                let currentParentId = parentFolderId;
                
                // Create each level of subfolder as needed
                for (const folderName of filePath) {
                  // Build the path incrementally
                  currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                  
                  // Check if we've already created this path
                  if (folderPathMap.has(currentPath)) {
                    currentParentId = folderPathMap.get(currentPath) || '';
                    continue;
                  }
                  
                  // Check if this subfolder already exists in our updated folders list
                  const existingFolder = updatedFolders.find(
                    f => f.name === folderName && f.parentId === currentParentId
                  );
                  
                  if (existingFolder) {
                    currentParentId = existingFolder.id;
                    folderPathMap.set(currentPath, currentParentId);
                    console.log(`Found existing subfolder: ${folderName}, ID: ${currentParentId}`);
                  } else {
                    // Create the subfolder
                    console.log(`Creating subfolder: ${folderName} in parent: ${currentParentId}`);
                    await onCreateFolder(folderName, currentParentId);
                    
                    // Refresh folders to get the new structure
                    if (onRefresh) await onRefresh();
                    
                    // Find the newly created folder
                    const newSubfolder = folders.find(
                      f => f.name === folderName && f.parentId === currentParentId
                    );
                    
                    if (!newSubfolder) {
                      throw new Error(`Failed to create or find subfolder: ${folderName}`);
                    }
                    
                    currentParentId = newSubfolder.id;
                    updatedFolders.push(newSubfolder);
                    folderPathMap.set(currentPath, currentParentId);
                    console.log(`Created subfolder: ${folderName}, ID: ${currentParentId}`);
                  }
                }
                
                targetFolderId = currentParentId;
              }
            }
            
            // Now we have the correct target folder ID, upload the file
            console.log(`Uploading file: ${fileName} to folder: ${targetFolderId}`);
            
            // Determine document type from file extension or MIME type
            const documentType = getDocumentType(file);
            
            // Upload the file to the appropriate folder
            await onCreateDocument(fileName, documentType, file, targetFolderId);
            console.log(`Successfully uploaded: ${fileName}`);
            successfulUploads++;
          } catch (fileError) {
            console.error(`Error processing file: ${file.name}`, fileError);
            failedUploads++;
          } finally {
            updateProgress();
          }
        });
        
        try {
          await Promise.all(promises);
        } catch (batchError) {
          console.error('Error processing batch:', batchError);
        }
      };
      
      // Process all files in batches
      for (let i = 0; i < folderFiles.length; i += BATCH_SIZE) {
        const batch = folderFiles.slice(i, i + BATCH_SIZE);
        await processBatch(batch);
        
        // Add a small delay between batches to avoid overwhelming the system
        if (i + BATCH_SIZE < folderFiles.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }
      
      // Create a notification for the folder upload
      try {
        // Get parent folder name
        const folder = selectedFolderId 
          ? folders.find(f => f.id === selectedFolderId) 
          : { name: "Root" };
        
        const folderName = folder?.name || "Root";
        
        // Create notification directly in Firestore
        const notificationsRef = collection(db, 'notifications');
        await addDoc(notificationsRef, {
          iconType: 'folder-upload',
          type: 'info',
          message: `${user?.displayName || 'A user'} uploaded folder "${baseFolderName}" to ${folderName} (${successfulUploads}/${folderFiles.length} files)`,
          link: `/documents/projects/${projectId}/folders/${parentFolderId}`,
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          metadata: {
            folderName: baseFolderName,
            parentFolderId: selectedFolderId || '',
            parentFolderName: folderName,
            fileCount: folderFiles.length,
            successfulUploads,
            failedUploads,
            uploadDate: new Date().toISOString(),
            projectId: projectId || '',
            uploadedBy: user?.displayName || uploaderName
          }
        });
        
        console.log(`Folder upload complete. Successful uploads: ${successfulUploads}, Failed: ${failedUploads}`);
      } catch (notificationError) {
        console.error('Error creating folder upload notification:', notificationError);
      }
      
      // Final refresh to show all the new files
      if (onRefresh) await onRefresh();
      
      setUploadProgress(100);
      
      // Show a final message to the user based on success/failure
      if (failedUploads > 0) {
        if (successfulUploads > 0) {
          setError(`Uploaded ${successfulUploads} files successfully, but ${failedUploads} files failed. Check console for details.`);
        } else {
          setError(`Failed to upload all ${failedUploads} files. Check console for details.`);
        }
      }
      
      setTimeout(() => {
        setNewFileName('');
        setFolderFiles([]);
        setIsFolderUpload(false);
        setCurrentFolderPath('');
        setProcessingFile('');
        setSelectedFolderId(currentFolderId);
        setShowFileInput(false);
        setUploadProgress(0);
      }, 2000); // Longer timeout to ensure user sees the results
      
    } catch (error) {
      console.error('Folder upload failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload folder');
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  const refreshFolders = async (): Promise<Folder[]> => {
    if (onRefresh) {
      await onRefresh();
    }
    // We assume the folders prop will be updated after onRefresh is called
    // In a real implementation, you would want to get the updated folders directly
    return folders;
  };

  return (
    <div className="relative">
      <div className="flex gap-2 items-center">
        <button
          className="inline-flex items-center gap-1 rounded bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          onClick={() => setShowFolderInput(true)}
          disabled={isProcessing}
        >
          <FolderPlus size={14} />
          New Folder
        </button>
        <button
          className="inline-flex items-center gap-1 rounded bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          onClick={() => setShowFileInput(true)}
          disabled={isProcessing}
        >
          <Upload size={14} />
          Upload
        </button>
        {currentFolderId && (
          <button
            className="inline-flex items-center gap-1 rounded bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            onClick={() => setShowTokenGenerator(true)}
            disabled={isProcessing}
          >
            <Link size={14} />
            Share Upload Link
          </button>
        )}
      </div>

      <AnimatePresence>
        {showFolderInput && (
          <motion.div
            ref={folderNameInputRef}
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

            {/* Toggle between file and folder upload for logged-in users */}
            {user && (
              <div className="mb-4">
                <div className="flex border border-gray-200 rounded-md overflow-hidden">
                  <button
                    className={`flex-1 py-2 text-sm font-medium ${
                      !isFolderUpload 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setIsFolderUpload(false)}
                  >
                    Single File
                  </button>
                  <button
                    className={`flex-1 py-2 text-sm font-medium ${
                      isFolderUpload 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setIsFolderUpload(true)}
                  >
                    Folder
                  </button>
                </div>
              </div>
            )}

            {/* Show different upload areas based on type */}
            {isFolderUpload && user ? (
              <div className="mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors bg-gray-50 hover:border-blue-400">
                {folderFiles.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <FolderOpen className="w-12 h-12 text-blue-500 mb-2" />
                    <p className="text-sm font-medium text-gray-900">{currentFolderPath}</p>
                    <p className="text-xs text-gray-500">
                      {folderFiles.length} files selected
                    </p>
                  </div>
                ) : (
                  <>
                    <FolderOpen className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-1">
                      Select a folder to upload
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      All files in the folder will be uploaded
                    </p>
                    <label className="inline-block">
                      <span className="px-4 py-2 text-sm text-blue-500 bg-blue-50 rounded-md hover:bg-blue-100 cursor-pointer transition-colors">
                        Choose Folder
                      </span>
                      <input
                        ref={folderInputRef}
                        type="file"
                        webkitdirectory=""
                        directory=""
                        multiple
                        onChange={handleFolderSelect}
                        className="hidden"
                        {...({} as DirectoryInputProps)}
                      />
                    </label>
                  </>
                )}
              </div>
            ) : (
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
                      Drag & drop any file here
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
                        accept="*/*" 
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
            )}

            {/* Error messages */}
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

            {isUploading && (
              <div className="mb-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    {uploadProgress}% uploaded
                  </p>
                  {isFolderUpload && (
                    <p className="text-xs text-gray-500">
                      Processing file {processedCount}/{totalCount}
                    </p>
                  )}
                </div>
                {isFolderUpload && processingFile && (
                  <p className="text-xs text-gray-500 mt-1 text-center italic truncate max-w-full">
                    {processingFile}
                  </p>
                )}
              </div>
            )}

            {((selectedFile && !isFolderUpload) || (folderFiles.length > 0 && isFolderUpload)) && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isFolderUpload ? 'Folder Name' : 'Document Name'}
                  </label>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                
                {/* Only show name/email input for non-authenticated users */}
                {!user && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Name/Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={uploaderName}
                      onChange={(e) => setUploaderName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your name or email"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Required for tracking uploads and notifications
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowFileInput(false);
                  setSelectedFile(null);
                  setNewFileName('');
                  setError('');
                  setSelectedFolderId(currentFolderId);
                  setIsFolderUpload(false);
                  setFolderFiles([]);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                onClick={isFolderUpload ? handleFolderUpload : handleCreateDocument}
                disabled={
                  (isFolderUpload 
                    ? folderFiles.length === 0 || !newFileName.trim() 
                    : !selectedFile || !newFileName.trim() || (!user && !uploaderName.trim())
                  ) || isUploading
                }
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
                    <span>{isFolderUpload ? 'Upload Folder' : 'Upload'}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {showTokenGenerator && currentFolderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
          >
            <motion.div
              ref={tokenGeneratorRef}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            >
              <GenerateUploadToken
                folderId={currentFolderId}
                folderName={folders.find(f => f.id === currentFolderId)?.name}
                onClose={() => setShowTokenGenerator(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}