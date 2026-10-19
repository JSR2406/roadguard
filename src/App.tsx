import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowDownUp, ArrowRight, Car, CheckCheck, ChevronRight, CircleAlert, ClipboardCheck, FlaskConical, GitBranch, LayoutDashboard, MapPin, Navigation, Radio, RotateCcw, ShieldCheck, SlidersHorizontal, TriangleAlert, Wrench } from 'lucide-react';
import { getAlerts, hazardLabel, ingestObservation, priorityScore, requestResolution, warningDistance } from './engine';
import type { Hazard, HazardAlert, HazardType, Lighting, Observation, Severity, Vehicle } from './types';
import './styles.css';
import { useI18n } from './i18n';

const STORE = 'roadguard.demo.v1';
const SEGMENTS = [{ id: 'main-east', name: 'Main corridor', length: 1200 }, { id: 'parallel-east', name: 'Parallel service road', length: 1200 }, { id: 'branch-north', name: 'North connector', length: 800 }];
const SOURCES = ['dashcam-A', 'dashcam-B', 'dashcam-C', 'cctv-01'];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
const STATUS_LABELS: Record<Hazard['status'], string> = { candidate: 'Provisional — unverified', verified: 'Verified evidence', repair_pending: 'Response / clearance pending', repaired: 'Resolved / cleared' };
const uid = () => globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'The operation could not be completed.';
const segmentName = (id: string) => SEGMENTS.find(s => s.id === id)?.name ?? id;

function seedHazards(): Hazard[] {
  const now = Date.now();
  let hazards: Hazard[] = [];
  const evidence = (segmentId: string, offsetM: number, severity: Severity, sources: string[]) => {
    sources.forEach((sourceId, index) => {
      const observedAt = now - 40_000 + index * 10_000;
      hazards = ingestObservation(hazards, { id: uid(), sourceId, sourceType: sourceId.startsWith('cctv') ? 'cctv' : 'dashcam', segmentId, direction: 1, offsetM, severity, confidence: 0.96, observedAt, clearView: true, finding: 'pothole' }, now);
    });
  };
  evidence('main-east', 320, 'critical', ['dashcam-A', 'dashcam-B']);
  evidence('main-east', 880, 'medium', ['dashcam-B', 'cctv-01']);
  evidence('parallel-east', 440, 'high', ['dashcam-C']);
  evidence('branch-north', 200, 'high', ['dashcam-A', 'cctv-01']);
  hazards = ingestObservation(hazards, { id: uid(), sourceId: 'dashcam-C', sourceType: 'dashcam', segmentId: 'main-east', direction: 1, offsetM: 380, severity: 'medium', confidence: 0.94, observedAt: now, clearView: true, finding: 'pothole', hazardType: 'animal_on_road', lighting: 'night' }, now);
  hazards = ingestObservation(hazards, { id: uid(), sourceId: 'cctv-01', sourceType: 'cctv', segmentId: 'main-east', direction: 1, offsetM: 600, severity: 'high', confidence: 0.92, observedAt: now, clearView: true, finding: 'pothole', hazardType: 'animal_incident', lighting: 'night' }, now);
  return hazards;
}

