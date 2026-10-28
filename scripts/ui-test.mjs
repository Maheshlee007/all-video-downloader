import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import assert from 'node:assert/strict';
const server = createServer(async (req, res) => {
  const path = resolve(
    'dist',
    req.url === '/' ? 'index.html' : new URL(req.url, 'http://localhost').pathname.slice(1),
  );
  if (!path.startsWith(resolve('dist') + '/')) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader(
      'Content-Type',
      { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[
        extname(path)
      ] || 'application/octet-stream',
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: 'Good things are worth saving.' }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Downloads/ }).click();
  await page.getByRole('heading', { name: 'Coming home.' }).waitFor();
  await page.getByRole('button', { name: /History/ }).click();
  await page.getByRole('heading', { name: 'Your collection, remembered.' }).waitFor();
  await page.getByRole('button', { name: /Detected media/ }).click();
  await page.getByLabel('Video or webpage URL').fill('https://example.com/video.mp4');
  await page.getByRole('button', { name: 'Analyze URL' }).click();
  await page.getByRole('alert').filter({ hasText: 'Load the built extension' }).waitFor();
  await page.getByLabel('Dismiss error').click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Close dialog').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/side-panel.png', fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'No horizontal overflow at side-panel width',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: UI navigation, truthful preview errors, accessible dialogs, desktop and side-panel layout; no page errors.',
  );
} finally {
  await browser?.close();
  server.close();
}
