import type { Candidate, MediaKind } from './types';
export function safeUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use a public HTTP or HTTPS URL without embedded credentials.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.') ||
    host.includes(':') ||
    /^\[/.test(host)
  )
    throw new Error('Local and private network addresses are not supported.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
      throw new Error('Local and private network addresses are not supported.');
  }
  url.hash = '';
  return url.href;
}
export function classify(url: string, mime = ''): MediaKind {
  const path = new URL(url).pathname.toLowerCase();
  if (/\.m3u8$/.test(path) || /mpegurl/i.test(mime)) return 'hls';
  if (/\.mpd$/.test(path) || /dash\+xml/i.test(mime)) return 'dash';
  if (
    /\.(mp4|m4v|webm|mov|mkv|mp3|m4a|ogg|oga|wav|aac|flac)$/.test(path) ||
    /^(video|audio)\//i.test(mime)
  )
    return 'direct';
  return 'page';
}
export function isSegment(url: string, mime = '') {
  return /\.(ts|m4s|cmfv|cmfa)(?:$|\?)/i.test(url) || /mp2t/i.test(mime);
}
export function candidate(
  url: string,
  source: Candidate['source'],
  extra: Partial<Candidate> = {},
): Candidate {
  const clean = safeUrl(url);
  return {
    id: clean,
    url: clean,
    title: decodeURIComponent(new URL(clean).pathname.split('/').pop() || new URL(clean).hostname),
    kind: classify(clean),
    source,
    detectedAt: Date.now(),
    ...extra,
  };
}
export function filename(title: string, extension: string): string {
  const stem =
    title
      .replace(/\.[a-z\d]{2,5}$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 150) || 'ClipNest video';
  return `${stem}.${extension}`;
}
export function extensionFor(url: string) {
  const ext = new URL(url).pathname.match(/\.([a-z\d]{2,5})$/i)?.[1];
  return ext || 'mp4';
}
