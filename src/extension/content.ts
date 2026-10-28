import { resourceCandidates } from '../core/discovery';
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
    found.push(
      ...resourceCandidates(
        performance.getEntriesByType('resource').map((entry) => entry.name),
        document.title,
        location.href,
      ),
    );
    return found;
  }
  async function report() {
    const found = scan();
    if (found.length)
      await chrome.runtime.sendMessage({ type: 'detected', candidates: found }).catch(() => {});
    return found.length;
  }
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void report(), 500);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  document.addEventListener('loadedmetadata', schedule, true);
  chrome.runtime.onMessage.addListener((m, _sender, reply) => {
    if (m.type !== 'scan-page') return;
    report()
      .then((count) => reply({ count }))
      .catch((error) => reply({ error: String(error) }));
    return true;
  });
  // Also observe newly fetched manifests when the player keeps its video src as blob:.
  const observer = new PerformanceObserver(schedule);
  observer.observe({ type: 'resource', buffered: true });
  void report();
}
