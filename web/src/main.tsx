import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Entry point: mount the React tree into the <div id="root"> from index.html.
// StrictMode renders components twice in development to surface side-effect bugs early.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
