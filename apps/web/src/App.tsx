import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetSnapshot, Field } from '../../../packages/contracts/index.ts';
import { demoTask, type ActionView, type Mode, type Plan, type Receipt, type WebRun, type Workspace } from '../../shared/types.ts';
import { AssetArt, Icon } from './visuals.tsx';

const messages: Record<string, string> = {
  STALE_PLAN: 'Your workspace changed after this preview. No changes were undone. Preview again to review the latest state.',
  REVISION_CONFLICT: 'This asset was edited elsewhere. Close this editor and reopen it to use the latest version.',
  MODEL_CONFIG_REQUIRED: 'Live mode needs UNDOLANE_API_KEY, UNDOLANE_BASE_URL and UNDOLANE_MODEL on the server. The demo works without a key.',
  RUN_IN_PROGRESS: 'A run is already in progress. Wait for it to finish before starting another.',
  NOT_FOUND: 'This item could not be found in the current workspace.',
  CONNECTION_LOST: 'Connection lost. Your saved work is still there. Reconnecting…',
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('CONNECTION_LOST'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.code ?? 'REQUEST_FAILED');
  return result as T;
}
const value = (v: unknown, present = true) => !present ? 'Missing' : v === null ? 'Not assigned' : v === '' ? 'Empty' : String(v);
const short = (id: string) => id.slice(0, 8);
const label = (s: string) => ({ already_undone: 'Already undone', partially_undone: 'Partially undone', unapproved: 'Unapproved' }[s] ?? s.charAt(0).toUpperCase() + s.slice(1));
function Badge({ status }: { status: string }) { return <span className={`badge ${status}`}><span className="badge-dot" />{label(status)}</span>; }