function isObservation(value: unknown): value is Observation {
  if (!value || typeof value !== 'object') return false;
  const o = value as Observation;
  return typeof o.id === 'string' && typeof o.sourceId === 'string' && ['dashcam', 'cctv'].includes(o.sourceType) && SEGMENTS.some(s => s.id === o.segmentId && Number.isFinite(o.offsetM) && o.offsetM >= 0 && o.offsetM <= s.length) && [1, -1].includes(o.direction) && Number.isFinite(o.confidence) && o.confidence >= 0 && o.confidence <= 1 && SEVERITIES.includes(o.severity) && Number.isFinite(o.observedAt) && typeof o.clearView === 'boolean' && ['pothole', 'clear'].includes(o.finding);
}
function parseStore(raw: string): Hazard[] {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('hazards' in data) || !Array.isArray(data.hazards)) throw new Error('Saved demo has an unsupported schema. Reset the demo to recover.');
  if (!data.hazards.every((h: Hazard) => h && typeof h.id === 'string' && SEGMENTS.some(s => s.id === h.segmentId && Number.isFinite(h.offsetM) && h.offsetM >= 0 && h.offsetM <= s.length) && [1, -1].includes(h.direction) && SEVERITIES.includes(h.severity) && Object.hasOwn(STATUS_LABELS, h.status) && Number.isFinite(h.firstSeen) && Number.isFinite(h.lastSeen) && (h.repairRequestedAt === undefined || Number.isFinite(h.repairRequestedAt)) && Array.isArray(h.observations) && h.observations.every(isObservation))) throw new Error('Saved demo contains invalid records. Reset the demo to recover.');
  const hazards = data.hazards as Hazard[];
  if (new Set(hazards.map(h => h.id)).size !== hazards.length) throw new Error('Saved demo contains duplicate hazard identities. Reset the demo to recover.');
  // Use the engine's validation as well, so malformed restored data cannot crash rendering.
  hazards.forEach(h => priorityScore(h));
  return hazards;
}
function initialState(): { hazards: Hazard[]; error: string } {
  try {
    const raw = localStorage.getItem(STORE);
    return { hazards: raw ? parseStore(raw) : seedHazards(), error: '' };
  } catch (error) {
    try { return { hazards: seedHazards(), error: `Demo data could not be restored: ${messageOf(error)}` }; }
    catch (seedError) { return { hazards: [], error: `Demo initialization failed: ${messageOf(seedError)}` }; }
  }
}
function makeVehicle(id: string, route: string, position: number, speedKph: number, kind: Vehicle['kind']): Vehicle {
  const legs = route === 'parallel' ? [{ segmentId: 'parallel-east', direction: 1 as const, lengthM: 1200 }] : [{ segmentId: 'main-east', direction: 1 as const, lengthM: 1200 }, { segmentId: 'branch-north', direction: 1 as const, lengthM: 800 }];
  return { id, speedKph, kind, route: legs, legIndex: route === 'main' && position >= 1200 ? 1 : 0, offsetM: route === 'main' && position >= 1200 ? position - 1200 : position };
}
function vehiclePoint(vehicle: Vehicle) {
  const segment = vehicle.route[vehicle.legIndex].segmentId;
  return segment === 'branch-north' ? { x: 760, y: 300 - vehicle.offsetM / 800 * 220 } : { x: 80 + vehicle.offsetM / 1200 * 680, y: segment === 'parallel-east' ? 410 : 300 };
}
function safeAlerts(hazards: Hazard[], vehicle: Vehicle, now: number): { items: HazardAlert[]; error: string } {
  try { return { items: getAlerts(hazards, vehicle, now), error: '' }; }
  catch (error) { return { items: [], error: messageOf(error) }; }
}
function AlertList({ alerts, error, label }: { alerts: HazardAlert[]; error: string; label: string }) {
  const { t } = useI18n();
  return <div className="alert-list" aria-live="polite" aria-label={label}>
    {error ? <p className="error-inline">{t('alertFailed', { fallback: 'Alert calculation failed' })}: {error}</p> : alerts.length ? alerts.map(alert => <div className={`driver-alert ${alert.severity}`} key={alert.hazardId}>
      <TriangleAlert size={20} aria-hidden="true" /><div><strong>{alert.message || 'Road hazard ahead'}</strong><span>{Math.round(alert.distanceM)} m ahead · warning zone {Math.round(alert.warningDistanceM)} m{alert.provisional ? ' · Provisional' : ' · Confirmed evidence'}</span></div>
    </div>) : <div className="clear-alert"><ShieldCheck size={20} aria-hidden="true" /><div><strong>{t('noHazards')}</strong><span>{t('upcoming')}</span></div></div>}
  </div>;
}

