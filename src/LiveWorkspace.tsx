import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { hazardLabel } from './engine';
import type { Hazard, HazardAlert, HazardType, Observation, Vehicle } from './types';
import { useI18n } from './i18n';
import { inspectBrowserCamera, openStreetMapUrl, startGpsWatch, type CameraCapability, type GpsState } from './device';

type Credentials = { reader: string; authority: string; source: string };
const emptyCredentials: Credentials = { reader: '', authority: '', source: '' };
const segmentLength = { 'main-east': 1200, 'parallel-east': 1200, 'branch-north': 800 };

/** Server mode is intentionally isolated from synthetic/localStorage evidence. */
export default function LiveWorkspace() {
  const { t } = useI18n();
  const [credentials, setCredentials] = useState<Credentials>(emptyCredentials);
  const [connected, setConnected] = useState(false);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Connect to the same-origin pilot API. Tokens stay in memory only.');
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>();
  const [segment, setSegment] = useState<keyof typeof segmentLength>('main-east');
  const [offset, setOffset] = useState(320);
  const [type, setType] = useState<HazardType>('pothole');
  const [sourceId, setSourceId] = useState('');
  const [finding, setFinding] = useState<Observation['finding']>('pothole');
  const [night, setNight] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [position, setPosition] = useState(150);
  const [rider, setRider] = useState(false);
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [camera, setCamera] = useState<CameraCapability>({ status: 'unavailable', count: 0, message: 'Camera capability not checked.' });
  const [gpsActive, setGpsActive] = useState(false);
  const mounted = useRef(true);
  const session = useRef(0);
  const latestCursor = useRef(0);
  const alertGeneration = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current++; }; }, []);
  useEffect(() => { if (!gpsActive) return undefined; const stop = startGpsWatch(setGps, setGps); return () => stop(); }, [gpsActive]);

  async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
    if (!token.trim()) throw new Error('A token for this role is required.');
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${result.error ?? result.reason ?? 'Request rejected'}`);
    return result as T;
  }
  async function refresh(token = credentials.reader, generation = session.current) {
    const result = await api<{ hazards: Hazard[]; cursor: number }>('/api/hazards', token);
    if (!Array.isArray(result.hazards) || !Number.isSafeInteger(result.cursor)) throw new Error('Invalid API snapshot');
    if (mounted.current && generation === session.current && result.cursor >= latestCursor.current) {
      if (result.cursor !== latestCursor.current) { alertGeneration.current++; setAlerts([]); }
      latestCursor.current = result.cursor; setHazards(result.hazards); setCursor(result.cursor); setLastRefresh(Date.now());
    }
  }
  async function connect(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const generation = ++session.current;
    try { await refresh(credentials.reader, generation); if (mounted.current && generation === session.current) { setConnected(true); setNotice('Connected to persistent pilot storage. No synthetic records are uploaded.'); } }
    catch (err) { setError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    let running = false;
    const generation = session.current;
    const tick = async () => {
      if (running) return; running = true;
      try { await refresh(credentials.reader, generation); if (!stopped) setError(''); }
      catch (err) { if (!stopped) { setError(`Connection degraded; displayed snapshot may be stale. ${err instanceof Error ? err.message : 'Request failed'}`); setAlerts([]); } }
      finally { running = false; }
    };
    const timer = window.setInterval(tick, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [connected, credentials.reader]);

  async function action(operation: () => Promise<void>) {
    setBusy(true); setError('');
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Operation failed'); }
    finally { setBusy(false); }
  }
  const disconnect = () => {
    session.current++; latestCursor.current = 0; alertGeneration.current++; setConnected(false); setCredentials(emptyCredentials); setHazards([]); setAlerts([]); setCursor(0); setLastRefresh(undefined); setNotice('Disconnected. In-memory tokens cleared.'); setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action(async () => {
      const body: Partial<Observation> = { id: crypto.randomUUID(), segmentId: segment, offsetM: offset, direction: 1, hazardType: type, finding, observedAt: Date.now(), severity: 'high', confidence: .9, clearView: true, lighting: night ? 'night' : 'day' };
      if (sourceId) body.sourceId = sourceId;
      const receipt = await api<{ status: string; reason: string }>('/api/observations', credentials.source, body);
      await refresh(); setAlerts([]); setNotice(`Source receipt: ${receipt.status}. ${receipt.reason}. This is manual evidence, not model inference.`);
    });
  };
  const calculate = () => void action(async () => {
    const generation = alertGeneration.current;
    const currentSession = session.current;
    const vehicle: Vehicle = { id: 'pilot-driver', kind: rider ? 'two-wheeler' : 'car', speedKph: speed, route: [{ segmentId: segment, direction: 1, lengthM: segmentLength[segment] }], legIndex: 0, offsetM: position, lighting: night ? 'night' : 'day' };
    const result = await api<{ alerts: HazardAlert[] }>('/api/alerts', credentials.reader, vehicle);
    if (mounted.current && generation === alertGeneration.current && currentSession === session.current) {
      setAlerts(result.alerts); setNotice('Server evaluated the manually supplied directed route. Not live GPS or driving advice.');
    }
  });

  // A previously computed alert must not survive expired evidence or changed controls.
  useEffect(() => { alertGeneration.current++; setAlerts([]); }, [segment, position, speed, rider, night]);
  useEffect(() => { if (!alerts.length) return; const timer = window.setTimeout(() => setAlerts([]), 5000); return () => window.clearTimeout(timer); }, [alerts]);

  return <main className="pilot-workspace">
    <header><p className="eyebrow">SELF-HOSTED PILOT</p><h1>{t('server')}</h1><p>Authenticated API · server-side evidence · single-node SQLite</p></header>
    <div className="simulation-banner"><div><strong>Not road-safety validated.</strong><span>Fixed road segments, manually supplied location, no connected camera or GPS. {t('animalIncident')}; no emergency service is contacted.</span></div></div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <p role="status" aria-label="Pilot operation status" className="notice">{notice}</p>
    <section className="panel pilot-section"><h2>Vehicle input bridge</h2>
      <p>Use device GPS only with permission. This browser check is not a vehicle-camera or CAN connection; real cars must publish the authenticated JSON-line camera/GPS contract in <code>docs/integration-contract.md</code>.</p>
      <div className="pilot-fields"><button className="button secondary" type="button" onClick={() => setGpsActive(value => !value)}>{gpsActive ? 'Stop GPS watch' : 'Use device GPS'}</button><button className="button secondary" type="button" onClick={() => void inspectBrowserCamera().then(setCamera)}>Check browser camera</button><span className="subtle-pill">GPS: {gps.status}</span><span className="subtle-pill">Camera: {camera.status}</span></div>
      <p>{gps.message ?? (gps.latitude !== undefined ? `Live position ${gps.latitude.toFixed(5)}, ${gps.longitude?.toFixed(5)} · ±${Math.round(gps.accuracyM ?? 0)} m` : 'No location received.')}</p>
      <p>{camera.message}</p>
      {gps.latitude !== undefined && gps.longitude !== undefined && <a className="button secondary" href={openStreetMapUrl(gps.latitude, gps.longitude)} target="_blank" rel="noreferrer">Open current position in OpenStreetMap</a>}
      <p className="helper">A map link is only a visualisation. The server will not convert this browser position into a hazard location without a deployed route matcher, accuracy threshold and heading check.</p>
    </section>
    <section className="panel pilot-section"><h2>Connection and access</h2>
      <p>Use credentials provisioned on your server. Never paste tokens into chat. Reader access is required; authority and source tokens are optional and role-separated.</p>
      <form onSubmit={connect} className="pilot-fields">
        {(['reader', 'authority', 'source'] as const).map(role => <label className="field" key={role}>{role} token<input aria-label={`${role} token`} disabled={busy} type="password" autoComplete="off" value={credentials[role]} onChange={e => { setCredentials({ ...credentials, [role]: e.target.value }); if (role === 'reader') { session.current++; setConnected(false); setHazards([]); setAlerts([]); } }} /></label>)}
        <button className="button primary" disabled={busy || !credentials.reader}>{connected ? 'Refresh connection' : 'Connect'}</button>
        <button className="button secondary" type="button" disabled={busy} onClick={disconnect}>Disconnect / clear tokens</button>
      </form>
      <p>{connected ? 'Connected' : 'Disconnected'} · event cursor {cursor} · {lastRefresh ? `Snapshot received ${new Date(lastRefresh).toLocaleTimeString()}` : 'No server snapshot'}</p>
    </section>
    {connected && <>
      <section className="panel pilot-section"><h2>Authority response queue ({hazards.length})</h2>
        <p>Snapshots refresh every 5 s. Expiry is not clearance; animal-on-road reports expire after 60 s and incident reports after 5 min.</p>
        {!hazards.length ? <p>No server evidence yet. Submit a permitted source observation below.</p> : <div className="table-scroll"><table><thead><tr><th>Hazard</th><th>Location</th><th>Status</th><th>Authority action</th></tr></thead><tbody>{hazards.map(h => <tr key={h.id}><td>{hazardLabel(h)}</td><td>{h.segmentId} · {h.offsetM} m</td><td>{h.status}</td><td><button className="button secondary" disabled={busy || !credentials.authority || h.status !== 'verified'} onClick={() => void action(async () => { await api(`/api/hazards/${encodeURIComponent(h.id)}/resolve`, credentials.authority, {}); await refresh(); setNotice('Response requested. Fresh independent clear evidence is still required.'); })}>Request response</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel pilot-section"><h2>Enrolled source — manual observation</h2><p>For integration testing only. A confidence value is not a measured model score. Repeated frames from one enrolled source cannot independently corroborate a hazard.</p>
        <form onSubmit={submit}>
          <div className="pilot-fields">
            <label className="field">Expected source identity (optional)<input value={sourceId} onChange={e => setSourceId(e.target.value)} maxLength={160} /></label>
            <label className="field">Segment<select value={segment} onChange={e => { const next = e.target.value as keyof typeof segmentLength; setSegment(next); setPosition(Math.min(position, segmentLength[next])); setOffset(Math.min(offset, segmentLength[next])); }} >{Object.keys(segmentLength).map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="field">Hazard category<select value={type} onChange={e => setType(e.target.value as HazardType)}><option value="pothole">{t('pothole')}</option><option value="animal_on_road">{t('animalRoad')}</option><option value="animal_incident">{t('animalIncident')}</option></select></label>
            <label className="field">Road offset (m)<input required type="number" min={0} max={segmentLength[segment]} value={offset} onChange={e => setOffset(Number(e.target.value))} /></label>
            <label className="field">Finding<select value={finding} onChange={e => setFinding(e.target.value as Observation['finding'])}><option value="pothole">Positive hazard observation</option><option value="clear">Explicit clear view of hazard location</option></select></label>
          </div>
          <button className="button primary" disabled={busy || !credentials.source}>Submit manual evidence</button>
        </form>
      </section>
      <section className="panel pilot-section"><h2>Route-aware server alert check</h2>
        <div className="pilot-fields"><label className="field">Vehicle position (m)<input type="number" required min={0} max={segmentLength[segment]} value={position} onChange={e => setPosition(Number(e.target.value))} /></label><label className="field">Speed (km/h)<input type="number" required min={0} max={200} value={speed} onChange={e => setSpeed(Number(e.target.value))} /></label><label className="check-field"><input type="checkbox" checked={rider} onChange={e => setRider(e.target.checked)} />Two-wheeler</label><label className="check-field"><input type="checkbox" checked={night} onChange={e => setNight(e.target.checked)} />Night conditions</label><button className="button primary" disabled={busy} onClick={calculate}>Evaluate server alerts</button></div>
        {alerts.length ? alerts.map(a => <p key={a.hazardId} role="status" className="driver-alert">{a.message} Warning threshold {a.warningDistanceM} m.</p>) : <p>No current evaluated alerts. Click Evaluate; an empty result is not proof that the road is safe. Displayed results clear after 5 s.</p>}
      </section>
    </>}
  </main>;
}
