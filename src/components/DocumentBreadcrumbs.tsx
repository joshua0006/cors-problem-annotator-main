import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, FolderOpen, Home, MoreHorizontal } from 'lucide-react';
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
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
  const shouldCollapse = breadcrumbPath.length > 3;
  
  // Function to render dropdown content
  const renderDropdownContent = () => {
    // For collapsed breadcrumbs, we show hidden middle items in dropdown
    const hiddenItems = breadcrumbPath.slice(1, breadcrumbPath.length - 1);
    
    return (
      <div 
        className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg py-1 z-10 min-w-40 max-h-60 overflow-y-auto"
        ref={dropdownRef}
      >
        {hiddenItems.map(folder => (
          <button
            key={folder.id}
            onClick={() => {
              onNavigate(folder);
              setShowDropdown(false);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
          >
            <FolderOpen className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative mb-4">
      <nav 
        className="flex flex-wrap items-center text-sm text-gray-600 gap-1" 
        aria-label="Breadcrumb"
      >
        {/* Home button - always shown */}
        <div className="flex items-center my-1">
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
        </div>

        {/* Render breadcrumbs based on path length */}
        {breadcrumbPath.length > 0 && (
          <>
            {/* First chevron after Home */}
            <div className="flex items-center my-1">
              <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
            </div>
            
            {shouldCollapse ? (
              // Collapsed view - show first, ellipsis dropdown, and last item
              <>
                {/* Only show first item if there are more than 2 items total */}
                {breadcrumbPath.length > 2 && (
                  <>
                    {/* First folder */}
                    <div className="flex items-center my-1">
                      <button
                        onClick={() => onNavigate(breadcrumbPath[0])}
                        className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                      >
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                        <span>{breadcrumbPath[0].name}</span>
                      </button>
                    </div>
                    
                    {/* Chevron after first folder */}
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                    
                    {/* Dropdown toggle for middle items */}
                    <div className="flex items-center my-1 relative">
                      <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                        title={showDropdown ? "Hide folders" : "Show hidden folders"}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                        <span className="text-xs text-gray-500">
                          {breadcrumbPath.length - 2} more
                        </span>
                      </button>
                      {showDropdown && renderDropdownContent()}
                    </div>
                    
                    {/* Chevron after dropdown */}
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                  </>
                )}
                
                {/* Last item (current folder) - always shown */}
                <div className="flex items-center my-1">
                  <button
                    className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap text-gray-900 font-medium cursor-default"
                    disabled
                  >
                    <FolderOpen className="w-4 h-4 text-gray-400" />
                    <span>{breadcrumbPath[breadcrumbPath.length - 1].name}</span>
                  </button>
                </div>
              </>
            ) : (
              // Show all items directly when there are just a few
              breadcrumbPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  {index > 0 && (
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                  )}
                  <div className="flex items-center my-1">
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
                </React.Fragment>
              ))
            )}
          </>
        )}
      </nav>
    </div>
  );
}