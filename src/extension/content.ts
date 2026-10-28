import { candidate, classify } from '../core/url';
import type { Candidate } from '../core/types';
// Registered only on origins the user has explicitly granted.
if (!(globalThis as any).__clipnestInstalled) {
  (globalThis as any).__clipnestInstalled = true;
  let timer: ReturnType<typeof setTimeout>;
  function scan() {
    const found: Candidate[] = [];
    for (const video of document.querySelectorAll<HTMLMediaElement>('video,audio')) {
      const sources = [
        video.currentSrc,
        video.src,
        ...Array.from(video.querySelectorAll('source')).map((s) => s.src),
      ];
      for (const url of sources.filter(Boolean))
        try {
          found.push(
            candidate(url, 'page', {
              title: document.title,
              kind: classify(url, video.querySelector('source')?.type),
              pageUrl: location.href,
              poster: video instanceof HTMLVideoElement ? video.poster : undefined,
              duration: Number.isFinite(video.duration) ? video.duration : undefined,
            }),
          );
        } catch {
          /* blob/MSE is detected through its network manifest. */
        }
    }
    for (const node of document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"]',
    ))
      try {
        found.push(
          candidate(new URL(node.content, location.href).href, 'page', {
            title: document.title,
            pageUrl: location.href,
          }),
        );
      } catch {}
    if (found.length)
      void chrome.runtime.sendMessage({ type: 'detected', candidates: found }).catch(() => {});
  }
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 500);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  document.addEventListener('loadedmetadata', schedule, true);
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'scan-page') scan();
  });
  scan();
}
