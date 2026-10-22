import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceShell from './WorkspaceShell';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceShell />
  </StrictMode>,
);
