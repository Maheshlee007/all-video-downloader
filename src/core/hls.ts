import type { Segment, Stream } from './types';
import { safeUrl } from './url';
export function attributes(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of line.matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g)) result[m[1]] = m[2] ?? m[3];
  return result;
}
export function parseHls(text: string, url: string): Stream[] {
  if (!text.trimStart().startsWith('#EXTM3U'))
    throw new Error('The response is not an HLS playlist.');
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const variants: Stream[] = [];
  let pending: Record<string, string> | undefined;
  const separateAudio = new Set(
    lines
      .filter((l) => l.startsWith('#EXT-X-MEDIA:'))
      .map((l) => attributes(l))
      .filter((a) => a.TYPE === 'AUDIO' && a.URI)
      .map((a) => a['GROUP-ID']),
  );
  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) pending = attributes(line);
    else if (pending && !line.startsWith('#')) {
      const [width, height] = (pending.RESOLUTION || '').split('x').map(Number);
      variants.push({
        id: String(variants.length),
        label: height
          ? `${height}p`
          : pending.BANDWIDTH
            ? `${Math.round(Number(pending.BANDWIDTH) / 1000)} kbps`
            : 'Original',
        url: safeUrl(line, url),
        width,
        height,
        bandwidth: Number(pending.BANDWIDTH) || undefined,
        codecs: pending.CODECS,
        blocked:
          pending.AUDIO && separateAudio.has(pending.AUDIO)
            ? 'Separate audio/video merging is planned for a later release.'
            : undefined,
      });
      pending = undefined;
    }
  }
  if (variants.length) return variants.sort((a, b) => (b.height || 0) - (a.height || 0));
  let init: Segment | undefined,
    range: Segment['range'],
    previousEnd = 0,
    previousUrl = '',
    blocked: string | undefined;
  const segments: Segment[] = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY:') && attributes(line).METHOD !== 'NONE')
      blocked = 'Encrypted HLS is not supported. No DRM or encryption bypass is provided.';
    if (line === '#EXT-X-DISCONTINUITY')
      blocked =
        'This playlist changes media timelines; discontinuity-aware merging is not available yet.';
    if (line.startsWith('#EXT-X-MAP:')) {
      const a = attributes(line);
      init = { url: safeUrl(a.URI, url) };
      if (a.BYTERANGE) {
        const [length, offset] = a.BYTERANGE.split('@').map(Number);
        if (!Number.isFinite(offset))
          throw new Error('Initialization byte range requires an explicit offset.');
        init.range = { length, offset };
      }
    }
    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const [length, offset] = line.slice(17).split('@').map(Number);
      range = { length, offset };
    }
    if (!line.startsWith('#')) {
      const segmentUrl = safeUrl(line, url);
      if (range && !Number.isFinite(range.offset)) {
        if (previousUrl !== segmentUrl)
          throw new Error('Implicit byte range has no previous segment in the same resource.');
        range.offset = previousEnd;
      }
      if (
        range &&
        (!Number.isSafeInteger(range.length) ||
          range.length <= 0 ||
          !Number.isSafeInteger(range.offset) ||
          range.offset < 0)
      )
        throw new Error('Invalid playlist byte range.');
      segments.push({ url: segmentUrl, ...(range ? { range: { ...range } } : {}) });
      previousUrl = segmentUrl;
      previousEnd = range ? range.offset + range.length : 0;
      range = undefined;
    }
  }
  if (segments.length > 20000) throw new Error('This playlist exceeds the 20,000-segment limit.');
  const live = !lines.includes('#EXT-X-ENDLIST');
  if (live)
    blocked =
      'Live recording is planned. This release downloads completed on-demand playlists only.';
  if (!segments.length) throw new Error('No complete segments were found in this playlist.');
  return [
    {
      id: 'original',
      label: 'Original quality',
      url,
      segments,
      init,
      live,
      blocked,
      container: init ? 'mp4' : 'ts',
    },
  ];
}
