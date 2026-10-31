import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// The playground is a dev-only page. Vite replaces import.meta.env.DEV with false in builds,
// so this branch and the playground code are removed from the production bundle.
const Playground = import.meta.env.DEV && location.pathname === '/playground'
  ? React.lazy(() => import('./Playground.jsx'))
  : null;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {Playground ? <Suspense fallback={<p className="p-6">Loading playground…</p>}><Playground /></Suspense> : <App />}
  </React.StrictMode>,
);
