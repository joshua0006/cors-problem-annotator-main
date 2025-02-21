import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { validateShareToken } from '../services/shareService';
import { Document, Folder } from '../types';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import DocumentViewer from './DocumentViewer';
import DocumentList from './DocumentList';
import { useToast } from '../contexts/ToastContext';
import { getFolderContents } from '../services/folderService';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function SharedContent() {
  const { token } = useParams();
  const [content, setContent] = useState<Document | Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [folderContents, setFolderContents] = useState<{
    documents: Document[];
    folders: Folder[];
  }>();

  const logError = (error: Error) => {
    console.error('SharedContent Error:', {
      error,
      token,
      content,
      time: new Date().toISOString()
    });
  };

  useEffect(() => {
    const loadContent = async () => {
      try {
        console.log('Original token from URL:', token);
        console.log('Trimmed token:', token?.trim());
        console.log('Lowercase token:', token?.toLowerCase());
        
        const normalizedToken = token?.trim().toLowerCase();
        console.log('Normalized token:', normalizedToken);
        
        const validToken = await validateShareToken(normalizedToken || '');
        if (!validToken) {
          showToast('Invalid or expired share link', 'error');
          return;
        }

        // First get the base folder/document
        const resourceCollection = validToken.type === 'folder' ? 'folders' : 'documents';
        const resourceRef = doc(db, resourceCollection, validToken.resourceId);
        const resourceDoc = await getDoc(resourceRef);

        if (!resourceDoc.exists()) {
          showToast('Shared content no longer exists', 'error');
          return;
        }

        if (validToken.type === 'file') {
          setContent({ id: resourceDoc.id, ...resourceDoc.data() } as Document);
        } else {
          // Now get folder contents
          const [docs, folders] = await Promise.all([
            getDocs(query(
              collection(db, 'documents'),
              where('folderId', '==', validToken.resourceId)
            )),
            getDocs(query(
              collection(db, 'folders'),
              where('parentId', '==', validToken.resourceId)
            ))
          ]);

          setContent({
            ...resourceDoc.data() as Folder,
            id: resourceDoc.id,
            documents: docs.docs.map(d => ({ id: d.id, ...d.data() }) as Document),
            folders: folders.docs.map(f => ({ id: f.id, ...f.data() }) as Folder)
          });
        }
      } catch (error) {
        console.error('Error loading shared content:', error);
        showToast('Error loading content', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [token]);

  useEffect(() => {
    if (content && 'type' in content) return;

    const loadFolderContents = async (folderId: string) => {
      const [docsSnap, foldersSnap] = await Promise.all([
        getDocs(query(collection(db, 'documents'), where('folderId', '==', folderId))),
        getDocs(query(collection(db, 'folders'), where('parentId', '==', folderId)))
      ]);
      
      setFolderContents({
        documents: docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Document)),
        folders: foldersSnap.docs.map(f => ({ id: f.id, ...f.data() } as Folder))
      });
    };

    if (content && !('type' in content)) {
      loadFolderContents(content.id);
    }
  }, [content]);

  const getFolderContents = async (folderId: string) => {
    const [folderDocs, subFolders] = await Promise.all([
      getDocs(query(collection(db, 'documents'), where('folderId', '==', folderId))),
      getDocs(query(collection(db, 'folders'), where('parentId', '==', folderId)))
    ]);
    
    return {
      id: folderId,
      documents: folderDocs.docs.map(d => ({ id: d.id, ...d.data() })),
      folders: subFolders.docs.map(f => ({ id: f.id, ...f.data() }))
    };
  };

  useEffect(() => {
    if (content) {
      console.groupCollapsed('Shared Content Details');
      console.log('Shared Content Type:', 'type' in content ? 'File' : 'Folder');
      console.log('Content ID:', content.id);
      console.log('Content Name:', content.name);
      
      if ('type' in content) {
        console.log('File URL:', content.fileUrl);
        console.log('File Type:', content.type);
        console.log('Upload Date:', content.createdAt);
      } else {
        console.log('Folder Contents:', {
          documents: content.documents.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type
          })),
          subFolders: content.folders.map(f => ({
            id: f.id,
            name: f.name,
            itemsCount: f.documents?.length || 0
          }))
        });
        console.log('Total Documents:', content.documents.length);
        console.log('Total Subfolders:', content.folders.length);
      }
      console.groupEnd();
    }
  }, [content]);

  if (loading) {
    return <div className="text-center p-8">Loading shared content...</div>;
  }

  if (!content) {
    return <div className="text-center p-8 text-red-500">Content not available</div>;
  }

  return (
    <div className="h-full p-4">
      {content && 'type' in content ? (
        <div className="h-full w-full">
          <iframe
            src={content.fileUrl}
            title={content.name}
            className="w-full h-full border-none"
            style={{ minHeight: 'calc(100vh - 4rem)' }}
          >
            <p className="text-center p-4">
              Your browser does not support PDFs. 
              <a href={content.fileUrl} className="text-blue-500 hover:underline ml-2">
                Download PDF
              </a>
            </p>
          </iframe>
        </div>
      ) : (
        <DocumentList
          isSharedView={true}
          sharedDocuments={content?.documents || []}
          sharedFolders={content?.folders || []}
          currentFolder={content ? {
            id: content.id,
            name: content.name,
            parentId: '',
            ownerId: '',
            createdAt: new Date()
          } : undefined}
          projectId=""
          onPreview={() => {}}
          onCreateFolder={() => Promise.resolve()}
          onCreateDocument={() => Promise.resolve()}
          onUpdateFolder={() => Promise.resolve()}
          onDeleteFolder={() => Promise.resolve()}
          onUpdateDocument={() => Promise.resolve()}
          onDeleteDocument={() => Promise.resolve()}
        />
      )}
    </div>
  );
} 