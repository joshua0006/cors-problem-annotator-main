import React, { useState, useMemo } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { OrganizationProvider } from "./contexts/OrganizationContext";
import { AuthProvider } from "./contexts/AuthContext";
import SignIn from "./components/auth/SignIn";
import SignUp from "./components/auth/SignUp";
import AppContent from "./components/AppContent";
import { useAuth } from "./contexts/AuthContext";
import { PDFViewer } from "./components/PDFViewer";
import { ToastProvider } from "./contexts/ToastContext";
import { KeyboardShortcutGuide } from "./components/KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "./hooks/useKeyboardShortcutGuide";
import SharedContent from './components/SharedContent';
import { Toolbar } from './components/Toolbar';
import TokenUpload from './components/TokenUpload';

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" />;
  }

  return <>{children}</>;
}

export const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const documentId = useMemo(
    () => (file ? `doc-${file.name}-${file.lastModified}` : "default-doc"),
    [file]
  );
  const { isShortcutGuideOpen, setIsShortcutGuideOpen } =
    useKeyboardShortcutGuide();

  return (
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <ToastProvider>
            {/* Main application layout wrapper */}
            
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <AppContent />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/shared/:token"
                  element={<SharedContent />}
                />
                <Route
                  path="/upload"
                  element={<TokenUpload />}
                />
              </Routes>
          
            
            {isShortcutGuideOpen && (
              <KeyboardShortcutGuide
                onClose={() => setIsShortcutGuideOpen(false)}
              />
            )}
          </ToastProvider>
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
