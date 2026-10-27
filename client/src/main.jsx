import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { applyStoredTheme } from './themes.js';

applyStoredTheme();

createRoot(document.getElementById('root')).render(<App />);

const inApp = !!window.Capacitor?.isNativePlatform?.() || navigator.userAgent.includes('Electron');
if ('serviceWorker' in navigator && import.meta.env.PROD && !inApp && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
