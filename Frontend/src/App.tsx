import { Suspense, useState, useEffect, useCallback, useRef, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { CreateFormProvider } from './contexts/CreateFormProvider';
import { ChatProvider } from './contexts/ChatProvider';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import { useAuth } from './hooks/useAuth';
import { useToast } from './contexts/ToastContext';
import { LogoLoader } from './components/common/LogoLoader';
import { ThemeSyncProvider, useThemeSync, resolveThemeKeyFromRoute } from './contexts/ThemeSyncContext';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import {
  LazyDashboard,
  LazyDocumentsPage,
  LazyCRMPage,
  LazyAdminPage,
  LazyAutomationPage,
} from './lib/lazyLoader';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { Header } from './components/layout/Header';
import { ModernSidebar } from './components/layout/ModernSidebar';
import ReloadBlockedToast from './components/common/ReloadBlockedToast';
import UnsyncedDraftsPanel from './components/common/UnsyncedDraftsPanel';

// ⚡ Lazy load all heavy components to defer loading until needed
const LazyLoginForm = lazy(() => import('./components/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const LazyRegisterForm = lazy(() => import('./components/auth/RegisterForm').then(m => ({ default: m.RegisterForm })));
const LazyOfflineIndicator = lazy(() => import('./components/common/OfflineIndicator').then(m => ({ default: m.OfflineIndicator })));
const LazySyncErrorHandler = lazy(() => import('./components/common/SyncErrorHandler').then(m => ({ default: m.SyncErrorHandler })));
const LazySyncQueueModal = lazy(() => import('./components/common/SyncQueueModal').then(m => ({ default: m.SyncQueueModal })));
const LazySkipLinks = lazy(() => import('./components/common/SkipLinks').then(m => ({ default: m.SkipLinks })));
const LazyFloatingChat = lazy(() => import('./components/chat/FloatingChat').then(m => ({ default: m.FloatingChat })));
const LazyDraftEncryptionPanel = lazy(() => import('./components/common/DraftEncryptionPanel').then(m => ({ default: m.default })));

type AuthView = 'login' | 'register';

// Protected route wrapper for admin pages
const AdminRoute = ({ children, isAdmin }: { children: React.ReactNode; isAdmin: boolean }) => {
  if (!isAdmin) {
    return <Navigate to="/crm" replace />;
  }
  return children;
};



const AppContent = () => {
  const { user, isLoading, refreshUser, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { isCollapsed } = useSidebar();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [hasShownOfflineToast, setHasShownOfflineToast] = useState(false);
  const hasShownOfflineToastRef = useRef(false);
  const location = useLocation();
  const { setTheme, clearPreview } = useThemeSync();
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldReduceMotion = prefersReducedMotion;

  // Update ref when state changes
  useEffect(() => {
    hasShownOfflineToastRef.current = hasShownOfflineToast;
  }, [hasShownOfflineToast]);

  const handleThemeUpdate = useCallback(() => {
    const key = resolveThemeKeyFromRoute(location.pathname, location.search);
    setTheme(key);
    clearPreview();
  }, [clearPreview, location.pathname, location.search, setTheme]);

  useEffect(() => {
    handleThemeUpdate();
  }, [handleThemeUpdate]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    if (shouldReduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [shouldReduceMotion]);


  // Listen for offline mode activation and show toast notification
  const handleOfflineActivation = useCallback(() => {
    if (!hasShownOfflineToastRef.current && user) {
      showToast({
        type: 'info',
        title: 'Offline Mode Active',
        message: 'You can continue working offline. Changes will sync automatically when you\'re back online.',
        durationMs: 6000,
      });
      hasShownOfflineToastRef.current = true;
      setHasShownOfflineToast(true);
    }
  }, [user, showToast]);

  useEffect(() => {
    window.addEventListener('offline-mode-activated', handleOfflineActivation);
    return () => {
      window.removeEventListener('offline-mode-activated', handleOfflineActivation);
    };
  }, [handleOfflineActivation]);

  if (location.pathname === '/oauth/callback') {
    return <OAuthCallbackPage />;
  }

  if (isLoading) {
    return <LogoLoader fullScreen size="xl" showText label="Loading Application" />;
  }

  if (!user) {
    if (authView === 'login') {
      return (
        <Suspense fallback={<LogoLoader fullScreen size="xl" showText label="Loading Login" />}>
          <LazyLoginForm
            onSuccess={() => refreshUser()}
            onSwitchToRegister={() => setAuthView('register')}
          />
        </Suspense>
      );
    } else {
      return (
        <Suspense fallback={<LogoLoader fullScreen size="xl" showText label="Loading Register" />}>
          <LazyRegisterForm
            onSwitchToLogin={() => setAuthView('login')}
          />
        </Suspense>
      );
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-900" style={{
      backgroundColor: '#FFFFFF',
      transition: shouldReduceMotion ? undefined : 'background-color 100ms linear'
    }}>
      <Suspense fallback={null}>
        <LazySkipLinks />
      </Suspense>

      <div className="relative z-10 flex min-h-screen flex-col">
        <Header />
        <ModernSidebar />

      <main
        id="main-content"
        role="main"
        className={`flex-1 overflow-hidden ${isCollapsed ? 'md:ml-16' : 'md:ml-56'}`}
        style={{
          backgroundColor: '#FFFFFF',
          transition: shouldReduceMotion ? undefined : 'background-color 100ms linear, margin-left 200ms ease',
          height: 'calc(100vh - 56px)',
          marginTop: '56px',
        }}
      >
        <Routes>
          <Route 
            path="/dashboard" 
            element={
              <Suspense fallback={null}>
                <LazyDashboard />
              </Suspense>
            } 
          />
          <Route 
            path="/documents" 
            element={
              <Suspense fallback={null}>
                <LazyDocumentsPage />
              </Suspense>
            } 
          />
          <Route 
            path="/automation" 
            element={
              <Suspense fallback={null}>
                <LazyAutomationPage />
              </Suspense>
            } 
          />
          <Route 
            path="/crm" 
            element={
              <Suspense fallback={null}>
                <LazyCRMPage />
              </Suspense>
            } 
          />
          <Route
            path="/admin"
            element={
              <AdminRoute isAdmin={isAdmin}>
                <Suspense fallback={null}>
                  <LazyAdminPage />
                </Suspense>
              </AdminRoute>
            }
          />
          {/* Redirect root to Dashboard for all authenticated users */}
          <Route
            path="/"
            element={<Navigate to="/dashboard" replace />}
          />
          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
          {/* Toast informing user when reload is blocked due to pending sync/drafts */}
          <ReloadBlockedToast />
          <UnsyncedDraftsPanel />
          <Suspense fallback={null}>
            <LazyDraftEncryptionPanel />
          </Suspense>
      </div>

      {/* Floating Chat Widget */}
      <Suspense fallback={null}>
        <LazyFloatingChat />
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <ThemeSyncProvider>
          <CreateFormProvider>
            <Suspense fallback={null}>
              <ChatProvider>
                <AppContent />
              </ChatProvider>
            </Suspense>
            <Suspense fallback={null}>
              <LazySyncQueueModal />
            </Suspense>
            {/* Offline indicator and sync error handler shown even before authentication */}
            <Suspense fallback={null}>
              <LazyOfflineIndicator />
            </Suspense>
            <Suspense fallback={null}>
              <LazySyncErrorHandler />
            </Suspense>
          </CreateFormProvider>
      </ThemeSyncProvider>
      </SidebarProvider>
    </AuthProvider>
  );
}
  
export default App;
