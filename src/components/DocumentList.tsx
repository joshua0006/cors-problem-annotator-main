import {
  Eye,
  FileText,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  Home,
} from "lucide-react";
import { useState } from "react";
import { Document, Folder } from "../types";
import DocumentBreadcrumbs from "./DocumentBreadcrumbs";
import DocumentActions from "./DocumentActions";
import DocumentViewer from "./DocumentViewer";
import { motion, AnimatePresence } from "framer-motion";
import { Timestamp } from "firebase/firestore";

interface DocumentListProps {
  documents: Document[];
  folders: Folder[];
  currentFolder?: Folder;
  projectId: string;
  onFolderSelect?: (folder?: Folder) => void;
  onPreview: (document: Document) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (
    name: string,
    type: Document["type"],
    file: File,
    folderId?: string
  ) => Promise<void>;
  onUpdateFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const formatDate = (date: string | Timestamp | Date) => {
  if (date instanceof Timestamp) {
    return date.toDate().toLocaleString();
  }
  if (typeof date === "string") {
    return new Date(date).toLocaleString();
  }
  if (date instanceof Date) {
    return date.toLocaleString();
  }
  return "Date unavailable";
};

export default function DocumentList({
  documents = [],
  folders = [],
  currentFolder,
  projectId,
  onFolderSelect,
  onPreview,
  onCreateFolder,
  onCreateDocument,
  onUpdateFolder,
  onDeleteFolder,
  onUpdateDocument,
  onDeleteDocument,
  onRefresh,
}: DocumentListProps) {
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document>();
  const [loading, setLoading] = useState(false);

  const currentDocs = documents.filter(
    (doc) => doc.folderId === currentFolder?.id
  );
  const subFolders = folders.filter(
    (folder) => folder.parentId === currentFolder?.id
  );

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveEdit = async (id: string, type: "folder" | "document") => {
    if (editName.trim()) {
      try {
        setLoading(true);
        if (type === "folder") {
          await onUpdateFolder(id, editName.trim());
        } else {
          await onUpdateDocument(id, { name: editName.trim() });
        }
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error("Error saving edit:", error);
      } finally {
        setLoading(false);
        setEditingId(undefined);
        setEditName("");
      }
    }
  };

  const handleBreadcrumbNavigation = (folder?: Folder) => {
    if (selectedDocument) {
      setSelectedDocument(undefined);
    }
    onFolderSelect?.(folder);
  };

  const renderBreadcrumbs = () => {
    if (selectedDocument) {
      const currentFolder = folders.find(
        (f) => f.id === selectedDocument.folderId
      );

      return (
        <nav
          className="flex items-center text-sm text-gray-600 px-4 pt-2"
          aria-label="Breadcrumb"
        >
          <button
            onClick={() => handleBreadcrumbNavigation(undefined)}
            className="flex items-center hover:text-gray-900 px-2 py-1 rounded-md transition-colors hover:bg-gray-100"
          >
            <Home className="w-4 h-4 mr-1.5" />
            <span>Documents</span>
          </button>

          {currentFolder && (
            <>
              <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
              <button
                onClick={() => handleBreadcrumbNavigation(currentFolder)}
                className="flex items-center px-2 py-1 rounded-md transition-colors hover:bg-gray-100"
              >
                <FolderOpen className="w-4 h-4 mr-1.5 text-gray-400" />
                <span>{currentFolder.name}</span>
              </button>
            </>
          )}

          <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
          <span className="px-2 py-1 text-gray-900 font-medium">
            {selectedDocument.name}
          </span>
        </nav>
      );
    }

    return (
      <DocumentBreadcrumbs
        folders={folders}
        currentFolder={currentFolder}
        onNavigate={handleBreadcrumbNavigation}
      />
    );
  };

  return (
    <div
      className={`h-full flex flex-col ${
        selectedDocument ? "bg-gray-100" : "p-6"
      }`}
    >
      <div
        className={`flex items-center justify-between ${
          selectedDocument ? "p-4" : "mb-6"
        }`}
      >
        {renderBreadcrumbs()}
        {!selectedDocument && (
          <DocumentActions
            projectId={projectId}
            currentFolderId={currentFolder?.id}
            folders={folders}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onRefresh={onRefresh}
          />
        )}
      </div>

      {selectedDocument ? (
        <div className="flex-1 min-h-0">
          <DocumentViewer
            document={selectedDocument}
            onClose={() => setSelectedDocument(undefined)}
            onRefresh={onRefresh}
            folders={folders}
            onNavigateToFolder={handleBreadcrumbNavigation}
          />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-12"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {subFolders.map((folder) => (
                <motion.div
                  key={folder.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => onFolderSelect?.(folder)}
                    className="flex items-left space-x-3 flex-1"
                  >
                    <FolderOpen className="w-6 h-6 text-gray-400" />
                    {editingId === folder.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          handleSaveEdit(folder.id, "folder")
                        }
                        className="flex-1 px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium text-gray-900">
                        {folder.name}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleStartEdit(folder.id, folder.name)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteFolder(folder.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}

              {currentDocs.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => setSelectedDocument(doc)}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <FileText className="w-6 h-6 text-gray-400" />
                    <div>
                      {editingId === doc.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            handleSaveEdit(doc.id, "document")
                          }
                          className="px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <div class="text-left">
                          <span className="font-medium text-gray-900">
                            {doc.name}
                          </span>
                          <span className="ml-2 text-sm text-gray-500">
                            v{doc.version}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        Modified: {formatDate(doc.dateModified)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onPreview(doc)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStartEdit(doc.id, doc.name)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}

              {subFolders.length === 0 && currentDocs.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <p className="text-gray-500">
                    No documents or folders found in this location.
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
