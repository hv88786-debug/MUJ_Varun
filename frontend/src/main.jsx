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

createRoot(document.getElementById('root')).render(<App />);

// Register the service worker so the app is installable ("Add to Home
// Screen") and the shell still opens on a flaky connection. Safe no-op
// in browsers/environments without SW support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
