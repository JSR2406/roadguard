import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Workspace from '../src/Workspace';
import App from '../src/App';
import LiveWorkspace from '../src/LiveWorkspace';
import { createRoadguardServer } from '../server/index.mjs';
import type { Hazard } from '../src/types';

const STORE = 'roadguard.demo.v1';
// Even temporary test-only credentials must not enter DOM failure dumps.
configure({ getElementError: message => new Error(message?.split('Here are the matching elements:')[0] ?? 'DOM assertion failed') });
const saved = (): Hazard[] => JSON.parse(localStorage.getItem(STORE)!).hazards;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('interactive synthetic workspace', () => {
  it('changes route, rider and night warnings without contaminating the server mode', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const warnings = screen.getByLabelText('Vehicle 01 warnings');
    expect(warnings.textContent).toContain('170 m');
    expect(warnings.textContent).toContain('310 m');
    await user.click(screen.getByLabelText('Two-wheeler mode'));
    expect(warnings.textContent).toContain('360 m');
    await user.selectOptions(screen.getByLabelText('Vehicle lighting (both vehicles)'), 'night');
    expect(warnings.textContent).toContain('420 m');
    await user.selectOptions(screen.getAllByLabelText('Route')[0], 'parallel');
    expect(warnings.textContent).not.toContain('critical pothole');
    await user.click(screen.getByRole('button', { name: 'Server workspace' }));
    expect(screen.getByText('Disconnected', { exact: false })).toBeTruthy();
    expect(screen.queryByLabelText('Vehicle 01 warnings')).toBeNull();
  });

  it('requires two independent clear reports and survives remount', async () => {
    const user = userEvent.setup();
    const mounted = render(<App />);
    const original = saved()[0];
    await user.click(screen.getByRole('button', { name: 'Request repair' }));
    expect(saved()[0].status).toBe('repair_pending');
    await new Promise(resolve => setTimeout(resolve, 5));
    await user.selectOptions(screen.getByLabelText('Source identity'), 'dashcam-C');
    await user.click(screen.getByRole('button', { name: 'Submit observation' }));
    expect(saved()[0].status).toBe('repair_pending');
    await user.click(screen.getByRole('button', { name: 'Submit observation' }));
    expect(saved()[0].status).toBe('repair_pending');
    await user.selectOptions(screen.getByLabelText('Source identity'), 'cctv-01');
    await user.click(screen.getByRole('button', { name: 'Submit observation' }));
    expect(saved()[0].status).toBe('repaired');
    mounted.unmount();
    render(<App />);
    expect(saved()[0].id).toBe(original.id);
    expect(saved()[0].status).toBe('repaired');
    expect(screen.getByLabelText('Vehicle 01 warnings').textContent).not.toContain('critical pothole');
  });

  it('validates storage-event updates and recovers from corrupt persisted data', async () => {
    const mounted = render(<App />);
    fireEvent(window, new StorageEvent('storage', { key: STORE, newValue: JSON.stringify({ version: 1, hazards: [] }), storageArea: localStorage }));
    expect(screen.getByText('No hazards match this filter.')).toBeTruthy();
    fireEvent(window, new StorageEvent('storage', { key: STORE, newValue: '{broken', storageArea: localStorage }));
    expect(screen.getByRole('alert').textContent).toContain('Cross-tab update rejected');
    mounted.unmount();
    localStorage.setItem(STORE, '{broken');
    render(<App />);
    expect(screen.getByRole('alert').textContent).toContain('could not be restored');
    await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(saved().length).toBe(6);
  });
});

describe('server-backed UI against a real ephemeral API', () => {
  it('connects, submits enrolled evidence, evaluates warnings and persists after restart', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'roadguard-ui-'));
    const credentials = [
      { role: 'reader' as const, token: randomBytes(32).toString('hex') },
      { role: 'source' as const, sourceId: 'camera-a', sourceType: 'dashcam' as const, token: randomBytes(32).toString('hex') },
    ];
    let server = createRoadguardServer({ databasePath: path.join(folder, 'test.sqlite'), credentials, allowedOrigin: 'http://localhost:3000' });
    const listen = () => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
    const originalFetch = globalThis.fetch;
    let port = await listen();
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => originalFetch(new URL(url, `http://127.0.0.1:${port}`), { ...init, headers: { ...init?.headers, Origin: 'http://localhost:3000' } }));
    try {
      const user = userEvent.setup();
      render(<LiveWorkspace />);
      await user.type(screen.getByLabelText('reader token'), credentials[0].token);
      await user.type(screen.getByLabelText('source token'), credentials[1].token);
      await user.click(screen.getByRole('button', { name: /^Connect$/ }));
      await screen.findByText('No server evidence yet.', { exact: false });
      await user.selectOptions(screen.getByLabelText('Hazard category'), 'animal_on_road');
      await user.click(screen.getByLabelText('Night conditions'));
      await user.click(screen.getByRole('button', { name: 'Submit manual evidence' }));
      await waitFor(() => expect(screen.getByRole('status', { name: 'Pilot operation status' }).textContent).toContain('Source receipt: accepted'));
      expect(screen.getByText('Animal on road', { selector: 'td' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Evaluate server alerts' }));
      await waitFor(() => expect(screen.getAllByRole('status').some(el => el.textContent?.includes('Provisional — unverified'))).toBe(true));
      expect(localStorage.length).toBe(0); // no token or server evidence persisted by UI
      await server.shutdown();
      server = createRoadguardServer({ databasePath: path.join(folder, 'test.sqlite'), credentials, allowedOrigin: 'http://localhost:3000' });
      port = await listen();
      await user.click(screen.getByRole('button', { name: 'Refresh connection' }));
      await waitFor(() => expect(screen.getByRole('status', { name: 'Pilot operation status' }).textContent).toContain('Connected to persistent'));
      expect(screen.getByText('Animal on road', { selector: 'td' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Disconnect / clear tokens' }));
      expect((screen.getByLabelText('reader token') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('source token') as HTMLInputElement).value).toBe('');
      expect(screen.queryByText('Animal on road', { selector: 'td' })).toBeNull();
    } finally { cleanup(); await server.shutdown(); rmSync(folder, { recursive: true, force: true }); }
  }, 20000);
});
