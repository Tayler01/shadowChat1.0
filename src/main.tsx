import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';

// Only register service worker in production environments that support it
// StackBlitz and similar development environments don't support service workers
if ('serviceWorker' in navigator && 
    !window.location.hostname.includes('stackblitz') && 
    !window.location.hostname.includes('webcontainer') &&
    import.meta.env.PROD) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .catch((err) => console.error('Service worker registration failed', err));
}

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
