import { useState } from 'react';
import App from './App';
import ServerWorkspace from './ServerWorkspace';

export default function WorkspaceShell() {
  const [mode, setMode] = useState<'local' | 'server'>('local');
  return <><nav className="workspace-switch" aria-label="Commerce Studio workspace mode"><strong>Commerce Studio</strong><button type="button" aria-pressed={mode === 'local'} onClick={() => setMode('local')}>Local demo</button><button type="button" aria-pressed={mode === 'server'} onClick={() => setMode('server')}>Server foundation</button><span>{mode === 'local' ? 'Browser-local onboarding, products, and quotes' : 'SQLite auth, membership, profile, and audit foundation'}</span></nav>{mode === 'local' ? <App /> : <ServerWorkspace />}</>;
}
