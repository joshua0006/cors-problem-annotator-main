import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { ShareToken } from '../types';

// Interface for the upload token
export interface UploadToken {
  id: string;
  folderId: string;
  creatorId: string;
  createdAt: Date;
  expiresAt: Date;
  maxFileSize?: number; // in bytes
  allowedFileTypes?: string[]; // mime types
  maxUploads?: number;
  usedCount: number;
  metadata?: Record<string, any>;
}

/**
 * Creates a token that allows uploading files to a specific folder
 * @param folderId The folder ID where uploads will be stored
 * @param creatorId User ID of the token creator
 * @param options Additional options for the token
 * @returns The created upload token
 */
export const createUploadToken = async (
  folderId: string,
  creatorId: string,
  options: {
    expiresInHours?: number;
    maxFileSize?: number;
    allowedFileTypes?: string[];
    maxUploads?: number;
    metadata?: Record<string, any>;
  } = {}
): Promise<UploadToken> => {
  const tokenId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 24)); // Default: 24 hours

  const token: UploadToken = {
    id: tokenId,
    folderId,
    creatorId,
    createdAt: now,
    expiresAt,
    maxFileSize: options.maxFileSize,
    allowedFileTypes: options.allowedFileTypes,
    maxUploads: options.maxUploads,
    usedCount: 0,
    metadata: options.metadata || {}
  };

  // Store token in Firestore
  await setDoc(doc(db, 'uploadTokens', tokenId), {
    ...token,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt)
  });
  
  return token;
};

/**
 * Validates an upload token and checks if it can be used
 * @param tokenId The token ID to validate
 * @returns The validated token or null if invalid
 */
export const validateUploadToken = async (tokenId: string): Promise<UploadToken | null> => {
  try {
    // Query by token ID
    const tokensRef = collection(db, 'uploadTokens');
    const q = query(tokensRef, where('id', '==', tokenId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.error('Upload token not found');
      return null;
    }

    const tokenDoc = querySnapshot.docs[0];
    const tokenData = tokenDoc.data() as UploadToken;
    
    // Convert timestamps to Date objects
    const expiresAt = tokenData.expiresAt instanceof Timestamp 
      ? tokenData.expiresAt.toDate() 
      : new Date(tokenData.expiresAt);
    
    const createdAt = tokenData.createdAt instanceof Timestamp
      ? tokenData.createdAt.toDate()
      : new Date(tokenData.createdAt);

    const token = {
      ...tokenData,
      expiresAt,
      createdAt
    };

    // Check if token has expired
    const now = new Date();
    if (expiresAt < now) {
      console.error('Upload token has expired');
      return null;
    }

    // Check if max uploads limit has been reached
    if (token.maxUploads && token.usedCount >= token.maxUploads) {
      console.error('Upload token has reached maximum usage limit');
      return null;
    }

    return token;
  } catch (error) {
    console.error('Error validating upload token:', error);
    return null;
  }
};

/**
 * Uploads a file using an upload token
 * @param tokenId The upload token ID
 * @param file The file to upload
 * @returns Information about the uploaded file
 */
export const uploadFileWithToken = async (
  tokenId: string,
  file: File
): Promise<{ url: string; path: string; documentId: string } | null> => {
  try {
    // Validate the token
    const token = await validateUploadToken(tokenId);
    if (!token) {
      throw new Error('Invalid or expired upload token');
    }

    // Check file size if a limit is set
    if (token.maxFileSize && file.size > token.maxFileSize) {
      throw new Error(`File exceeds the maximum allowed size of ${token.maxFileSize} bytes`);
    }

    // Check file type if restrictions are set
    if (token.allowedFileTypes && token.allowedFileTypes.length > 0) {
      if (!token.allowedFileTypes.includes(file.type)) {
        throw new Error(`File type ${file.type} is not allowed. Allowed types: ${token.allowedFileTypes.join(', ')}`);
      }
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `folders/${token.folderId}/documents/${uniqueFilename}`;

    // Upload file to Firebase Storage
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type,
      customMetadata: {
        originalFilename: file.name,
        folderId: token.folderId,
        uploadedWithToken: tokenId,
        version: '1'
      }
    };

    const uploadResult = await uploadBytes(storageRef, file, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);

    // Create document record in Firestore
    const folderDocRef = doc(db, 'folders', token.folderId);
    const documentsCollectionRef = collection(folderDocRef, 'documents');
    
    const documentData = {
      name: file.name,
      type: file.type.includes('pdf') ? 'pdf' : 'other',
      url: downloadUrl,
      storagePath,
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      uploadedWithToken: tokenId,
      metadata: {
        originalFilename: file.name,
        contentType: file.type,
        size: file.size,
        version: 1
      }
    };

    // Create a new document with auto-generated ID
    const newDocRef = doc(documentsCollectionRef);
    await setDoc(newDocRef, documentData);
    const documentId = newDocRef.id;

    // Update token usage count
    const tokenRef = doc(db, 'uploadTokens', tokenId);
    await setDoc(tokenRef, { usedCount: token.usedCount + 1 }, { merge: true });

    return {
      url: downloadUrl,
      path: storagePath,
      documentId
    };
  } catch (error) {
    console.error('Error uploading file with token:', error);
    throw error;
  }
};

/**
 * Generates a shareable upload URL that contains the token
 * @param token The upload token
 * @param baseUrl The base URL of the application
 * @returns The shareable upload URL
 */
export const generateUploadUrl = (token: UploadToken, baseUrl: string): string => {
  return `${baseUrl}/upload?token=${token.id}`;
}; 