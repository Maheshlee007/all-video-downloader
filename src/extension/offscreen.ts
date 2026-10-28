import { assemble } from '../core/assemble';
import type { Job, Segment } from '../core/types';
import { mediaFetch } from '../core/network';
const queue: Job[] = [];
let cleanup: Promise<void>;
const controls = new Map<
  string,
  { paused: boolean; cancelled: boolean; wake?: () => void; controller: AbortController }
>();
const outputs = new Map<number, { url: string; file: string }>();
let running = false;
async function report(job: Job) {
  job.updatedAt = Date.now();
  const result = await chrome.runtime.sendMessage({ type: 'job-update', job });
  if (!result?.ok) throw new Error(result?.error || 'Could not persist job.');
}
async function fetchSegment(segment: Segment, signal: AbortSignal) {
  const headers: Record<string, string> = {};
  if (segment.range)
    headers.Range = `bytes=${segment.range.offset}-${segment.range.offset + segment.range.length - 1}`;
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await mediaFetch(segment.url, { headers, signal }, 64 * 1024 * 1024);
      if (segment.range && result.data.length !== segment.range.length)
        throw new Error('Byte-range response has an unexpected length.');
      return result.data;
    } catch (e) {
      failure = e;
      if (signal.aborted) throw e;
    }
  }
  throw failure;
}
async function process(job: Job) {
  await cleanup;
  const control = controls.get(job.id)!;
  let directory: FileSystemDirectoryHandle | undefined;
  const name = `${job.id}.part`;
  let writable: FileSystemWritableFileStream | undefined;
  let retain = false;
  try {
    const root = await navigator.storage.getDirectory();
    directory = await root.getDirectoryHandle('clipnest', { create: true });
    const estimate = await navigator.storage.estimate();
    if ((estimate.quota || 0) - (estimate.usage || 0) < 128 * 1024 * 1024)
      throw new Error('Not enough browser storage. Free at least 128 MB and retry.');
    const file = await directory.getFileHandle(name, { create: true });
    writable = await file.createWritable();
    job.status = control.paused ? 'paused' : 'running';
    await report(job);
    await assemble(job.stream!, {
      fetch: (segment) => fetchSegment(segment, control.controller.signal),
      write: async (data) => {
        await writable!.write(data as unknown as BufferSource);
        job.bytes += data.byteLength;
      },
      checkpoint: async () => {
        while (control.paused && !control.cancelled)
          await new Promise<void>((resolve) => {
            control.wake = resolve;
          });
        if (control.cancelled) throw new Error('Cancelled.');
      },
      progress: async (completed) => {
        job.completedSegments = completed;
        job.progress = Math.min(99, (completed / job.totalSegments) * 100);
        job.status = control.cancelled ? 'cancelled' : control.paused ? 'paused' : 'running';
        await report(job);
      },
    });
    if (control.cancelled) throw new Error('Cancelled.');
    if (job.bytes === 0) throw new Error('The stream produced no playable media.');
    await writable.close();
    writable = undefined;
    const output = await file.getFile();
    const url = URL.createObjectURL(output);
    const result = await chrome.runtime.sendMessage({
      type: 'save-output',
      jobId: job.id,
      url,
      filename: job.filename,
    });
    if (!result.ok) {
      URL.revokeObjectURL(url);
      throw new Error(result.error);
    }
    outputs.set(result.value, { url, file: name });
    retain = true;
  } catch (error) {
    job.status = control.cancelled ? 'cancelled' : 'failed';
    job.error = control.cancelled ? undefined : (error as Error).message;
    await report(job);
  } finally {
    if (writable) await writable.abort().catch(() => {});
    if (!retain && directory) await directory.removeEntry(name).catch(() => {});
    controls.delete(job.id);
  }
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (controls.get(job.id)?.cancelled) {
        controls.delete(job.id);
        continue;
      }
      await process(job);
    }
  } finally {
    running = false;
  }
}
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.target !== 'engine') return;
  if (message.type === 'enqueue') {
    if (!controls.has(message.job.id)) {
      controls.set(message.job.id, {
        paused: false,
        cancelled: false,
        controller: new AbortController(),
      });
      queue.push(message.job);
      void drain();
    }
  } else {
    const c = controls.get(message.id);
    if (c) {
      if (message.type === 'pause') c.paused = true;
      if (message.type === 'resume') {
        c.paused = false;
        c.wake?.();
      }
      if (message.type === 'cancel') {
        c.cancelled = true;
        c.controller.abort();
        c.wake?.();
      }
    }
  }
  reply({ ok: true });
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'engine' || message.type !== 'release') return;
  const output = outputs.get(message.downloadId);
  if (!output) return;
  URL.revokeObjectURL(output.url);
  outputs.delete(message.downloadId);
  void navigator.storage
    .getDirectory()
    .then((r) => r.getDirectoryHandle('clipnest'))
    .then((d) => d.removeEntry(output.file))
    .catch(() => {});
});
// Remove orphaned staging files when this document is recreated after a crash.
cleanup = navigator.storage
  .getDirectory()
  .then((r) => r.getDirectoryHandle('clipnest', { create: true }))
  .then(async (directory) => {
    for await (const name of (directory as any).keys())
      await directory.removeEntry(name).catch(() => {});
  })
  .catch(() => {});