export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/workspace');
  const [workspace, setWorkspace] = useState<Workspace>();
  const [connection, setConnection] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AssetSnapshot>();
  const [guide, setGuide] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState<Mode>('fixture');
  const [task, setTask] = useState(demoTask);
  const [detail, setDetail] = useState<ActionView>();
  const [plan, setPlan] = useState<Plan>();
  const [receipt, setReceipt] = useState<Receipt>();
  const parts = route.split('/').filter(Boolean);
  const page = parts[0] ?? 'workspace';
  const actionId = ['actions', 'undo'].includes(page) ? parts[1] : undefined;
  const run = workspace?.runs.find(r => r.id === parts[1]);
  const running = workspace?.runs.some(r => r.status === 'running');
  const refresh = useCallback(async () => {
    const data = await api<Workspace>('/workspace'); setWorkspace(data); setConnection(true); return data;
  }, []);
  useEffect(() => { const change = () => { setRoute(location.hash.slice(1) || '/workspace'); setError(''); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 2500;
      try { const data = await refresh(); if (data.runs.some(r => r.status === 'running')) delay = 500; }
      catch { if (!stopped) setConnection(false); }
      if (!stopped) timer = setTimeout(poll, delay);
    };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);
  useEffect(() => {
    setDetail(undefined); setPlan(undefined); setReceipt(undefined);
    if (!actionId) return;
    let stopped = false;
    void (async () => {
      try {
        const d = await api<ActionView>(`/actions/${actionId}`);
        if (stopped) return; setDetail(d); setReceipt(d.receipt);
        const p = await api<Plan>('/undo/preview', { action_id: actionId });
        if (!stopped) setPlan(p);
      } catch (e) { if (!stopped) setError((e as Error).message); }
    })();
    return () => { stopped = true; };
  }, [actionId]);
  const perform = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const preview = () => perform(async () => { setPlan(await api<Plan>('/undo/preview', { action_id: actionId })); });
  const commit = () => perform(async () => { if (!plan) return; const result = await api<Receipt>('/undo/commit', { undo_plan_id: plan.undo_plan_id }); setReceipt(result); await refresh(); setPlan(await api<Plan>('/undo/preview', { action_id: actionId })); });
  const start = () => perform(async () => {
    const r = await api<WebRun>('/runs', { task, mode }); await refresh(); location.hash = `/runs/${r.id}`;
  });
  const currentAsset = detail && workspace?.assets.find(a => a.resourceId === detail.effects[0]?.resourceId);
  const protectedItems = plan?.items.filter(i => i.decision === 'protected') ?? [];
  const title = page === 'workspace' ? 'Workspace' : page === 'runs' ? 'Agent runs' : page === 'actions' ? 'Action detail' : 'Undo review';
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#/workspace"><span className="brand-icon"><Icon name="undo" size={23} /></span>UndoLane<span className="beta">DEMO</span></a>
      <div className="workspace-switch"><span className="studio-mark">S</span><div>Studio workspace<small>Autumn collection</small></div><span className="chevron">⌄</span></div>
      <div className="nav-caption">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <a href="#/workspace" className={page === 'workspace' ? 'active' : ''}><Icon name="grid" />Overview<span className="nav-count">{workspace?.assets.length ?? '—'}</span></a>
        <a href="#/runs/new" className={page === 'runs' ? 'active' : ''}><Icon name="spark" />Agent runs{running && <span className="live-dot" />}</a>
        <a href="#/workspace#history" onClick={e => { e.preventDefault(); location.hash = '/workspace'; setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' }), 80); }}><Icon name="clock" />Action history</a>
      </nav>
      <div className="sidebar-note"><span className="small-icon"><Icon name="shield" /></span><h3>Keep your good work.</h3><p>Undo agent changes without losing the edits you made after.</p><button className="text-button" onClick={() => setGuide(true)}>How it works <Icon name="arrow" size={14} /></button></div>
      <div className="sidebar-footer"><span className={connection ? 'connection-dot' : 'connection-dot offline'} /><div>Local workspace<small>{connection ? 'Changes are saved on this device' : 'Reconnecting to your workspace'}</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="muted">Studio</span><span className="slash">/</span>{title}</div><div className="topbar-right"><span className="sample-label"><span />Sample workspace</span><button className="icon-button" aria-label="Open demo guide" onClick={() => setGuide(true)}><Icon name="info" /></button></div></header>
      <main>
        {!connection && <div className="notice error" role="status">{messages.CONNECTION_LOST}</div>}
        {error && <div className="notice error" role="alert"><Icon name="info" /><div>{messages[error] ?? `The operation could not finish (${error}). Your recorded changes remain available.`}</div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" /></button></div>}
        {!workspace ? <div className="loading"><span className="spinner" />Opening your workspace…</div> : <>
          {page === 'workspace' && <>
            <div className="page-heading"><div><p className="eyebrow">A LITTLE ROOM TO UNDO</p><h1>Your asset workspace.</h1><p className="subtitle">Agent mistake removed. Human work preserved.</p></div><a className="button primary" href="#/runs/new"><Icon name="plus" />New agent run</a></div>
            <div className="overview-band"><div><b>{workspace.assets.length.toString().padStart(2, '0')}</b><span>Assets in your workspace</span></div><div><b>{workspace.assets.filter(a => a.fields.status.value === 'approved').length.toString().padStart(2, '0')}</b><span>Approved for the campaign</span></div><div><b>{workspace.actions.length.toString().padStart(2, '0')}</b><span>Recorded agent actions</span></div><div className="band-signature"><Icon name="shield" size={24} /><span>Your edits have<br /><strong>a place in the story.</strong></span></div></div>
            <div className="section-heading"><div className="tabs" aria-label="Filter assets">{['all', 'approved', 'unapproved'].map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All assets' : label(f)}{f === 'all' && <span>{workspace.assets.length}</span>}</button>)}</div><label className="search"><Icon name="search" size={16} /><input aria-label="Search assets" placeholder="Find an asset…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
            <div className="asset-grid">{workspace.assets.filter(a => (filter === 'all' || a.fields.status.value === filter) && `${a.resourceId} ${a.fields.display_name.value} ${a.fields.campaign.value}`.toLowerCase().includes(query.toLowerCase())).map(a => <article className="asset-card" key={a.resourceId}>
              <div className="asset-image"><AssetArt index={workspace.assets.indexOf(a)} /><span className="asset-file">{a.resourceId}</span><button className="edit-float" aria-label={`Edit ${a.resourceId}`} onClick={() => setEditing(a)}><Icon name="edit" size={17} /></button></div>
              <div className="asset-content"><div className="asset-title"><h3>{value(a.fields.display_name.value)}</h3><Badge status={String(a.fields.status.value ?? '')} /></div><div className="asset-meta"><Icon name="folder" size={15} /><span>{value(a.fields.campaign.value)}</span></div>{a.recentMutations.display_name?.kind === 'effect' && a.recentMutations.display_name.action.actorKind === 'human' && <div className="human-note"><Icon name="edit" size={13} />Edited by you</div>}<div className="asset-footer"><span>Campaign revision <b>{a.fields.campaign.revision}</b></span><button className="text-button" onClick={() => setEditing(a)}>Edit details <Icon name="arrow" size={13} /></button></div></div>
            </article>)}</div>
            {!workspace.assets.some(a => (filter === 'all' || a.fields.status.value === filter) && `${a.resourceId} ${a.fields.display_name.value} ${a.fields.campaign.value}`.toLowerCase().includes(query.toLowerCase())) && <div className="empty">No assets match. Try another search or filter.</div>}
            <section id="history" className="history-section"><div className="section-heading"><div><h2>Recent agent actions <span className="number-pill">{workspace.actions.length}</span></h2><p className="muted">Every change has a record. Every undo has a reason.</p></div><a className="text-button" href="#/runs/new">Start a run <Icon name="arrow" size={15} /></a></div>
              {!workspace.actions.length ? <div className="empty-history"><span className="empty-icon"><Icon name="clock" size={26} /></span><div><h3>A clean slate. A clear history.</h3><p>Run the Autumn Launch demo to see your agent’s changes here.</p></div><a className="button secondary" href="#/runs/new">Try the demo <Icon name="arrow" size={16} /></a></div> : <div className="action-list">{workspace.actions.map(a => <a href={`#/actions/${a.action.id}`} key={a.action.id} className="action-row"><span className="action-symbol"><Icon name="spark" /></span><div><strong>Update {a.effects[0]?.resourceId}</strong><small>{a.effects.length} fields changed <span>·</span> {a.mode === 'fixture' ? 'Demo recipe' : 'Live model'} <span>·</span> {short(a.action.id)}</small></div><Badge status={a.receipt?.status ?? 'recorded'} /><Icon name="arrow" /></a>)}</div>}
            </section>
            <div className="bottom-caption"><span>Undo the agent’s mistake. Keep your later edits.</span><span>UNDOLANE / PRODUCT DEMO</span></div>
          </>}
          {page === 'runs' && <>
            <div className="page-heading"><div><p className="eyebrow">FROM INTENT TO ACTION</p><h1>{run ? 'Watch the work happen.' : 'A little help with the busywork.'}</h1><p className="subtitle">Every tool call becomes a visible step. Every edit stays traceable.</p></div>{run && <a href="#/runs/new" className="button secondary"><Icon name="plus" />New run</a>}</div>
            {!run && parts[1] !== 'new' && parts[1] && <div className="empty">Run not found. <a href="#/runs/new">Start a new run</a></div>}
            {!run && (!parts[1] || parts[1] === 'new') && <div className="run-layout"><section className="panel run-form"><div className="panel-heading"><span className="action-symbol"><Icon name="spark" /></span><div><h2>What should your agent do?</h2><p className="muted">Give it a task. Review what actually changes.</p></div></div><div className="mode-picker"><button className={mode === 'fixture' ? 'selected' : ''} onClick={() => { setMode('fixture'); setTask(demoTask); }}>Demo recipe<span>No API key needed</span></button><button disabled={!workspace.liveAvailable} className={mode === 'live' ? 'selected' : ''} onClick={() => setMode('live')}>Live model<span>{workspace.liveAvailable ? 'Your configured provider' : 'Provider not configured'}</span></button></div><label className="field-label" htmlFor="task">YOUR TASK</label><textarea id="task" value={task} readOnly={mode === 'fixture'} onChange={e => setTask(e.target.value)} rows={4} /><div className="recipe-note"><Icon name="info" size={17} /><p>{mode === 'fixture' ? 'Fixed demo recipe: adds approved assets to Autumn Launch and prefixes their names with “Autumn”. Real MCP calls and saved changes; no model inference.' : 'Uses your configured model. Only the three resource tools are available; changes use the same protected engine.'}</p></div><button className="button primary full" disabled={busy || !!running || !task.trim()} onClick={() => void start()}><Icon name="play" />{running ? 'A run is in progress' : busy ? 'Starting…' : 'Run task'}</button></section><aside className="run-aside"><p className="eyebrow">THE DEMO IN THREE MOMENTS</p><h2>Let it change.<br />Make it yours.<br /><em>Keep what matters.</em></h2><ol className="guide-steps"><li><b>01</b><div>Run the campaign task<p>The agent updates approved assets.</p></div></li><li><b>02</b><div>Make a human edit<p>Change asset_b’s title to Hero — Final.</p></div></li><li><b>03</b><div>Review & undo<p>Restore the campaign. Keep your title.</p></div></li></ol><div className="small-footnote"><Icon name="shield" />You choose when to undo.</div></aside></div>}
            {run && <div className="run-layout"><section className="panel"><div className="run-summary"><div className="eyebrow">{run.mode === 'fixture' ? 'DEMO RECIPE · NO MODEL INFERENCE' : 'LIVE MODEL'}</div><h2>{run.task}</h2><div className="run-subline"><Badge status={run.status} /><span>{run.events.length} tool results</span><span>{run.actionIds.length} recorded actions</span></div></div><WorkflowSummary run={run} workspace={workspace} /><div className="timeline" aria-live="polite">{run.events.map((e, i) => <div className="timeline-item" key={`${i}-${e.name}`}><span className={e.ok ? 'step-dot done' : 'step-dot failed'}><Icon name={e.ok ? 'check' : 'info'} size={14} /></span><div><div className="step-title"><span className="step-label">{i + 1}. {e.name === 'assets_list' ? 'List assets' : e.name === 'asset_get' ? 'Read asset details' : 'Patch fields'} <code>{e.name}</code></span><small>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></div><p>{e.ok ? e.name === 'assets_list' ? 'Read the current asset collection.' : e.name === 'asset_get' ? 'Read field values, revisions and ownership.' : 'Saved an Agent Action and its field changes.' : `Tool rejected: ${e.errorCode}`}</p>{e.actionId && <a className="text-button" href={`#/actions/${e.actionId}`}>Inspect action {short(e.actionId)} <Icon name="arrow" size={13} /></a>}</div></div>)}{run.status === 'running' && <div className="timeline-item"><span className="step-dot"><span className="spinner" /></span><div><strong>Working on your task…</strong><p>Waiting for the next actual tool result.</p></div></div>}</div>{run.status !== 'running' && <div className={`run-finished ${run.status === 'completed' ? '' : 'failed'}`}><Icon name={run.status === 'completed' ? 'check' : 'info'} /><div><strong>{run.status === 'completed' ? 'Run finished. Your changes are ready to inspect.' : `Run ${run.status}. Recorded actions remain available.`}</strong>{run.errorCode && <p>{run.errorCode}</p>}<p>Only recorded actions below count as completed writes.</p></div></div>}</section><aside><div className="panel side-panel"><p className="eyebrow">RECORDED CHANGES</p><h2>{run.actionIds.length} agent actions</h2><div className="mini-actions">{run.actionIds.map(id => { const a = workspace.actions.find(a => a.action.id === id); return <a key={id} href={`#/actions/${id}`}><span><strong>{a?.effects[0]?.resourceId ?? short(id)}</strong><small>{a?.effects.length ?? '—'} fields changed</small></span><Icon name="arrow" /></a>; })}</div>{!run.actionIds.length && <p className="muted">Saved actions will appear here.</p>}<a href="#/workspace" className="button secondary full">View workspace <Icon name="arrow" size={16} /></a></div><p className="aside-note">Next: edit an asset yourself, then review what the agent can still undo.</p></aside></div>}
          </>}
          {['actions', 'undo'].includes(page) && <>
            <a className="back-link" href={page === 'undo' ? `#/actions/${actionId}` : '#/workspace'}>← {page === 'undo' ? 'Back to action' : 'Back to workspace'}</a>
            <div className="page-heading"><div><p className="eyebrow">{page === 'undo' ? 'YOUR WORK, PROTECTED' : 'A RECORD OF WHAT CHANGED'}</p><h1>{page === 'undo' ? 'Undo with a clear view.' : 'One action. Every detail.'}</h1><p className="subtitle">{page === 'undo' ? 'Restore what’s eligible. Leave newer edits right where they belong.' : 'See what the agent wrote, and which fields it still owns.'}</p></div>{page === 'actions' && actionId && <a className="button primary" href={`#/undo/${actionId}`}><Icon name="undo" />Review undo</a>}</div>
            {!detail || !plan ? <div className="loading"><span className="spinner" />Reading action and field ownership…</div> : <>
              {receipt && <div className="commit-success" role="status"><span className="success-icon"><Icon name="check" size={26} /></span><div><p className="eyebrow">UNDO COMPLETED</p><h2>{receipt.preserved.length ? 'Protected changes preserved.' : 'Your eligible changes are restored.'}</h2><p>{receipt.restored.length} restored · {receipt.preserved.length} preserved · workspace revision {receipt.workspace_revision}</p></div><Badge status={receipt.status} /></div>}
              <section className="change-summary" aria-label="Change summary"><div><p className="eyebrow">CHANGE SUMMARY · THIS ACTION</p><h2>Agent changed {detail.effects.length} fields.</h2><p>{detail.effects[0]?.resourceId} · Review one recorded Action at a time.</p></div><div className="summary-decision safe"><b>{plan.eligible}</b><span>safe to undo</span></div><div className="summary-decision keep"><b>{plan.protected}</b><span>{protectedItems.length > 0 && protectedItems.every(i => i.reason.includes('human')) ? 'protected human edit' + (plan.protected === 1 ? '' : 's') : 'protected newer edits'}</span></div></section><div className="review-layout"><div><div className="review-summary"><div><span className="action-symbol"><Icon name="spark" /></span><div><strong>Agent Action <code>{short(detail.action.id)}</code></strong><small>{detail.effects[0]?.resourceId} · {detail.effects.length} changes detected</small></div></div><div className="counts"><span><b>{plan.eligible}</b>Eligible</span><span className="protected-count"><b>{plan.protected}</b>Protected</span>{plan.already_undone > 0 && <span><b>{plan.already_undone}</b>Undone</span>}</div></div><div className="change-table-wrap"><table className="change-table"><thead><tr><th>Changed field</th><th>Before agent</th><th>After agent</th><th>Current status</th></tr></thead><tbody>{detail.effects.map(e => { const item = plan.items.find(i => i.effect_id === e.id)!; return <tr key={e.id} className={item.decision === 'protected' ? 'protected-row' : ''}><td><strong>{e.field}</strong><small>{e.resourceId}</small></td><td><span className={e.beforeValue === null ? 'null-value' : ''}>{value(e.beforeValue, e.beforePresent)}</span></td><td>{value(e.afterValue, e.afterPresent)}</td><td><Badge status={item.decision} /><small>{item.decision === 'protected' ? (item.reason.includes('human') ? 'Newer human edit kept' : 'Newer edit kept') : item.decision === 'eligible' ? 'Can be restored' : item.reason}</small></td></tr>; })}</tbody></table></div>
                <details className="technical"><summary>Inspect field history <span>revision & ownership</span></summary>{plan.items.map(i => <div key={i.effect_id}><strong>{i.field}</strong><p>revision: {i.revision} · active_effect_id: {i.active_effect_id ?? 'null'}</p><p>previous_effect_id: {i.previous_effect_id ?? 'null'}</p><p>{i.reason}</p></div>)}</details>
                {page === 'undo' && !receipt && <div className="commit-bar"><div><Icon name="shield" /><p>Only the {plan.eligible} eligible {plan.eligible === 1 ? 'field will' : 'fields will'} be restored.<small>{plan.protected ? 'Your newer edits stay untouched.' : 'Original action history stays available.'}</small></p></div><button className="button primary" disabled={busy || !plan.eligible} onClick={() => void commit()}><Icon name="undo" />{busy ? 'Working…' : 'Commit Undo'}</button></div>}
              </div><aside className="review-aside"><div className={protectedItems.length ? 'protection-card' : 'protection-card neutral'}><span className="protection-icon"><Icon name="shield" size={26} /></span><p className="eyebrow">{protectedItems.length ? 'A NEWER EDIT. A DIFFERENT OWNER.' : 'EVERY FIELD HAS AN OWNER.'}</p><h2>{protectedItems.length ? (protectedItems.some(i => i.reason.includes('human')) ? 'This one stays yours.' : 'A newer edit stays.') : 'Your next edit matters.'}</h2>{protectedItems.length ? protectedItems.map(i => <div key={i.effect_id}><div className="protected-value"><small>CURRENT {i.field.replaceAll('_', ' ').toUpperCase()}</small><strong>{value(i.current_value)}</strong></div><p className="protection-explanation">{i.reason.includes('human') ? 'Human changed this field after the agent action.' : 'A newer action changed this field after the agent action.'}</p><p className="protection-reason">{i.reason}</p></div>) : <p>Make a newer edit to this asset. UndoLane will preserve it when you undo the agent’s action.</p>}{currentAsset && <button className="button secondary full" onClick={() => setEditing(currentAsset)}><Icon name="edit" size={16} />Make a human edit</button>}</div><div className="preview-note"><div><Icon name="clock" size={16} /><span>Preview at revision {plan.base_workspace_revision}</span></div>{workspace.revision !== plan.base_workspace_revision && !receipt && <p className="stale-hint">The workspace has changed. Preview again before committing.</p>}<button className="text-button" disabled={busy} onClick={() => void preview()}>Preview Undo <Icon name="arrow" size={14} /></button></div></aside></div>
            </>}
          </>}
        </>}
      </main>
    </div>
    {editing && <EditDialog asset={editing} close={() => setEditing(undefined)} saved={async () => { setEditing(undefined); await refresh(); }} />}
    {guide && <GuideDialog close={() => setGuide(false)} />}
  </div>;
}

function WorkflowSummary({ run, workspace }: { run: WebRun; workspace: Workspace }) {
  const actions = workspace.actions.filter(a => run.actionIds.includes(a.action.id));
  const effects = actions.reduce((total, a) => total + a.effects.length, 0);
  const stages = [
    { title: 'List assets', done: run.events.some(e => e.name === 'assets_list' && e.ok), detail: 'MCP collection read' },
    { title: 'Read asset details', done: run.events.some(e => e.name === 'asset_get' && e.ok), detail: 'Values + revisions' },
    { title: 'Patch fields', done: run.events.some(e => e.name === 'asset_patch' && e.ok), detail: `${actions.length} recorded Actions` },
    { title: 'Create effects', done: effects > 0, detail: `${effects} persisted Effects` },
  ];
  return <section className="workflow-summary" aria-label="Agent workflow">
    <ol>{stages.map((stage, i) => <li key={stage.title} className={stage.done ? 'observed' : ''}><small>STEP {i + 1} · {stage.done ? 'RECORDED' : 'NOT OBSERVED'}</small><strong>{stage.title}</strong><span>{stage.detail}</span></li>)}</ol>
    <p>From recorded tool results and saved history. Effects are created inside each patch transaction, not a separate model call.</p>
  </section>;
}

function EditDialog({ asset, close, saved }: { asset: AssetSnapshot; close: () => void; saved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ display_name: String(asset.fields.display_name.value ?? ''), campaign: String(asset.fields.campaign.value ?? ''), status: String(asset.fields.status.value ?? ''), note: String(asset.fields.note.value ?? '') });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const operationKey = useRef(crypto.randomUUID());
  useEffect(() => { dialog.current?.showModal(); }, []);
  const submit = async () => {
    setSaving(true); setError('');
    try {
      const writes = (Object.keys(form) as Field[]).filter(f => form[f] !== String(asset.fields[f].value ?? '')).map(f => ({ field: f, value: (f === 'campaign' || f === 'status') && !form[f] ? null : form[f], expected_revision: asset.fields[f].revision }));
      if (writes.length) await api('/human-edits', { resource_id: asset.resourceId, operation_key: operationKey.current, writes });
      await saved();
    } catch (e) { setError(messages[(e as Error).message] ?? (e as Error).message); } finally { setSaving(false); }
  };
  return <dialog ref={dialog} onCancel={close} className="edit-dialog"><form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="dialog-heading"><div><p className="eyebrow">YOUR EDIT, YOUR OWNERSHIP</p><h2>Edit asset</h2></div><button type="button" className="icon-button" aria-label="Close editor" onClick={close}><Icon name="close" /></button></div><p className="muted">{asset.resourceId} · Saved as a Human Action.</p><label>Display name<input autoFocus value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></label><div className="form-row"><label>Campaign<input value={form.campaign} placeholder="Not assigned" onChange={e => setForm({ ...form, campaign: e.target.value })} /></label><label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="">Not assigned</option><option value="approved">Approved</option><option value="unapproved">Unapproved</option><option value="draft">Draft</option></select></label></div><label>Note<textarea rows={3} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>{error && <p className="notice error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save human edit'}</button></div></form></dialog>;
}
function GuideDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="edit-dialog" onCancel={close}><div className="dialog-heading"><h2>One edit worth keeping.</h2><button className="icon-button" aria-label="Close guide" onClick={close}><Icon name="close" /></button></div><ol className="guide-steps"><li><b>01</b><div>Run the demo recipe<p>Open Agent runs and run the Autumn Launch task. The demo makes real changes without a model key.</p></div></li><li><b>02</b><div>Make it yours<p>In the workspace, edit asset_b’s display name to “Hero — Final”.</p></div></li><li><b>03</b><div>Review and undo<p>Open the action for asset_b. Preview Undo shows campaign as Eligible and display_name as Protected. Commit Undo keeps your title.</p></div></li></ol><button className="button primary full" onClick={close}>Got it <Icon name="arrow" /></button></dialog>;
}
