import { ChevronRight, FolderOpen, Home } from 'lucide-react';
import { Folder } from '../types';

interface DocumentBreadcrumbsProps {
  folders: Folder[];
  currentFolder?: Folder;
  onNavigate: (folder?: Folder) => void;
}

export default function DocumentBreadcrumbs({
  folders,
  currentFolder,
  onNavigate,
}: DocumentBreadcrumbsProps) {
  const folderMap = new Map<string, Folder>(folders.map(f => [f.id, f]));

  const generateBreadcrumbPath = () => {
    const path: Folder[] = [];
    let current = currentFolder;

    while (current) {
      path.unshift(current);
      current = current.parentId ? folderMap.get(current.parentId) : undefined;
    }

    return path;
  };

  const breadcrumbPath = generateBreadcrumbPath();

  return (
    <nav className="flex items-center text-sm text-gray-600 overflow-x-auto" aria-label="Breadcrumb">
      <button
        onClick={() => onNavigate(undefined)}
        className={`flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
          !currentFolder ? 'text-gray-900 font-medium' : 'hover:text-gray-900 hover:bg-gray-100'
        }`}
        disabled={!currentFolder}
      >
        <Home className="w-4 h-4" />
        <span>Documents</span>
      </button>

      {breadcrumbPath.map((folder, index) => (
        <div key={folder.id} className="flex items-center">
          <ChevronRight className="w-4 h-4 mx-2 text-gray-400 flex-shrink-0" />
          <button
            onClick={() => onNavigate(folder)}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
              index === breadcrumbPath.length - 1 
                ? 'text-gray-900 font-medium cursor-default'
                : 'hover:text-gray-900 hover:bg-gray-100'
            }`}
            disabled={index === breadcrumbPath.length - 1}
          >
            <FolderOpen className="w-4 h-4 text-gray-400" />
            <span>{folder.name}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}