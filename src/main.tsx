import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { PerformanceMonitor, trackChunkLoading } from './utils/performance';

// Start tracking performance
PerformanceMonitor.startMeasurement('app-initialization');
trackChunkLoading();

// Log initial bundle metrics
setTimeout(() => {
  PerformanceMonitor.endMeasurement('app-initialization');
}, 100);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
