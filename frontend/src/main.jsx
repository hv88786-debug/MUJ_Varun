import { createRoot } from 'react-dom/client';
import './index.css';
import AquaGuard from './AquaGuard.jsx';
import AshaPortal from './AshaPortal.jsx';

// Simple path-based switch — no router dependency needed for just two
// screens. /asha (and any /asha/... deep link) opens the ASHA Worker
// Portal (now a real React component, see AshaPortal.jsx); everything
// else opens the main VARUN dashboard.
const isAshaRoute = window.location.pathname.startsWith('/asha');
const App = isAshaRoute ? AshaPortal : AquaGuard;

// Use a separate manifest and service-worker scope for the ASHA PWA so an
// ASHA home-screen shortcut never launches the main dashboard.
const manifestLink = document.querySelector('link[rel="manifest"]');
if (manifestLink && isAshaRoute) manifestLink.href = '/asha/manifest.json';

createRoot(document.getElementById('root')).render(<App />);

// Register the service worker so the app is installable ("Add to Home
// Screen") and the shell still opens on a flaky connection. Safe no-op
// in browsers/environments without SW support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const workerUrl = isAshaRoute ? '/asha/sw.js' : '/sw.js';
    navigator.serviceWorker.register(workerUrl, { scope: isAshaRoute ? '/asha/' : '/' }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
