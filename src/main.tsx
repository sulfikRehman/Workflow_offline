import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installTapHaptics } from '@/lib/haptics';
import './index.css';

installTapHaptics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Ask the browser not to evict this site's stored data when storage is low.
navigator.storage?.persist?.().catch(() => {});

// Offline support: cache the app files so it opens without internet.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
