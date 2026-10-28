import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  ExternalLink,
  Film,
  FolderDown,
  Globe2,
  Layers3,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Analysis, Candidate, Job, Stream } from '../core/types';
import { safeUrl } from '../core/url';
import { activeTab, grant, isExtension, request } from './api';
import { useStore } from './store';
const Preview = React.lazy(() => import('./Preview').then((m) => ({ default: m.Preview })));
import './style.css';
type View = 'detected' | 'downloads' | 'history';
const bytes = (n: number) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(1)} GB`
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : n >= 1024
        ? `${Math.round(n / 1024)} KB`
        : `${n} B`;
const host = (url?: string) => {
  try {
    return new URL(url!).hostname.replace(/^www\./, '');
  } catch {
    return 'Current tab';
  }
};
function App() {
  const { candidates, jobs, refresh } = useStore();
  const [view, setView] = useState<View>('detected'),
    [url, setUrl] = useState(''),
    [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'),
    [scope, setScope] = useState<'tab' | 'all'>('tab');
  const [tab, setTab] = useState<chrome.tabs.Tab>(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis>(),
    [selected, setSelected] = useState(''),
    [preview, setPreview] = useState<Candidate>();
  const [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false),
    [batch, setBatch] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    void activeTab().then(setTab);
    const interval = setInterval(() => void refresh().catch(() => {}), 1500);
    const onActivated = () => {
      void activeTab().then(setTab);
    };
    if (isExtension) chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      clearInterval(interval);
      if (isExtension) chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, [refresh]);
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function analyze(value: string, title?: string) {
    const clean = safeUrl(value);
    await grant(clean);
    const result = await request<Analysis>({ type: 'analyze', url: clean, title });
    if (result.candidate.kind === 'direct') {
      setView('detected');
      setScope('all');
    } else {
      setAnalysis(result);
      setSelected(result.streams.find((s) => !s.blocked)?.id || result.streams[0]?.id || '');
    }
  }
  async function download(c: Candidate, stream?: Stream) {
    // Streaming subresources can be hosted on a different CDN. Grant only the selected origins.
    if (stream && c.kind === 'hls' && !stream.segments) {
      await grant(stream.url);
      const resolved = await request<Analysis>({
        type: 'analyze',
        url: stream.url,
        title: c.title,
      });
      if (resolved.streams.length !== 1 || !resolved.streams[0].segments)
        throw new Error('Nested master playlists are not supported yet.');
      stream = { ...resolved.streams[0], label: stream.label };
      if (stream.blocked) throw new Error(stream.blocked);
      setAnalysis({ candidate: c, streams: [stream] });
      setSelected(stream.id);
      return; // A second click grants resolved CDN origins with a fresh user gesture.
    }
    if (stream) {
      const origins = new Set(
        [
          stream.url,
          ...(stream.segments || []).map((s) => s.url),
          ...(stream.init ? [stream.init.url] : []),
        ].map((u) => new URL(u).origin + '/*'),
      );
      if (isExtension && !(await chrome.permissions.request({ origins: [...origins] })))
        throw new Error('Stream access was declined.');
    }
    await request({ type: 'download', candidate: c, stream });
    setView('downloads');
    setAnalysis(undefined);
  }
  const visible = useMemo(
    () =>
      candidates
        .filter(
          (c) =>
            (scope === 'all' || !isExtension || c.tabId === tab?.id) &&
            (filter === 'all' ||
              (filter === 'stream'
                ? c.kind === 'hls' || c.kind === 'dash'
                : filter === 'audio'
                  ? /\.(mp3|m4a|ogg|wav|aac|flac)(?:\?|$)/i.test(c.url)
                  : c.kind === 'direct')) &&
            `${c.title} ${c.url}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => b.detectedAt - a.detectedAt),
    [candidates, scope, tab?.id, filter, query],
  );
  const currentJobs = jobs.filter((j) => ['queued', 'running', 'paused'].includes(j.status));
  const history = jobs.filter((j) => !['queued', 'running', 'paused'].includes(j.status));
  const sections = [
    { id: 'detected' as View, label: 'Detected media', icon: Compass, count: candidates.length },
    {
      id: 'downloads' as View,
      label: 'Downloads',
      icon: ArrowDownToLine,
      count: currentJobs.length,
    },
    { id: 'history' as View, label: 'History', icon: Clock3, count: history.length },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('detected');
          }}
        >
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          <span>
            clipnest<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {sections.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${view === s.id ? 'active' : ''}`}
              onClick={() => setView(s.id)}
            >
              <s.icon size={19} />
              <span>{s.label}</span>
              <span className="count">{s.count}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={20} />
            <strong>Yours. And only yours.</strong>
            <p>
              No accounts. No uploads.
              <br />
              Your media stays on your device.
            </p>
            <span>
              <i /> LOCAL-FIRST BY DESIGN
            </span>
          </div>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>Help & shortcuts</span>
            <ArrowUpRight size={15} />
          </button>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            <span>Preferences</span>
          </button>
          <div className="version">
            ClipNest Universal <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{sections.find((s) => s.id === view)?.label}</strong>
          </div>
          <div className="connection">
            <span className={isExtension ? 'dot' : 'dot muted'} />
            {isExtension ? 'Extension connected' : 'Browser preview'}
            <span className="divider" />
            <button className="icon-button" aria-label="Help" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> YOUR NEXT FIND STARTS HERE
              </div>
              <h1>
                {view === 'detected'
                  ? 'Good things are worth saving.'
                  : view === 'downloads'
                    ? 'Coming home.'
                    : 'Your collection, remembered.'}
              </h1>
              <p>
                {view === 'detected'
                  ? 'Discover a video. Pick your quality. Make it yours.'
                  : view === 'downloads'
                    ? 'Keep an eye on your downloads, all in one place.'
                    : 'Revisit your saved media and pick up interrupted downloads.'}
              </p>
            </div>
            <span className="heading-mark">
              <FolderDown size={33} />
            </span>
          </div>
          {!isExtension && (
            <div className="preview-banner">
              <Globe2 size={16} />
              <span>
                This is the interface preview. Load <strong>dist/</strong> as an unpacked extension
                to detect and download media.
              </span>
              <button onClick={() => setHelp(true)}>
                How to install <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <form
            className="url-box"
            onSubmit={(e) => {
              e.preventDefault();
              void run('analyze', () => analyze(url));
            }}
          >
            <div className="url-icon">
              <Link2 size={20} />
            </div>
            <input
              aria-label="Video or webpage URL"
              type="url"
              required
              placeholder="Paste a video or stream URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <span className="url-hint">MP4, HLS, DASH & more</span>
            <button className="primary" disabled={!!busy || !url}>
              {busy === 'analyze' ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Plus size={17} />
              )}{' '}
              Analyze URL
            </button>
          </form>
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="section-bar">
            <div className="section-title">
              <h2>{sections.find((s) => s.id === view)?.label}</h2>
              <span className="pill">
                {view === 'detected'
                  ? visible.length
                  : view === 'downloads'
                    ? currentJobs.length
                    : history.length}
              </span>
            </div>
            <div className="actions">
              {view === 'detected' ? (
                <>
                  <button
                    className="text-button"
                    onClick={() => {
                      setBatch(!batch);
                      setChecked(new Set());
                    }}
                  >
                    <CheckCheck size={16} /> Select
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void run('scan', async () => {
                        const current = await activeTab();
                        setTab(current);
                        if (!current?.url || !current.id)
                          throw new Error('Open a regular webpage to scan it.');
                        await grant(safeUrl(current.url));
                        await request({ type: 'scan', tabId: current.id });
                      })
                    }
                  >
                    <RefreshCw size={15} className={busy === 'scan' ? 'spin' : ''} /> Scan page
                  </button>
                </>
              ) : view === 'history' ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void run('clear', () => request({ type: 'clear', target: 'history' }))
                  }
                >
                  <Trash2 size={15} /> Clear history
                </button>
              ) : (
                <span className="subtle">
                  {currentJobs.length ? 'Downloads stay on this device' : 'Ready when you are'}
                </span>
              )}
            </div>
          </div>
          {view === 'detected' && (
            <>
              <div className="filters">
                <div className="filter-tabs">
                  {[
                    { id: 'all', label: 'All media' },
                    { id: 'direct', label: 'Video' },
                    { id: 'audio', label: 'Audio' },
                    { id: 'stream', label: 'Streams' },
                  ].map((f) => (
                    <button
                      className={filter === f.id ? 'selected' : ''}
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search media"
                    placeholder="Search media"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="tab-context">
                <Globe2 size={15} />
                <span>{scope === 'tab' ? host(tab?.url) : 'All permitted sites'}</span>
                <span className="context-separator">·</span>
                <span className="subtle">
                  {scope === 'tab' ? 'Current tab' : 'Collected media'}
                </span>
                <button onClick={() => setScope(scope === 'tab' ? 'all' : 'tab')}>
                  {scope === 'tab' ? 'Show all sites' : 'Current tab'}
                  <ChevronDown size={13} />
                </button>
              </div>
              {batch && (
                <div className="batch-bar">
                  <span>{checked.size} selected · direct files only</span>
                  <button
                    className="primary"
                    disabled={!checked.size}
                    onClick={() =>
                      void run('batch', async () => {
                        for (const c of visible.filter(
                          (c) => checked.has(c.id) && c.kind === 'direct',
                        ))
                          await download(c);
                        setChecked(new Set());
                        setBatch(false);
                      })
                    }
                  >
                    <ArrowDownToLine size={15} /> Download selected
                  </button>
                </div>
              )}
              <div className="media-grid">
                {visible.map((c) => (
                  <article className="media-card" key={c.id}>
                    <div
                      className={`media-art ${c.kind}`}
                      style={
                        c.poster
                          ? {
                              backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.4),transparent),url(${JSON.stringify(c.poster)})`,
                            }
                          : undefined
                      }
                    >
                      <span className="format-tag">
                        {c.kind === 'direct' ? 'VIDEO' : c.kind.toUpperCase()}
                      </span>
                      {batch && c.kind === 'direct' && (
                        <input
                          className="media-check"
                          type="checkbox"
                          aria-label={`Select ${c.title}`}
                          checked={checked.has(c.id)}
                          onChange={() =>
                            setChecked((old) => {
                              const next = new Set(old);
                              next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <button
                        className="play-button"
                        aria-label={`Preview ${c.title}`}
                        onClick={() => setPreview(c)}
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                      {c.duration && (
                        <span className="duration">
                          {Math.floor(c.duration / 60)}:
                          {String(Math.floor(c.duration % 60)).padStart(2, '0')}
                        </span>
                      )}
                      {!c.poster && (
                        <div className="art-lines">
                          <Film size={60} />
                        </div>
                      )}
                    </div>
                    <div className="media-body">
                      <div className="media-origin">
                        <span className="tiny-dot" />
                        {host(c.pageUrl || c.url)}
                        <span>{c.source === 'network' ? 'Network' : 'Detected'}</span>
                      </div>
                      <h3 title={c.title}>{c.title}</h3>
                      <div className="media-meta">
                        <span>{c.kind === 'direct' ? 'Original file' : 'Adaptive stream'}</span>
                        <span>·</span>
                        <span>
                          {c.size
                            ? bytes(c.size)
                            : c.kind === 'direct'
                              ? 'Ready to save'
                              : 'Choose quality'}
                        </span>
                      </div>
                      <div className="media-footer">
                        <span className="quality-tag">
                          {c.kind === 'direct' ? 'ORIGINAL' : 'MULTI-QUALITY'}
                        </span>
                        <button
                          className="download-button"
                          disabled={!!busy}
                          onClick={() =>
                            void run(c.id, () =>
                              c.kind === 'direct' ? download(c) : analyze(c.url, c.title),
                            )
                          }
                        >
                          {busy === c.id ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <ArrowDownToLine size={15} />
                          )}{' '}
                          {c.kind === 'direct' ? 'Download' : 'Choose quality'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!visible.length && (
                <div className="empty-state">
                  <div className="empty-orbit">
                    <Compass size={32} />
                    <span className="orbit-dot" />
                    <span className="small-orbit">
                      <Play size={12} fill="currentColor" />
                    </span>
                  </div>
                  <h3>{query ? 'No matching media' : 'Your next discovery belongs here.'}</h3>
                  <p>
                    {query
                      ? 'Try another search or filter.'
                      : 'Open a page, grant site access, and play a video. We’ll collect the media we can find right here.'}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setUrl('');
                      document.querySelector<HTMLInputElement>('.url-box input')?.focus();
                    }}
                  >
                    <Link2 size={15} /> Or paste a media URL
                  </button>
                  <div className="empty-formats">
                    <span>MP4</span>
                    <span>WEBM</span>
                    <span>HLS</span>
                    <span>DASH</span>
                    <span>AUDIO</span>
                  </div>
                </div>
              )}
            </>
          )}
          {view !== 'detected' && (
            <div className="jobs">
              {(view === 'downloads' ? currentJobs : history)
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    control={(action) =>
                      void run(job.id, () => request({ type: 'control', id: job.id, action }))
                    }
                  />
                ))}
              {!(view === 'downloads' ? currentJobs : history).length && (
                <div className="empty-state">
                  <div className="empty-orbit">
                    {view === 'downloads' ? <ArrowDownToLine size={32} /> : <Clock3 size={32} />}
                  </div>
                  <h3>
                    {view === 'downloads'
                      ? 'A little space for your next save.'
                      : 'A fresh start for your collection.'}
                  </h3>
                  <p>
                    {view === 'downloads'
                      ? 'Choose a detected file or analyze a stream to start downloading.'
                      : 'Completed and interrupted downloads will appear here.'}
                  </p>
                  <button className="secondary" onClick={() => setView('detected')}>
                    Explore detected media <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="bottom-note">
            <ShieldCheck size={15} />
            <span>Private by default. Saved directly to your device.</span>
            <span className="note-right">Save what you have the right to keep.</span>
          </div>
          <div className="info-strip">
            <div className="info-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <strong>One place. More possibilities.</strong>
              <p>Direct files, adaptive streams, and audio — brought together.</p>
            </div>
            <button onClick={() => setHelp(true)}>
              Explore supported formats <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </main>
      {analysis && (
        <Modal title="Choose your stream" onClose={() => setAnalysis(undefined)}>
          <p className="modal-subtitle">{analysis.candidate.title}</p>
          <div className="stream-list">
            {analysis.streams.map((s) => (
              <label className={`stream-row ${selected === s.id ? 'chosen' : ''}`} key={s.id}>
                <input
                  type="radio"
                  name="stream"
                  checked={selected === s.id}
                  onChange={() => setSelected(s.id)}
                />
                <div>
                  <strong>{s.label}</strong>
                  <small>
                    {s.blocked ||
                      [
                        s.codecs,
                        s.bandwidth ? `${Math.round(s.bandwidth / 1000)} kbps` : '',
                        s.segments ? `${s.segments.length} segments` : 'HLS rendition',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  </small>
                </div>
                {!s.blocked && <Check size={17} />}
              </label>
            ))}
          </div>
          <button
            className="primary wide"
            disabled={!!busy || !analysis.streams.some((s) => s.id === selected && !s.blocked)}
            onClick={() =>
              void run('download', () =>
                download(
                  analysis.candidate,
                  analysis.streams.find((s) => s.id === selected),
                ),
              )
            }
          >
            <ArrowDownToLine size={16} />
            {analysis.streams.find((s) => s.id === selected)?.segments
              ? 'Download selected stream'
              : 'Inspect selected quality'}
          </button>
          <p className="fine-print">
            Segmented jobs run one at a time. Pause takes effect after the current segment. Keep
            Chrome open until the file is saved.
          </p>
        </Modal>
      )}
      {preview && (
        <Modal title="Media preview" onClose={() => setPreview(undefined)}>
          <React.Suspense fallback={<p className="notice">Loading player…</p>}>
            <Preview media={preview} />
          </React.Suspense>
          <p className="modal-subtitle">{preview.title}</p>
          <p className="fine-print">
            Playback depends on codecs, CORS, and site access. Preview does not bypass access
            restrictions.
          </p>
        </Modal>
      )}
      {help && (
        <Modal title="A good place to start." onClose={() => setHelp(false)}>
          <div className="help-steps">
            <div>
              <span>01</span>
              <p>
                <strong>Install the extension</strong>Run npm install and npm run build. In
                chrome://extensions enable Developer mode, choose Load unpacked, and select dist/.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Find your media</strong>Open a webpage and click Scan page. Grant access
                only to sites you trust. Play the video so network detection can see its manifest.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Make it yours</strong>Preview a file, choose an available stream, and
                download. Use Downloads to pause, resume, or cancel.
              </p>
            </div>
          </div>
          <div className="notice">
            v0.1 supports direct files, unencrypted on-demand HLS with multiplexed audio, and
            bounded single-track DASH. Separate audio/video merging, live recording, conversion, DRM
            and site-specific extractors are not included.
          </div>
          <p className="fine-print">
            No service can download every video. Use ClipNest only for media you are authorized to
            save.
          </p>
        </Modal>
      )}
      {settings && (
        <Modal title="Your space, your control." onClose={() => setSettings(false)}>
          <div className="setting-row">
            <div>
              <strong>Site permissions</strong>
              <p>Manage granted sites in Chrome’s extension settings.</p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                if (isExtension)
                  void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
                else setError('Install the extension to manage site permissions.');
              }}
            >
              <ExternalLink size={15} /> Open
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Clear detected media</strong>
              <p>Remove saved URLs and metadata from this device.</p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                void run('clear', () => request({ type: 'clear', target: 'candidates' }))
              }
            >
              <Trash2 size={15} /> Clear
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Clear history</strong>
              <p>Remove finished job records. Downloaded files remain.</p>
            </div>
            <button
              className="secondary"
              onClick={() => void run('clear', () => request({ type: 'clear', target: 'history' }))}
            >
              <Trash2 size={15} /> Clear
            </button>
          </div>
          <p className="notice">
            No analytics, cloud account, or remote processing. Signed media URLs may contain access
            tokens: they are stored locally until you clear detected media and history. Requests do
            not add cookies or authorization headers.
          </p>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function JobCard({
  job,
  control,
}: {
  job: Job;
  control: (action: 'pause' | 'resume' | 'cancel' | 'retry') => void;
}) {
  return (
    <article className="job-card">
      <div className={`job-icon ${job.status === 'complete' ? 'finished' : ''}`}>
        {job.status === 'complete' ? <Check size={22} /> : <Film size={22} />}
      </div>
      <div className="job-main">
        <div className="job-heading">
          <h3>{job.filename}</h3>
          <span className={`status ${job.status}`}>{job.status}</span>
        </div>
        <p>
          {bytes(job.bytes)}{' '}
          {job.totalSegments > 0
            ? `· ${job.completedSegments} / ${job.totalSegments} segments`
            : ''}
        </p>
        <div className="progress">
          <div style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
        </div>
        {job.error && <p className="job-error">{job.error}</p>}
      </div>
      <div className="job-actions">
        {job.status === 'running' && (
          <button
            className="icon-button"
            aria-label="Pause download"
            onClick={() => control('pause')}
          >
            <Pause size={17} />
          </button>
        )}
        {job.status === 'paused' && (
          <button
            className="icon-button"
            aria-label="Resume download"
            onClick={() => control('resume')}
          >
            <Play size={17} />
          </button>
        )}
        {['failed', 'interrupted', 'cancelled'].includes(job.status) && (
          <button className="secondary" onClick={() => control('retry')}>
            <RefreshCw size={14} /> Retry
          </button>
        )}
        {['queued', 'running', 'paused'].includes(job.status) && (
          <button
            className="icon-button"
            aria-label="Cancel download"
            onClick={() => control('cancel')}
          >
            <X size={17} />
          </button>
        )}
        {job.status === 'complete' && job.downloadId !== undefined && (
          <button
            className="icon-button"
            aria-label="Show in folder"
            onClick={() => {
              if (isExtension) chrome.downloads.show(job.downloadId!);
            }}
          >
            <FolderDown size={18} />
          </button>
        )}
      </div>
    </article>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
