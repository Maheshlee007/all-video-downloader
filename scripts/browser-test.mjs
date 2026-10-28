import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const temp = await mkdtemp(join(tmpdir(), 'clipnest-test-'));
const fixtures = join(temp, 'fixtures');
await mkdir(fixtures);
function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
}
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=320x180:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-preset',
  'ultrafast',
  '-g',
  '48',
  '-c:a',
  'aac',
  '-f',
  'hls',
  '-hls_time',
  '2',
  '-hls_list_size',
  '0',
  join(fixtures, 'media.m3u8'),
]);
ffmpeg(['-i', join(fixtures, 'media.m3u8'), '-c', 'copy', join(fixtures, 'direct.mp4')]);
await writeFile(join(fixtures, 'key'), new Uint8Array(16).fill(73));
await writeFile(join(fixtures, 'keyinfo'), `key\n${join(fixtures, 'key')}\n`);
ffmpeg([
  '-i',
  join(fixtures, 'direct.mp4'),
  '-c',
  'copy',
  '-f',
  'hls',
  '-hls_time',
  '2',
  '-hls_list_size',
  '0',
  '-hls_key_info_file',
  join(fixtures, 'keyinfo'),
  join(fixtures, 'aes.m3u8'),
]);
ffmpeg([
  '-i',
  join(fixtures, 'direct.mp4'),
  '-map',
  '0:v',
  '-c',
  'copy',
  '-f',
  'dash',
  '-seg_duration',
  '2',
  join(fixtures, 'video.mpd'),
]);
ffmpeg([
  '-i',
  join(fixtures, 'direct.mp4'),
  '-map',
  '0:a',
  '-c',
  'copy',
  '-f',
  'dash',
  '-seg_duration',
  '2',
  '-init_seg_name',
  'audio-init.mp4',
  '-media_seg_name',
  'audio-$Number%05d$.m4s',
  join(fixtures, 'audio.mpd'),
]);
await writeFile(
  join(fixtures, 'master.m3u8'),
  '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=320x180\nmedia.m3u8\n',
);
await writeFile(
  join(fixtures, 'encrypted.m3u8'),
  '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\nmedia0.ts\n#EXT-X-ENDLIST\n',
);
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/page') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>ClipNest controlled video</title><video controls src="/direct.mp4"></video>',
      );
      return;
    }
    if (req.url === '/extensionless-page') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>Extensionless player</title><video controls><source src="/stream" type="video/mp4"></video>',
      );
      return;
    }
    if (req.url === '/buffered') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>Buffered player</title><script>fetch("/master.m3u8").then(r=>r.text()).then(()=>{window.ready=true})</script>',
      );
      return;
    }
    if (req.url === '/embedded') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<!doctype html><title>Embedded player</title><iframe src="${playerOrigin}/page"></iframe>`,
      );
      return;
    }
    let name = new URL(req.url, 'http://test').pathname.slice(1);
    if (name === 'stream') name = 'direct.mp4';
    if (!/^[\w.-]+$/.test(name)) {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(join(fixtures, name));
    const mime =
      {
        '.mp4': 'video/mp4',
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.mpd': 'application/dash+xml',
        '.ts': 'video/mp2t',
        '.m4s': 'video/iso.segment',
      }[extname(name)] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Delay segments slightly so that pause/resume and queue controls can be exercised.
    if (/\.(ts|m4s)$/.test(name)) await new Promise((resolve) => setTimeout(resolve, 200));
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://media.clipnest.test:${server.address().port}`;
const playerOrigin = `http://player.clipnest.test:${server.address().port}`;
const extension = join(temp, 'extension');
await cp('dist', extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
// Test-only permission grant. The shipped manifest continues to ask per origin.
manifest.host_permissions = [`${origin}/*`, `${playerOrigin}/*`];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
let context;
const errors = [];
try {
  context = await chromium.launchPersistentContext(join(temp, 'profile'), {
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    acceptDownloads: true,
    downloadsPath: join(temp, 'downloads'),
    args: [
      '--no-sandbox',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--host-resolver-rules=MAP media.clipnest.test 127.0.0.1, MAP player.clipnest.test 127.0.0.1',
      '--no-proxy-server',
    ],
  });
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole('heading', { name: 'Good things are worth saving.' }).waitFor();
  async function rpc(message) {
    const r = await page.evaluate((m) => chrome.runtime.sendMessage(m), message);
    assert.equal(r?.ok, true, r?.error);
    return r.value;
  }
  async function waitFor(fn, label) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const result = await fn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Timeout: ${label}`);
  }
  const site = await context.newPage();
  await site.goto(`${origin}/page`);
  const tabId = await page.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.includes('/page'))?.id;
  });
  assert.ok(tabId);
  const [{ result: rejected }] = await page.evaluate(
    (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => chrome.runtime.sendMessage({ type: 'snapshot' }),
      }),
    tabId,
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /restricted to the extension interface/);
  console.log('PASS: webpage scripts cannot issue privileged extension commands');
  await rpc({ type: 'scan', tabId });
  await waitFor(
    async () =>
      (await rpc({ type: 'snapshot' })).candidates.some((c) => c.url === `${origin}/direct.mp4`),
    'HTML media detection',
  );
  console.log('PASS: content detection in a real Chrome extension');
  await site.goto(`${origin}/extensionless-page`);
  await rpc({ type: 'clear', target: 'candidates' });
  await rpc({ type: 'scan', tabId });
  await waitFor(
    async () =>
      (await rpc({ type: 'snapshot' })).candidates.some(
        (c) => c.url === `${origin}/stream` && c.kind === 'direct' && c.source === 'page',
      ),
    'extensionless typed source',
  );
  console.log('PASS: extensionless media source retains its MIME classification');
  const extensionless = await rpc({ type: 'analyze', url: `${origin}/stream` });
  assert.equal(extensionless.candidate.kind, 'direct');
  await site.goto(`${origin}/buffered`);
  await site.waitForFunction(() => window.ready === true);
  await rpc({ type: 'clear', target: 'candidates' });
  await rpc({ type: 'scan', tabId });
  await waitFor(
    async () =>
      (await rpc({ type: 'snapshot' })).candidates.some(
        (c) => c.url === `${origin}/master.m3u8` && c.source === 'page',
      ),
    'buffered manifest recovery',
  );
  console.log('PASS: manifests loaded before scanning are recovered from performance entries');
  await site.goto(`${origin}/embedded`);
  await rpc({ type: 'scan', tabId });
  await waitFor(
    async () =>
      (await rpc({ type: 'snapshot' })).candidates.some(
        (c) => c.url === `${playerOrigin}/direct.mp4` && c.tabId === tabId,
      ),
    'permitted cross-origin iframe',
  );
  console.log('PASS: media in permitted cross-origin player frames is detected');

  const direct = await rpc({
    type: 'analyze',
    url: `${origin}/direct.mp4`,
    title: 'Direct fixture',
  });
  let job = await rpc({ type: 'download', candidate: direct.candidate });
  async function completed(id) {
    return waitFor(async () => {
      const j = (await rpc({ type: 'snapshot' })).jobs.find((j) => j.id === id);
      if (['failed', 'interrupted'].includes(j?.status))
        throw new Error(j.error || `${j.status}: ${j.filename}`);
      return j?.status === 'complete' ? j : false;
    }, 'download completion');
  }
  async function probe(job, expected) {
    const [download] = await page.evaluate((id) => chrome.downloads.search({ id }), job.downloadId);
    const info = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', download.filename],
        { encoding: 'utf8' },
      ),
    );
    for (const type of expected)
      assert.ok(
        info.streams.some((s) => s.codec_type === type),
        `Missing ${type} track`,
      );
    assert.ok(Number(info.format.duration) > 5, 'Expected six-second playable media');
    const decoded = execFileSync(
      'ffmpeg',
      ['-xerror', '-v', 'error', '-i', download.filename, '-f', 'null', '-'],
      { stdio: 'pipe' },
    );
    assert.equal(decoded.length, 0);
  }
  await probe(await completed(job.id), ['video', 'audio']);
  console.log('PASS: direct download, codecs, duration and full decode');
  for (const [manifest, title, tracks] of [
    ['master.m3u8', 'HLS fixture', ['video', 'audio']],
    ['aes.m3u8', 'AES-128 HLS fixture', ['video', 'audio']],
    ['video.mpd', 'DASH fixture', ['video']],
    ['audio.mpd', 'Audio fixture', ['audio']],
  ]) {
    const analysis = await rpc({ type: 'analyze', url: `${origin}/${manifest}`, title });
    const stream = analysis.streams.find((s) => !s.blocked);
    assert.ok(stream);
    job = await rpc({ type: 'download', candidate: analysis.candidate, stream });
    if (manifest === 'master.m3u8') {
      await rpc({ type: 'control', id: job.id, action: 'pause' });
      await new Promise((r) => setTimeout(r, 350));
      const paused = (await rpc({ type: 'snapshot' })).jobs.find((j) => j.id === job.id);
      assert.equal(paused.status, 'paused');
      await rpc({ type: 'control', id: job.id, action: 'resume' });
    }
    await probe(await completed(job.id), tracks);
    console.log(`PASS: ${title}, segment assembly and full decode`);
  }
  const blocked = await rpc({ type: 'analyze', url: `${origin}/encrypted.m3u8` });
  assert.match(blocked.streams[0].blocked, /Protected/);
  console.log('PASS: protected SAMPLE-AES HLS blocked');
  // Run a real user interaction through the URL form, then check narrow side-panel layout.
  await page.bringToFront();
  await page.getByLabel('Video or webpage URL').fill(`${origin}/direct.mp4`);
  await page.getByRole('button', { name: 'Analyze URL' }).click();
  await page.getByRole('heading', { name: 'direct.mp4', exact: true }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/side-panel.png', fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Side panel must not overflow',
  );
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: URL form, responsive UI, keyboard dismissal and no page errors');
  console.log(`Browser checks passed. Temporary fixtures and downloads: ${temp}`);
} finally {
  await context?.close();
  server.close();
}
