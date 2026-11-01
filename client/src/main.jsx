import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// A local prompt playground, kept out of the repository. It is a dev-only page: Vite replaces import.meta.env.DEV
// with false in builds, and the path is a variable so a build does not need the file to exist.
const playgroundPath = './Playground.jsx';
const Playground = import.meta.env.DEV && location.pathname === '/playground'
  ? React.lazy(() => import(/* @vite-ignore */ playgroundPath))
  : null;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {Playground ? <Suspense fallback={<p className="p-6">Loading playground…</p>}><Playground /></Suspense> : <App />}
  </React.StrictMode>,
);
