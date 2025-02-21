import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  AuthError
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { AuthContextType, User, AuthState, UserProfile } from '../types/auth';

const initialState: AuthState = {
  user: null,
  loading: true,
  error: null
};

const AuthContext = createContext<AuthContextType>({
  ...initialState,
  signIn: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  updateProfilePicture: async () => {},
  canAssignTasks: () => false,
  canUpdateMilestones: () => false,
  canUpdateTaskStatus: () => false,
  canUploadDocuments: () => false,
  canComment: () => false,
  canManageTeam: () => false,
  canEditProject: () => false,
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as Omit<User, 'id'>;
            
            // Update last login timestamp
            await updateDoc(doc(db, 'users', firebaseUser.uid), {
              'metadata.lastLogin': serverTimestamp()
            });
            
            setState({
              user: {
                id: firebaseUser.uid,
                ...userData
              },
              loading: false,
              error: null
            });
          } else {
            setState({
              user: null,
              loading: false,
              error: 'User data not found'
            });
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          setState({
            user: null,
            loading: false,
            error: 'Failed to load user data'
          });
        }
      } else {
        setState({
          user: null,
          loading: false,
          error: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (!userDoc.exists()) {
        throw new Error('User data not found');
      }

      const userData = userDoc.data() as Omit<User, 'id'>;
      
      await updateDoc(doc(db, 'users', userCredential.user.uid), {
        'metadata.lastLogin': serverTimestamp()
      });

      setState({
        user: {
          id: userCredential.user.uid,
          ...userData
        },
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Sign in error:', error);
      
      let errorMessage = 'Invalid email or password';
      if (error instanceof Error) {
        const authError = error as AuthError;
        switch (authError.code) {
          case 'auth/invalid-credential':
            errorMessage = 'Invalid email or password';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later';
            break;
          default:
            errorMessage = 'Failed to sign in. Please try again';
        }
      }
      
      setState(prev => ({
        ...prev,
        user: null,
        loading: false,
        error: errorMessage
      }));
      
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setState({
        user: null,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Error signing out:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to sign out'
      }));
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!state.user) throw new Error('No user logged in');

    try {
      const userRef = doc(db, 'users', state.user.id);
      await updateDoc(userRef, {
        'profile': {
          ...state.user.profile,
          ...updates
        },
        updatedAt: serverTimestamp()
      });

      setState(prev => ({
        ...prev,
        user: prev.user ? {
          ...prev.user,
          profile: {
            ...prev.user.profile,
            ...updates
          }
        } : null
      }));
    } catch (error) {
      console.error('Error updating profile:', error);
      throw new Error('Failed to update profile');
    }
  };

  const updateProfilePicture = async (file: File) => {
    if (!state.user) throw new Error('No user logged in');

    try {
      const storageRef = ref(storage, `profile-pictures/${state.user.id}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      if (auth.currentUser) {
        await firebaseUpdateProfile(auth.currentUser, { photoURL });
      }

      const userRef = doc(db, 'users', state.user.id);
      await updateDoc(userRef, {
        'profile.photoURL': photoURL,
        updatedAt: serverTimestamp()
      });

      setState(prev => ({
        ...prev,
        user: prev.user ? {
          ...prev.user,
          profile: {
            ...prev.user.profile,
            photoURL
          }
        } : null
      }));
    } catch (error) {
      console.error('Error updating profile picture:', error);
      throw new Error('Failed to update profile picture');
    }
  };

  // Permission checks based on user role
  const isStaffOrContractor = () => {
    return state.user?.role === 'Staff' || state.user?.role === 'Contractor';
  };

  const canAssignTasks = () => {
    return isStaffOrContractor();
  };

  const canUpdateMilestones = () => {
    return isStaffOrContractor();
  };

  const canUpdateTaskStatus = (taskId: string) => {
    return isStaffOrContractor();
  };

  const canUploadDocuments = () => {
    return !!state.user; // All authenticated users can upload documents
  };

  const canComment = () => {
    return !!state.user; // All authenticated users can comment
  };

  const canManageTeam = () => {
    return isStaffOrContractor();
  };

  const canEditProject = () => {
    return isStaffOrContractor();
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      signIn,
      signOut,
      updateProfile,
      updateProfilePicture,
      canAssignTasks,
      canUpdateMilestones,
      canUpdateTaskStatus,
      canUploadDocuments,
      canComment,
      canManageTeam,
      canEditProject,
    }}>
      {children}
    </AuthContext.Provider>
  );
}