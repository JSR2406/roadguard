import { useCallback, useRef, useState, type FormEvent } from 'react';
import { LogIn, LogOut, Save, ShieldCheck, UserPlus } from 'lucide-react';
import { EMPTY_PROFILE, type WorkspaceProfile } from './types';
import { ApiError, requestErrorMessage, serverApi, sessionFromResponse, useRequestScope, type AuthResponse, type Session } from './server-api';
import ServerCommerce from './ServerCommerce';
import './server-commerce.css';

type AuthMode = 'login' | 'register';
const emptyCredentials = { email: '', password: '', workspaceName: '' };

function ProfileField({ label, name, value, onChange, type = 'text', maxLength }: { label: string; name: keyof WorkspaceProfile; value: string; onChange: (name: keyof WorkspaceProfile, value: string) => void; type?: string; maxLength?: number }) {
  return <label className="server-field"><span>{label}</span><input type={type} required maxLength={maxLength} value={value} onChange={(event) => onChange(name, event.target.value)} /></label>;
}

export default function ServerWorkspace() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile>(EMPTY_PROFILE);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { begin, invalidate } = useRequestScope(session?.token);

  const clearSession = useCallback((expectedToken: string, message: string, failure = '') => {
    if (sessionRef.current?.token !== expectedToken) return;
    invalidate();
    sessionRef.current = null;
    pending.current = false;
    setSession(null); setProfile(EMPTY_PROFILE); setCredentials(emptyCredentials);
    setNotice(message); setError(failure); setBusy(false);
  }, [invalidate]);

  const onUnauthorized = useCallback((token: string) => {
    clearSession(token, '', 'Your session is no longer valid. Please sign in again.');
  }, [clearSession]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    const ticket = begin();
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await serverApi<AuthResponse>(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(credentials), signal: ticket.signal });
      if (!ticket.isCurrent()) return;
      const nextSession = sessionFromResponse(result);
      sessionRef.current = nextSession;
      setSession(nextSession); setProfile(nextSession.profile);
      setNotice(mode === 'register' ? 'Workspace created. Complete your business profile below.' : 'Signed in to your workspace.');
    } catch (requestError) {
      if (ticket.isCurrent()) setError(requestErrorMessage(requestError));
    } finally {
      if (ticket.isCurrent()) {
        setCredentials((current) => ({ ...current, password: '' }));
        pending.current = false; setBusy(false);
      }
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || pending.current) return;
    pending.current = true;
    const token = session.token;
    const ticket = begin();
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await serverApi<WorkspaceProfile>('/api/workspace/profile', { method: 'PUT', body: JSON.stringify(profile), signal: ticket.signal }, token);
      if (!ticket.isCurrent() || sessionRef.current?.token !== token) return;
      const nextSession = { ...sessionRef.current, profile: updated, workspace: { ...sessionRef.current.workspace, name: updated.workspaceName } };
      sessionRef.current = nextSession;
      setSession(nextSession); setProfile(updated); setNotice('Business profile saved on the server.');
    } catch (requestError) {
      if (!ticket.isCurrent() || sessionRef.current?.token !== token) return;
      if (requestError instanceof ApiError && requestError.status === 401) onUnauthorized(token);
      else setError(requestErrorMessage(requestError));
    } finally {
      if (ticket.isCurrent() && sessionRef.current?.token === token) { pending.current = false; setBusy(false); }
    }
  }

  async function logout() {
    if (!session || pending.current) return;
    pending.current = true;
    const token = session.token;
    const ticket = begin();
    setBusy(true); setError(''); setNotice('');
    try {
      await serverApi('/api/auth/logout', { method: 'POST', signal: ticket.signal }, token);
      if (ticket.isCurrent()) clearSession(token, 'Signed out. The server session was revoked and this page’s token was cleared.');
    } catch (requestError) {
      if (!ticket.isCurrent()) return;
      if (requestError instanceof ApiError && requestError.status === 401) onUnauthorized(token);
      else clearSession(token, '', `The token was cleared from this page, but server revocation could not be confirmed. ${requestErrorMessage(requestError)}`);
    }
  }

  function updateProfile(name: keyof WorkspaceProfile, value: string) {
    setProfile((current) => ({ ...current, [name]: value }));
    setError(''); setNotice('');
  }

  const messages = <>{error && <p className="server-error" role="alert">{error}</p>}{notice && <p className="server-notice" role="status">{notice}</p>}</>;

  if (!session) return <main className="server-workspace">
    <section className="server-card server-auth-card">
      <div className="server-kicker"><ShieldCheck size={16} aria-hidden="true" /> SERVER WORKSPACE</div>
      <h1>{mode === 'register' ? 'Create your workspace.' : 'Sign in to your workspace.'}</h1>
      <p className="server-intro">Manage your business profile, products, and saved quotes with the local SQLite API.</p>
      <div className="server-boundary"><ShieldCheck size={16} aria-hidden="true" /><span>Session tokens stay in memory. Reloading or leaving this view requires signing in again.</span></div>
      {messages}
      <form className="server-form" onSubmit={authenticate} aria-busy={busy}>
        <fieldset className="server-form server-fieldset" disabled={busy}>
          <label className="server-field"><span>Email</span><input type="email" autoComplete="username" required maxLength={320} value={credentials.email} onChange={(event) => { setCredentials({ ...credentials, email: event.target.value }); setError(''); }} /></label>
          <label className="server-field"><span>Password</span><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={credentials.password} onChange={(event) => { setCredentials({ ...credentials, password: event.target.value }); setError(''); }} /></label>
          {mode === 'register' && <label className="server-field"><span>Workspace name</span><input required maxLength={100} value={credentials.workspaceName} onChange={(event) => setCredentials({ ...credentials, workspaceName: event.target.value })} /></label>}
          <button className="server-primary" type="submit">{mode === 'register' ? <UserPlus size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}{busy ? 'Working…' : mode === 'register' ? 'Create workspace' : 'Sign in'}</button>
        </fieldset>
      </form>
      <button className="server-link server-auth-switch" disabled={busy} type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setCredentials((current) => ({ ...current, password: '' })); setError(''); setNotice(''); }}>{mode === 'login' ? 'Need a workspace? Register locally' : 'Already registered? Sign in'}</button>
    </section>
  </main>;

  return <main className="server-workspace">
    <section className="server-card server-profile-card">
      <div className="server-profile-header">
        <div><div className="server-kicker"><ShieldCheck size={16} aria-hidden="true" /> SERVER WORKSPACE · {session.workspace.role}</div><h1>{session.workspace.name}</h1><p className="server-intro">{session.user.email} · {session.profile.currency}<br />Workspace ID {session.workspace.id}</p></div>
        <button className="server-logout" type="button" disabled={busy} onClick={() => void logout()}><LogOut size={15} aria-hidden="true" />Sign out</button>
      </div>
      <div className="server-boundary"><ShieldCheck size={16} aria-hidden="true" /><span>Products and quotes are saved to this authenticated workspace by the local API.</span></div>
      {messages}
      <details className="server-profile-details">
        <summary>Business profile and defaults</summary>
        <p className="server-help">Changing currency keeps existing product and quote currencies intact. Unsaved commerce forms reset when currency or tax preference changes.</p>
        <form className="server-form profile-server-form" onSubmit={saveProfile} aria-busy={busy}>
          <fieldset className="server-fieldset" disabled={busy}><div className="server-grid">
            <ProfileField label="Workspace name" name="workspaceName" value={profile.workspaceName} onChange={updateProfile} maxLength={100} />
            <ProfileField label="Business display name" name="businessDisplayName" value={profile.businessDisplayName} onChange={updateProfile} maxLength={160} />
            <ProfileField label="Legal business name" name="legalName" value={profile.legalName} onChange={updateProfile} maxLength={160} />
            <ProfileField label="Business email" name="email" value={profile.email} onChange={updateProfile} type="email" maxLength={320} />
            <ProfileField label="Business phone" name="phone" value={profile.phone} onChange={updateProfile} type="tel" maxLength={40} />
            <label className="server-field"><span>Address</span><textarea required maxLength={300} rows={3} value={profile.address} onChange={(event) => updateProfile('address', event.target.value)} /></label>
            <label className="server-field"><span>Currency</span><select value={profile.currency} onChange={(event) => updateProfile('currency', event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></label>
            <label className="server-field"><span>Locale</span><select value={profile.locale} onChange={(event) => updateProfile('locale', event.target.value)}><option>en-US</option><option>en-CA</option><option>en-GB</option><option>fr-CA</option></select></label>
            <label className="server-field"><span>Tax preference</span><select value={profile.taxPreference} onChange={(event) => updateProfile('taxPreference', event.target.value)}><option value="prices_exclude_tax">Prices exclude tax</option><option value="prices_include_tax">Prices include tax</option><option value="tax_exempt">Tax exempt</option></select></label>
          </div><button className="server-primary" type="submit"><Save size={16} aria-hidden="true" />{busy ? 'Working…' : 'Save business profile'}</button></fieldset>
        </form>
      </details>
    </section>
    <ServerCommerce key={`${session.workspace.id}:${session.profile.currency}:${session.profile.taxPreference}`} token={session.token} profile={session.profile} disabled={busy} onUnauthorized={onUnauthorized} />
  </main>;
}