export default function App() {
  const { t } = useI18n();
  const [initial] = useState(initialState);
  const [hazards, setHazards] = useState(initial.hazards);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('Demo evidence loaded. Select a hazard to inspect its source history.');
  const [view, setView] = useState<'overview' | 'driver' | 'notes'>('overview');
  const [selectedId, setSelectedId] = useState(initial.hazards[0]?.id ?? '');
  const [filter, setFilter] = useState('active');
  const [sort, setSort] = useState<'priority' | 'recent' | 'offset'>('priority');
  const [route, setRoute] = useState('main');
  const [position, setPosition] = useState(150);
  const [speed, setSpeed] = useState(60);
  const [kind, setKind] = useState<Vehicle['kind']>('car');
  const [lighting, setLighting] = useState<Lighting>('day');
  const [hazardType, setHazardType] = useState<HazardType>('pothole');
  const [evidenceLighting, setEvidenceLighting] = useState<Lighting>('unknown');
  const [secondRoute, setSecondRoute] = useState('main');
  const [secondPosition, setSecondPosition] = useState(50);
  const [secondSpeed, setSecondSpeed] = useState(80);
  const [now, setNow] = useState(Date.now());
  const [source, setSource] = useState('dashcam-C');
  const [segment, setSegment] = useState('main-east');
  const [offset, setOffset] = useState(320);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [severity, setSeverity] = useState<Severity>('critical');
  const [confidence, setConfidence] = useState(96);
  const [finding, setFinding] = useState<'pothole' | 'clear'>('pothole');
  const [clearView, setClearView] = useState(true);
  const [sharedAt, setSharedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORE)) localStorage.setItem(STORE, JSON.stringify({ version: 1, hazards: initial.hazards }));
    } catch (storageError) { setError(`Demo storage is unavailable; changes will stay in this tab: ${messageOf(storageError)}`); }
  }, [initial]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== STORE && event.key !== null)) return;
      try {
        if (event.newValue === null) { setHazards([]); setNotice('Shared demo storage was cleared in another tab. Reset to restore sample evidence.'); }
        else { setHazards(parseStore(event.newValue)); setNotice('Demo evidence updated from another tab in this browser.'); }
        setSharedAt(Date.now()); setNow(Date.now()); setError('');
      } catch (syncError) { setError(`Cross-tab update rejected: ${messageOf(syncError)}`); }
    };
    window.addEventListener('storage', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', sync); };
  }, []);

  const commit = (next: Hazard[], text: string) => {
    setHazards(next); setNow(Date.now()); setNotice(text); setError('');
    try { localStorage.setItem(STORE, JSON.stringify({ version: 1, hazards: next })); }
    catch (storageError) { setError(`Changes are available in this tab, but could not be saved or shared: ${messageOf(storageError)}`); }
  };
  const vehicle = makeVehicle('vehicle-01', route, position, speed, kind);
  const secondVehicle = makeVehicle('vehicle-02', secondRoute, secondPosition, secondSpeed, 'car');
  vehicle.lighting = lighting;
  secondVehicle.lighting = lighting;
  const alerts = safeAlerts(hazards, vehicle, now);
  const secondAlerts = safeAlerts(hazards, secondVehicle, now);
  const selected = hazards.find(h => h.id === selectedId) ?? hazards[0];
  const active = hazards.filter(h => h.status !== 'repaired' && priorityScore(h, now) > 0);
  const verified = active.filter(h => h.status === 'verified' || h.status === 'repair_pending');
  const sourceCount = new Set(hazards.flatMap(h => h.observations.map(o => o.sourceId))).size;
  const observations = hazards.reduce((total, h) => total + h.observations.length, 0);
  const rows = useMemo(() => hazards.filter(h => filter === 'all' || (filter === 'active' ? h.status !== 'repaired' && priorityScore(h, now) > 0 : h.status === filter)).sort((a, b) => sort === 'recent' ? b.lastSeen - a.lastSeen : sort === 'offset' ? a.offsetM - b.offsetM : priorityScore(b, now) - priorityScore(a, now)), [hazards, filter, sort, now]);
  const useLocation = (hazard: Hazard) => { setSegment(hazard.segmentId); setOffset(hazard.offsetM); setDirection(hazard.direction); setSeverity(hazard.severity); setHazardType(hazard.hazardType ?? 'pothole'); setEvidenceLighting(hazard.lighting ?? 'unknown'); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const observedAt = Date.now();
      const observation: Observation = { id: uid(), sourceId: source, sourceType: source.startsWith('cctv') ? 'cctv' : 'dashcam', segmentId: segment, direction, offsetM: offset, confidence: confidence / 100, severity, observedAt, clearView, finding, hazardType, lighting: evidenceLighting };
      const next = ingestObservation(hazards, observation, observedAt);
      if (next === hazards) {
        setNotice('Observation evaluated but not admitted. Evidence must have an unobstructed view and at least 70% confidence; clear-road evidence must match an existing hazard.');
        setError('');
        return;
      }
      commit(next, `${finding === 'clear' ? 'Explicit clearance' : hazardLabel(observation)} evidence submitted by ${source}. Status is determined by the evidence engine.`);
      const matched = next.find(h => h.observations.some(o => o.id === observation.id));
      if (matched) setSelectedId(matched.id);
    } catch (engineError) { setError(`Observation rejected: ${messageOf(engineError)}`); }
  };
  const repair = () => {
    if (!selected) return;
    try { commit(requestResolution(hazards, selected.id, Date.now()), 'Response / clearance requested locally. Two fresh, independent explicit clear observations are required to validate completion.'); useLocation(selected); setFinding('clear'); }
    catch (engineError) { setError(`Response request rejected: ${messageOf(engineError)}`); }
  };
  const reset = () => {
    try { const next = seedHazards(); commit(next, 'Demo reset with fresh, independent source evidence.'); setSelectedId(next[0]?.id ?? ''); setPosition(150); setSpeed(60); setRoute('main'); setSecondRoute('main'); setSecondPosition(50); setFinding('pothole'); }
    catch (engineError) { setError(`Reset failed: ${messageOf(engineError)}`); }
  };

  return <div className="app-shell">
     <a className="skip-link" href="#main-content">{t('skip')}</a>
    <aside className="sidebar">
      <a className="brand" href="#main-content" onClick={() => setView('overview')}><span className="brand-icon"><ShieldCheck size={25} aria-hidden="true" /></span><span>RoadGuard<small>HAZARD INTELLIGENCE</small></span></a>
      <div className="workspace-label">AUTHORITY WORKSPACE <span>DEMO</span></div>
      <nav aria-label="Main navigation">
         <button className={view === 'overview' ? 'nav-item selected' : 'nav-item'} aria-current={view === 'overview' ? 'page' : undefined} onClick={() => setView('overview')}><LayoutDashboard size={19} aria-hidden="true" />{t('navOverview')}<ChevronRight size={16} aria-hidden="true" /></button>
         <button className={view === 'driver' ? 'nav-item selected' : 'nav-item'} aria-current={view === 'driver' ? 'page' : undefined} onClick={() => setView('driver')}><Navigation size={19} aria-hidden="true" />{t('navDriver')}</button>
         <button className={view === 'notes' ? 'nav-item selected' : 'nav-item'} aria-current={view === 'notes' ? 'page' : undefined} onClick={() => setView('notes')}><ClipboardCheck size={19} aria-hidden="true" />{t('navNotes')}</button>
      </nav>
      <div className="sidebar-network"><span className="eyebrow">DEMONSTRATION NETWORK</span><div><span className="status-dot" />Local simulation</div><p>3 directed road segments<br />2 independently evaluated vehicles</p><div className="network-mini"><GitBranch size={48} aria-hidden="true" /><span>Observe.<br />Verify.<br />Prioritize.</span></div></div>
      <div className="sidebar-bottom"><span className="avatar">RG</span><div>Road operations<small>Local authority demo</small></div><ShieldCheck size={17} aria-hidden="true" /></div>
    </aside>
    <div className="workspace">
       <header className="topbar"><div className="breadcrumb">{t('workspace')} <ChevronRight size={14} aria-hidden="true" /><strong>{view === 'overview' ? t('navOverview') : view === 'driver' ? t('navDriver') : t('navNotes')}</strong></div><span className="local-badge"><span className="status-dot" />Browser-local demo</span></header>
      <main id="main-content" tabIndex={-1}>
         <div className="page-heading"><div><div className="eyebrow">ROAD SAFETY OPERATIONS</div><h1>{view === 'overview' ? t('overviewHeading') : view === 'driver' ? t('driverHeading') : t('notesHeading')}</h1><p>{view === 'overview' ? 'Turn independent observations into actionable road intelligence.' : view === 'driver' ? 'Explore how route, position and speed change each vehicle’s alerts.' : 'An inspectable prototype, with explicit boundaries and reproducible checks.'}</p></div><button className="button secondary" onClick={reset}><RotateCcw size={16} aria-hidden="true" />{t('reset')}</button></div>
         <div className="simulation-banner"><FlaskConical size={20} aria-hidden="true" /><div><strong>{t('simulation')}</strong><span>{t('synthetic')}</span></div><span className="outline-tag">{t('prototype')}</span></div>
        {error && <div className="error-banner" role="alert"><CircleAlert size={20} aria-hidden="true" /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">Dismiss</button></div>}
        <div className="notice" role="status"><Activity size={14} aria-hidden="true" />{notice}</div>

        {view === 'notes' ? <section className="notes-grid" aria-label="Validation notes">
          <article className="panel note-card"><div className="note-number">01 / EVIDENCE</div><h2>Identity is part of the signal.</h2><p>Seed hazards are created by submitting observations through the same engine as the form. The main corridor and north connector have two distinct sources; the parallel road starts with one provisional report.</p><ol><li>Select the parallel-road hazard and use its location.</li><li>Submit high-confidence pothole evidence from a different source.</li><li>Inspect the status and evidence history. Repeated submissions from the same identity do not represent independent observers.</li></ol></article>
          <article className="panel note-card"><div className="note-number">02 / ROUTE RELEVANCE</div><h2>Nearby does not mean ahead.</h2><p>The network is a schematic, not a real map. Main east is 1,200 m, parallel east is 1,200 m, and the north branch is 800 m. All default route legs use direction +1.</p><ol><li>Switch vehicle 01 to the parallel road. Main-road warnings should disappear.</li><li>Move beyond a hazard to exclude it from upcoming alerts.</li><li>Switch to two-wheeler mode or change speed to compare warning distances.</li><li>Move along the main route beyond 1,200 m to reach the north branch.</li></ol></article>
          <article className="panel note-card"><div className="note-number">03 / RESPONSE LIFECYCLE</div><h2>A request is not a resolution.</h2><p>Select a current verified hazard and request repair for a pothole or response / clearance for an animal report. This prepares the observation form for explicit clear evidence of the same hazard type at the same location; the request alone does not resolve it.</p><p>Submit two fresh, high-confidence clear observations from independent sources. Animal on road warnings expire after 60 seconds, possible incident warnings after 5 minutes; expiry does not prove clearance. Possible incidents require review and never trigger automatic emergency reporting.</p></article>
          <article className="panel note-card"><div className="note-number">04 / DEMO BOUNDARIES</div><h2>Local sharing, honestly labeled.</h2><p>Changes are stored in a versioned localStorage record. Another tab at the same origin receives storage events and recalculates its own vehicle’s alerts. Open the demo in a second tab and submit an observation here.</p><p><strong>This is not deployed V2V.</strong> There is no camera inference, live GPS, backend, repair dispatch or connected vehicle network. Storage can be unavailable or cleared; errors are surfaced and Reset demo restores sample evidence.</p><span className="subtle-pill">Schema v1 · {sharedAt ? `Last received ${time(sharedAt)}` : 'No cross-tab update received'}</span></article>
        </section> : <>
          {view === 'overview' && <section className="kpi-grid" aria-label="Network statistics">
            <article className="kpi"><div><span>Active hazards</span><TriangleAlert size={19} aria-hidden="true" /></div><strong>{active.length.toString().padStart(2, '0')}</strong><p><span className="small-dot red" />{active.filter(h => h.severity === 'critical' || h.severity === 'high').length} high / critical severity</p></article>
            <article className="kpi"><div><span>Verified & open</span><ShieldCheck size={19} aria-hidden="true" /></div><strong>{verified.length.toString().padStart(2, '0')}</strong><p>Independent evidence validated</p></article>
            <article className="kpi"><div><span>Response queue</span><Wrench size={19} aria-hidden="true" /></div><strong>{active.filter(h => h.status === 'repair_pending').length.toString().padStart(2, '0')}</strong><p>Awaiting explicit clearance evidence</p></article>
            <article className="kpi"><div><span>Evidence sources</span><Radio size={19} aria-hidden="true" /></div><strong>{sourceCount.toString().padStart(2, '0')}</strong><p>{observations} observations · synthetic inputs</p></article>
          </section>}
          <div className="network-grid">
            <section className="panel network-panel" aria-labelledby="network-title"><div className="panel-heading"><div><h2 id="network-title">Network intelligence</h2><p>Directed road schematic · not a real map</p></div><span className="subtle-pill"><span className="status-dot" />{active.length} open</span></div>
              <div className="schematic"><svg viewBox="0 0 900 480" role="img" aria-labelledby="map-title map-desc"><title id="map-title">Schematic road network with hazards and two simulated vehicles</title><desc id="map-desc">Main east runs east for 1200 meters, then the route follows the north branch for 800 meters. Parallel east is a separate 1200 meter road. Select hazard markers to inspect evidence.</desc>
                <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#dce4e3" strokeWidth="0.7" /></pattern><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#7d9390" /></marker></defs>
                <rect width="900" height="480" fill="#f0f4f1" /><rect width="900" height="480" fill="url(#grid)" />
                <g fill="#e4eae4" stroke="#d9e2da"><rect x="105" y="72" width="130" height="160" rx="8" /><rect x="260" y="110" width="160" height="120" rx="8" /><rect x="455" y="70" width="240" height="88" rx="8" /><rect x="455" y="180" width="240" height="52" rx="8" /><rect x="110" y="342" width="210" height="28" rx="5" /><rect x="360" y="342" width="330" height="28" rx="5" /></g>
                <text x="130" y="160" className="map-area">WEST DISTRICT</text><text x="490" y="120" className="map-area">NORTH PRECINCT</text>
                <path d="M80 300H760V80 M80 410H760" stroke="#d0dad6" strokeWidth="37" fill="none" strokeLinejoin="round" />
                <path d="M80 300H760V80 M80 410H760" stroke="#fff" strokeWidth="31" fill="none" strokeLinejoin="round" />
                <path d={route === 'main' ? 'M80 300H760V80' : 'M80 410H760'} stroke="#b4e2d6" strokeWidth="17" fill="none" strokeLinejoin="round" />
                <path d="M100 300H210 M420 300H520 M760 240V180 M120 410H240 M560 410H680" stroke="#7d9390" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" strokeDasharray="5 5" />
                <text x="90" y="270" className="road-label">MAIN EAST / 1,200 m →</text><text x="90" y="456" className="road-label">PARALLEL EAST / 1,200 m →</text><text x="796" y="270" transform="rotate(-90 796 270)" className="road-label">NORTH BRANCH / 800 m →</text>
                {hazards.map((h, index) => { const p = h.segmentId === 'branch-north' ? { x: 760, y: 300 - h.offsetM / 800 * 220 } : { x: 80 + h.offsetM / 1200 * 680, y: h.segmentId === 'parallel-east' ? 410 : 300 }; return <g key={h.id} role="button" tabIndex={0} aria-label={`Inspect hazard ${index + 1}, ${segmentName(h.segmentId)}, ${STATUS_LABELS[h.status]}`} onClick={() => setSelectedId(h.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(h.id); } }} className={`map-hazard ${selected?.id === h.id ? 'is-selected' : ''}`} transform={`translate(${p.x} ${p.y})`}><circle r="23" fill="transparent" /><circle r="17" fill={h.status === 'repaired' ? '#147d68' : h.status === 'candidate' ? '#a9650c' : '#cf4b38'} stroke="white" strokeWidth="3" /><text textAnchor="middle" y="5" fill="white" fontSize="13" fontWeight="700">{index + 1}</text></g>; })}
                {[vehicle, secondVehicle].map((v, index) => { const p = vehiclePoint(v); return <g key={v.id} transform={`translate(${p.x} ${p.y - 27})`}><rect x="-19" y="-12" width="38" height="24" rx="6" fill={index === 0 ? '#0c7567' : '#304866'} stroke="white" strokeWidth="2" /><text textAnchor="middle" y="4" fill="white" fontSize="11" fontWeight="700">V{index + 1}</text><path d="M0 12V22" stroke={index === 0 ? '#0c7567' : '#304866'} strokeWidth="2" /></g>; })}
                <g transform="translate(850 55)"><path d="M0 20V-10M-5 -2L0 -10L5 -2" stroke="#536c64" fill="none" strokeWidth="2" /><text y="37" textAnchor="middle" className="road-label">N</text></g>
              </svg><span className="map-caption"><GitBranch size={13} aria-hidden="true" />SCHEMATIC · DISTANCES IN METERS</span></div>
              <div className="map-legend"><span><i className="legend-line" />Selected route</span><span><i className="small-dot red" />Verified / response pending</span><span><i className="small-dot amber" />Provisional</span><span><i className="small-dot teal" />Resolved / cleared</span></div>
            </section>
            <section className="panel driver-panel" aria-labelledby="driver-title"><div className="panel-heading"><div><h2 id="driver-title"><Navigation size={17} aria-hidden="true" />Driver simulator</h2><p>Vehicle 01 · {kind === 'car' ? 'passenger car' : 'two-wheeler'}</p></div><span className="subtle-pill">V1</span></div>
               <div className="driver-body"><div className="speed-display"><div><strong>{speed}</strong><span>km/h</span></div><Car size={40} aria-hidden="true" /></div>
                <label className="field">Speed <input type="range" min="0" max="120" step="5" value={speed} onChange={e => setSpeed(Number(e.target.value))} /></label>
                <label className="field">Route<select value={route} onChange={e => { setRoute(e.target.value); setPosition(150); }}><option value="main">Main east → North branch</option><option value="parallel">Parallel east only</option></select></label>
                <label className="field">Position along route <span className="field-value">{position} m / {route === 'main' ? '2,000' : '1,200'} m</span><input type="range" min="0" max={route === 'main' ? 2000 : 1200} step="10" value={position} onChange={e => setPosition(Number(e.target.value))} /></label>
                <p className="current-leg"><MapPin size={13} aria-hidden="true" />{vehicle.route[vehicle.legIndex].segmentId} · {vehicle.offsetM} m · +1</p>
                <label className="check-field"><input type="checkbox" checked={kind === 'two-wheeler'} onChange={e => setKind(e.target.checked ? 'two-wheeler' : 'car')} />Two-wheeler mode</label>
                <label className="field">Vehicle lighting (both vehicles)<select value={lighting} onChange={e => setLighting(e.target.value as Lighting)}><option value="day">Day</option><option value="night">Night</option><option value="unknown">Unknown</option></select></label>
                <div className="warning-rule">Critical-hazard warning zone <strong>{Math.round(warningDistance(speed, 'critical', kind, lighting))} m</strong></div>
                 <AlertList alerts={alerts.items} error={alerts.error} label={t('warnings', { n: '01' })} />
              </div>
            </section>
          </div>
          <section className="panel second-vehicle" aria-label="Second approaching vehicle"><div className="second-intro"><span className="vehicle-icon"><Car size={23} aria-hidden="true" /></span><div><h2>Approaching vehicle 02</h2><p>Independent route-aware evaluation · passenger car</p></div></div><div className="second-controls"><label className="field">Route<select value={secondRoute} onChange={e => { setSecondRoute(e.target.value); setSecondPosition(50); }}><option value="main">Main → North</option><option value="parallel">Parallel east</option></select></label><label className="field">Position (m)<input type="number" min="0" max={secondRoute === 'main' ? 2000 : 1200} value={secondPosition} onChange={e => setSecondPosition(Math.max(0, Math.min(secondRoute === 'main' ? 2000 : 1200, Number(e.target.value))))} /></label><label className="field">Speed (km/h)<input type="number" min="0" max="120" value={secondSpeed} onChange={e => setSecondSpeed(Math.max(0, Math.min(120, Number(e.target.value))))} /></label></div><AlertList alerts={secondAlerts.items} error={secondAlerts.error} label="Vehicle 02 warnings" /></section>

          <div className="operations-grid">
            <section className="panel priority-panel" aria-labelledby="priority-title"><div className="panel-heading"><div><h2 id="priority-title">Hazard priorities <span className="count">{rows.length}</span></h2><p>Evidence-led triage. Select a row to inspect.</p></div><ArrowDownUp size={18} aria-hidden="true" /></div><div className="table-controls"><label className="inline-field"><SlidersHorizontal size={15} aria-hidden="true" />Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">All active</option><option value="all">All records</option><option value="candidate">Provisional</option><option value="verified">Verified</option><option value="repair_pending">Response pending</option><option value="repaired">Resolved / cleared</option></select></label><label className="inline-field">Sort by<select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="priority">Priority score</option><option value="recent">Most recent</option><option value="offset">Road offset</option></select></label></div>
              <div className="table-scroll"><table><thead><tr><th scope="col">Hazard / location</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Priority</th></tr></thead><tbody>{rows.map(h => <tr key={h.id} className={selected?.id === h.id ? 'selected-row' : ''}><td><button className="row-select" aria-pressed={selected?.id === h.id} onClick={() => setSelectedId(h.id)}><span className="hazard-number">{String(hazards.indexOf(h) + 1).padStart(2, '0')}</span><span><strong>{segmentName(h.segmentId)}</strong><small>{h.offsetM} m · direction {h.direction === 1 ? '+1' : '−1'} · {hazardLabel(h)}</small></span></button></td><td><span className={`severity ${h.severity}`}><span className="small-dot" />{h.severity}</span></td><td><span className={`status-badge ${h.status}`}>{priorityScore(h, now) === 0 && h.status !== 'repaired' ? 'Expired' : STATUS_LABELS[h.status]}</span></td><td><span className="priority-score">{Math.round(priorityScore(h, now))}</span></td></tr>)}</tbody></table>{!rows.length && <div className="empty-state"><CheckCheck size={28} aria-hidden="true" /><strong>No hazards match this filter.</strong><span>Choose another status or inject an observation.</span></div>}</div>
              <div className="table-footer"><span>{rows.length} of {hazards.length} records</span><span>Calculated from current evidence</span></div>
            </section>
            <section className="panel evidence-panel" aria-labelledby="evidence-title">
              <div className="panel-heading"><div><h2 id="evidence-title">Evidence inspector</h2><p>Source-level traceability</p></div><ShieldCheck size={18} aria-hidden="true" /></div>
              {selected ? <div className="evidence-body">
                <div className="evidence-location"><span className="eyebrow">HAZARD {String(hazards.indexOf(selected) + 1).padStart(2, '0')}</span><h3>{segmentName(selected.segmentId)}</h3><p>{hazardLabel(selected)} · {selected.offsetM} m · direction {selected.direction === 1 ? '+1' : '−1'}</p><span className={`status-badge ${selected.status}`}>{priorityScore(selected, now) === 0 && selected.status !== 'repaired' ? 'Expired — fresh evidence required' : STATUS_LABELS[selected.status]}</span></div>
                <div className="evidence-summary"><span><strong>{new Set(selected.observations.filter(o => o.observedAt >= selected.firstSeen).map(o => o.sourceId)).size}</strong>episode sources</span><span><strong>{selected.observations.length}</strong>observations</span></div>
                <div className="evidence-timeline">{[...selected.observations].sort((a, b) => b.observedAt - a.observedAt).map(o => <div className="evidence-item" key={o.id}><span className={`evidence-dot ${o.finding}`} /><div><strong>{o.sourceId}<span>{Math.round(o.confidence * 100)}%</span></strong><p>{o.finding === 'clear' ? 'Explicit clearance' : hazardLabel(o)} · {o.lighting ?? 'unknown'} lighting · {o.clearView ? 'clear view' : 'obstructed view'}</p><time dateTime={new Date(o.observedAt).toISOString()}>{time(o.observedAt)} · {o.sourceType}</time></div></div>)}</div>
                {selected.repairRequestedAt !== undefined && <p className="repair-time">Response requested {time(selected.repairRequestedAt)}</p>}
                <div className="evidence-actions"><button className="button secondary" onClick={() => { useLocation(selected); setNotice('Observation form aligned to the selected hazard. Choose a source and submit evidence.'); }}>Use this location<ArrowRight size={15} aria-hidden="true" /></button><button className="button primary" disabled={selected.status !== 'verified' || priorityScore(selected, now) === 0} onClick={repair}><Wrench size={15} aria-hidden="true" />{(selected.hazardType ?? 'pothole') === 'pothole' ? 'Request repair' : 'Request response / clearance'}</button></div>
                <p className="helper">Resolution requires two fresh independent explicit clear observations. Possible animal incidents require human review; no injury, death or accident is inferred. No automatic emergency reporting.</p>
              </div> : <div className="empty-state"><MapPin size={28} aria-hidden="true" /><strong>No hazard selected</strong><span>Submit evidence to create the first record.</span></div>}
            </section>
          </div>
             <section className="panel observation-panel" aria-labelledby="observation-title">
             <div className="panel-heading"><div><h2 id="observation-title"><FlaskConical size={18} aria-hidden="true" />{t('observation')}</h2><p>Submit synthetic evidence through the validation engine.</p></div><span className="subtle-pill">MANUAL SYNTHETIC INPUT</span></div>
            <form onSubmit={submit}><div className="observation-fields">
               <label className="field">Hazard type<select value={hazardType} onChange={e => setHazardType(e.target.value as HazardType)}><option value="pothole">{t('pothole')}</option><option value="animal_on_road">{t('animalRoad')}</option><option value="animal_incident">{t('animalIncident')}</option></select></label>
              <label className="field">Evidence lighting<select value={evidenceLighting} onChange={e => setEvidenceLighting(e.target.value as Lighting)}><option value="unknown">Unknown</option><option value="day">Day</option><option value="night">Night</option></select></label>
              <label className="field">Source identity<select value={source} onChange={e => setSource(e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
              <label className="field">Road segment<select value={segment} onChange={e => { setSegment(e.target.value); setOffset(Math.min(offset, SEGMENTS.find(s => s.id === e.target.value)!.length)); }}>{SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>
              <label className="field">Offset (meters)<input type="number" required min="0" max={SEGMENTS.find(s => s.id === segment)!.length} value={offset} onChange={e => setOffset(Number(e.target.value))} /></label>
              <label className="field">Direction<select value={direction} onChange={e => setDirection(Number(e.target.value) as 1 | -1)}><option value="1">+1 · forward</option><option value="-1">−1 · reverse</option></select></label>
              <label className="field">Finding<select value={finding} onChange={e => setFinding(e.target.value as typeof finding)}><option value="pothole">Hazard present (positive evidence)</option><option value="clear">Explicit clear (negative evidence)</option></select></label>
              <label className="field">Severity<select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>{SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></label>
              <label className="field">Confidence (%)<input type="number" required min="0" max="100" value={confidence} onChange={e => setConfidence(Number(e.target.value))} /></label>
            </div><p className="animal-policy">Animal on road expires after 60 seconds; possible incidents after 5 minutes. Animal corroboration uses a 30-second evidence window. One source remains explicitly unverified. Incident means possible incident requiring review, with no automatic emergency reporting.</p>
             <div className="observation-submit"><div><label className="check-field"><input type="checkbox" checked={clearView} onChange={e => setClearView(e.target.checked)} />Unobstructed view</label><p className="helper">New observation ID and current timestamp on each submission. Source identities stay independent.</p></div><button className="button primary" type="submit"><Radio size={16} aria-hidden="true" />{t('submit')}<ArrowRight size={16} aria-hidden="true" /></button></div></form>
          </section>
        </>}
        <footer className="page-footer"><span><ShieldCheck size={14} aria-hidden="true" />RoadGuard · Hazard intelligence</span><span>Browser-local sharing · NOT deployed V2V{sharedAt ? ` · synced ${time(sharedAt)}` : ''}</span></footer>
      </main>
    </div>
  </div>;
}
