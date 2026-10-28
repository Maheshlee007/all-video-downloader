import { isExtensionPage } from '../core/messages';
import type { Analysis, Candidate, Job, Request, Stream } from '../core/types';
import { all, put, remove } from '../core/storage';
import { candidate, classify, extensionFor, filename, isSegment, safeUrl } from '../core/url';
import { mediaFetch } from '../core/network';
import { parseHls } from '../core/hls';
import { parseDash } from '../core/dash';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
async function notify() {
  await chrome.runtime.sendMessage({ type: 'changed' }).catch(() => {});
}
async function storeCandidate(value: Candidate) {
  if (value.kind === 'page') return;
  const existing = (await all<Candidate>('candidates')).find((c) => c.id === value.id);
  await put('candidates', {
    ...existing,
    ...value,
    title: value.source === 'network' && existing ? existing.title : value.title,
  });
  const candidates = await all<Candidate>('candidates');
  if (candidates.length > 300)
    for (const old of candidates
      .sort((a, b) => a.detectedAt - b.detectedAt)
      .slice(0, candidates.length - 300))
      await remove('candidates', old.id);
}
async function update(job: Job) {
  job.updatedAt = Date.now();
  await put('jobs', job);
  await notify();
}
async function analyze(url: string, title?: string): Promise<Analysis> {
  let c = candidate(url, 'url', title ? { title } : {});
  if (c.kind === 'direct') return { candidate: c, streams: [] };
  await requirePermission(c.url);
  const response = await mediaFetch(c.url);
  const text = new TextDecoder().decode(response.data);
  const kind = classify(response.url, response.mime);
  c = { ...c, kind };
  if (kind === 'hls') return { candidate: c, streams: parseHls(text, response.url) };
  if (kind === 'dash') return { candidate: c, streams: parseDash(text, response.url) };
  // HTML is parsed in the UI with DOMParser; never execute fetched page scripts.
  throw new Error(
    'This is a webpage. Open it in a tab, grant site access, and play the video to detect its media requests.',
  );
}
async function requirePermission(url: string) {
  if (!(await chrome.permissions.contains({ origins: [new URL(url).origin + '/*'] })))
    throw new Error(
      `Site access is required for ${new URL(url).hostname}. Analyze the URL and grant access first.`,
    );
}
let creatingOffscreen: Promise<void> | undefined;
async function offscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen)
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification:
          'Stage media segments on disk, transmux MPEG-TS and create downloadable object URLs.',
      })
      .finally(() => {
        creatingOffscreen = undefined;
      });
  await creatingOffscreen;
}
async function start(job: Job) {
  try {
    if (job.candidate.kind === 'direct') {
      job.downloadId = await chrome.downloads.download({
        url: safeUrl(job.candidate.url),
        filename: job.filename,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      job.status = 'running';
      await update(job);
    } else {
      // Resolve nested HLS playlists at execution time; signed URLs may expire.
      let stream = job.stream;
      if (!stream) throw new Error('Analyze the manifest and select a stream first.');
      if (job.candidate.kind === 'hls' && !stream.segments) {
        const result = await mediaFetch(stream.url);
        const parsed = parseHls(new TextDecoder().decode(result.data), result.url);
        if (parsed.length !== 1 || !parsed[0].segments)
          throw new Error('Nested HLS master playlists are not supported yet.');
        stream = { ...parsed[0], label: stream.label };
      }
      if (stream.blocked) throw new Error(stream.blocked);
      if (!stream.segments?.length) throw new Error('No downloadable segments.');
      for (const origin of new Set(
        [...stream.segments, ...(stream.init ? [stream.init] : [])].map(
          (s) => new URL(s.url).origin,
        ),
      ))
        await requirePermission(origin);
      job.stream = stream;
      job.totalSegments = stream.segments.length;
      job.status = 'queued';
      job.error = undefined;
      await update(job);
      await offscreen();
      await chrome.runtime.sendMessage({ target: 'engine', type: 'enqueue', job });
    }
  } catch (e) {
    job.status = 'failed';
    job.error = String((e as Error).message);
    await update(job);
  }
}
async function handle(message: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  // Content scripts may only report discoveries; privileged commands come from extension pages.
  if (message.type !== 'detected' && !isExtensionPage(sender, chrome.runtime.id))
    throw new Error('This command is restricted to the extension interface.');
  switch (message.type) {
    case 'snapshot': {
      const jobs = await all<Job>('jobs');
      for (const job of jobs.filter(
        (j) => j.downloadId !== undefined && ['running', 'paused'].includes(j.status),
      )) {
        const [download] = await chrome.downloads.search({ id: job.downloadId! });
        if (download) {
          job.bytes = download.bytesReceived;
          job.progress =
            download.totalBytes > 0 ? (download.bytesReceived / download.totalBytes) * 100 : 0;
          job.status =
            download.state === 'complete'
              ? 'complete'
              : download.state === 'interrupted'
                ? 'interrupted'
                : download.paused
                  ? 'paused'
                  : 'running';
          if (job.status === 'complete') job.progress = 100;
          await put('jobs', job);
        }
      }
      return { candidates: await all<Candidate>('candidates'), jobs };
    }
    case 'detected':
      for (const raw of message.candidates.slice(0, 100))
        try {
          const value = candidate(raw.url, 'page', {
            title: String(raw.title || 'Detected media').slice(0, 200),
            tabId: sender.tab?.id,
            pageUrl: sender.tab?.url,
            poster: raw.poster?.startsWith('https:') ? raw.poster : undefined,
            duration: raw.duration,
          });
          await storeCandidate(value);
        } catch {}
      await notify();
      return true;
    case 'scan': {
      await chrome.scripting.executeScript({
        target: { tabId: message.tabId, allFrames: true },
        files: ['content.js'],
      });
      await chrome.tabs.sendMessage(message.tabId, { type: 'scan-page' }).catch(() => {});
      return true;
    }
    case 'analyze': {
      const result = await analyze(message.url, message.title);
      await storeCandidate(result.candidate);
      await notify();
      return result;
    }
    case 'download': {
      const c = candidate(message.candidate.url, message.candidate.source, {
        ...message.candidate,
        url: safeUrl(message.candidate.url),
      });
      const extension =
        c.kind === 'direct'
          ? extensionFor(c.url)
          : message.stream?.container === 'webm'
            ? 'webm'
            : 'mp4';
      const job: Job = {
        id: crypto.randomUUID(),
        candidate: c,
        stream: message.stream,
        filename: filename(c.title, extension),
        status: 'queued',
        progress: 0,
        bytes: 0,
        completedSegments: 0,
        totalSegments: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await update(job);
      await start(job);
      return job;
    }
    case 'job-update':
      await update(message.job);
      return true;
    case 'save-output': {
      const job = (await all<Job>('jobs')).find((j) => j.id === message.jobId);
      if (!job) throw new Error('Unknown job.');
      if (!message.url.startsWith(`blob:${chrome.runtime.getURL('')}`))
        throw new Error('Invalid output URL.');
      job.downloadId = await chrome.downloads.download({
        url: message.url,
        filename: message.filename,
        conflictAction: 'uniquify',
      });
      await update(job);
      return job.downloadId;
    }
    case 'control': {
      const job = (await all<Job>('jobs')).find((j) => j.id === message.id);
      if (!job) throw new Error('Unknown job.');
      if (message.action === 'retry') {
        if (!['failed', 'interrupted', 'cancelled'].includes(job.status))
          throw new Error('Only stopped jobs can be retried.');
        job.downloadId = undefined;
        job.progress = 0;
        job.bytes = 0;
        job.completedSegments = 0;
        await start(job);
        return true;
      }
      if (job.downloadId !== undefined) {
        if (message.action === 'pause') await chrome.downloads.pause(job.downloadId);
        if (message.action === 'resume') await chrome.downloads.resume(job.downloadId);
        if (message.action === 'cancel') await chrome.downloads.cancel(job.downloadId);
      } else {
        await offscreen();
        await chrome.runtime.sendMessage({ target: 'engine', type: message.action, id: job.id });
      }
      job.status =
        message.action === 'pause'
          ? 'paused'
          : message.action === 'resume'
            ? 'running'
            : 'cancelled';
      await update(job);
      return true;
    }
    case 'clear':
      for (const item of await all<any>(message.target === 'history' ? 'jobs' : 'candidates'))
        if (
          message.target === 'candidates' ||
          ['complete', 'failed', 'cancelled', 'interrupted'].includes(item.status)
        )
          await remove(message.target === 'history' ? 'jobs' : 'candidates', item.id);
      await notify();
      return true;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target === 'engine' || message.type === 'changed') return;
  handle(message, sender)
    .then((value) => reply({ ok: true, value }))
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return undefined;
    const mime =
      details.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-type')?.value || '';
    if (isSegment(details.url, mime) || classify(details.url, mime) === 'page') return undefined;
    void chrome.tabs
      .get(details.tabId)
      .then((tab) =>
        storeCandidate(
          candidate(details.url, 'network', {
            kind: classify(details.url, mime),
            tabId: details.tabId,
            title: tab.title || new URL(details.url).hostname,
            pageUrl: tab.url,
            size:
              Number(
                details.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-length')
                  ?.value,
              ) || undefined,
          }),
        ),
      )
      .then(notify)
      .catch(() => {});
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['responseHeaders'],
);
async function registerDetectors() {
  const { origins = [] } = await chrome.permissions.getAll();
  await chrome.scripting.unregisterContentScripts().catch(() => {});
  if (origins.length)
    await chrome.scripting.registerContentScripts([
      {
        id: 'clipnest-detector',
        js: ['content.js'],
        matches: origins,
        allFrames: true,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
}
chrome.permissions.onAdded.addListener(() => void registerDetectors());
chrome.permissions.onRemoved.addListener(() => void registerDetectors());
chrome.runtime.onInstalled.addListener(() => void registerDetectors());
chrome.downloads.onChanged.addListener(
  (delta) =>
    void (async () => {
      if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
        const job = (await all<Job>('jobs')).find((j) => j.downloadId === delta.id);
        if (job) {
          job.status = delta.state.current === 'complete' ? 'complete' : 'interrupted';
          if (job.status === 'complete') job.progress = 100;
          await update(job);
        }
        if (await chrome.offscreen.hasDocument())
          await chrome.runtime
            .sendMessage({ target: 'engine', type: 'release', downloadId: delta.id })
            .catch(() => {});
      }
      await notify();
    })(),
);
// The browser marks native downloads interrupted. Segmented jobs are interrupted only
// after a browser restart, not every time the MV3 service worker wakes up.
chrome.runtime.onStartup.addListener(
  () =>
    void (async () => {
      for (const job of await all<Job>('jobs'))
        if (job.downloadId === undefined && ['running', 'queued', 'paused'].includes(job.status)) {
          job.status = 'interrupted';
          job.error = 'Browser restarted. Retry to restart the segmented download.';
          await update(job);
        }
    })(),
);
