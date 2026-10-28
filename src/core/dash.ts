import { XMLParser } from 'fast-xml-parser';
import type { Segment, Stream } from './types';
import { safeUrl } from './url';
// Bound expansion: hostile manifests must not allocate unbounded segment lists.
const LIMIT = 20000;
const array = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
function duration(value: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value || '');
  return m
    ? Number(m[1] || 0) * 86400 +
        Number(m[2] || 0) * 3600 +
        Number(m[3] || 0) * 60 +
        Number(m[4] || 0)
    : 0;
}
function template(
  pattern: string,
  id: string,
  bandwidth: string,
  number: number,
  time: number,
): string {
  return pattern
    .replace(/\$\$/g, '\u0000')
    .replace(/\$(RepresentationID|Bandwidth|Number|Time)(?:%0(\d+)d)?\$/g, (_, key, pad) =>
      String(
        (
          { RepresentationID: id, Bandwidth: bandwidth, Number: number, Time: time } as Record<
            string,
            string | number
          >
        )[key],
      ).padStart(Number(pad) || 0, '0'),
    )
    .replace(/\u0000/g, '$');
}
function range(value?: string) {
  if (!value) return undefined;
  const m = /^(\d+)-(\d+)$/.exec(value);
  if (!m || Number(m[2]) < Number(m[1])) throw new Error('Invalid DASH byte range.');
  return { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
}
export function parseDash(text: string, url: string): Stream[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('XML entity declarations are not accepted.');
  const mpd = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
  }).parse(text).MPD;
  if (!mpd) throw new Error('The response is not a DASH manifest.');
  const periods = array(mpd.Period),
    streams: Stream[] = [];
  if (periods.length !== 1) throw new Error('Multi-period DASH is not supported yet.');
  const period = periods[0],
    seconds = duration(period.duration || mpd.mediaPresentationDuration);
  const base = (parent: string, node: any) =>
    node.BaseURL
      ? safeUrl(typeof node.BaseURL === 'object' ? node.BaseURL['#text'] : node.BaseURL, parent)
      : parent;
  const rootBase = base(base(url, mpd), period);
  const sets = array(period.AdaptationSet);
  const hasAudio = sets.some(
    (a) => a.contentType === 'audio' || String(a.mimeType).startsWith('audio/'),
  );
  for (const set of sets)
    for (const rep of array(set.Representation)) {
      const mime =
        rep.mimeType || set.mimeType || (set.contentType === 'audio' ? 'audio/mp4' : 'video/mp4');
      const repBase = base(base(rootBase, set), rep),
        id = String(rep.id || streams.length),
        bandwidth = String(rep.bandwidth || 0);
      let blocked =
        mpd.type === 'dynamic' ? 'Live DASH recording is not available yet.' : undefined;
      if (
        mpd.ContentProtection ||
        period.ContentProtection ||
        set.ContentProtection ||
        rep.ContentProtection
      )
        blocked = 'Protected DASH is not supported. No DRM bypass is provided.';
      if (hasAudio && mime.startsWith('video/'))
        blocked =
          blocked ||
          'Separate audio/video merging is planned. You can save the audio track separately.';
      let segments: Segment[] = [],
        init: Segment | undefined;
      const t = {
        ...(period.SegmentTemplate || {}),
        ...(set.SegmentTemplate || {}),
        ...(rep.SegmentTemplate || {}),
      };
      const list = rep.SegmentList || set.SegmentList;
      if (t.media) {
        const scale = Number(t.timescale || 1),
          start = Number(t.startNumber || 1);
        if (!Number.isFinite(scale) || scale <= 0 || !Number.isSafeInteger(start))
          throw new Error('Invalid DASH time scale or segment number.');
        if (t.initialization)
          init = { url: safeUrl(template(t.initialization, id, bandwidth, start, 0), repBase) };
        const points = array(t.SegmentTimeline?.S);
        let time = 0,
          index = 0;
        if (points.length)
          for (const point of points) {
            const d = Number(point.d),
              repeat = Number(point.r || 0);
            time = point.t !== undefined ? Number(point.t) : time;
            if (
              !Number.isSafeInteger(d) ||
              d <= 0 ||
              !Number.isSafeInteger(repeat) ||
              repeat < 0 ||
              index + repeat + 1 > LIMIT
            )
              throw new Error('Unbounded or invalid DASH timeline is not supported.');
            for (let j = 0; j <= repeat; j++) {
              segments.push({
                url: safeUrl(template(t.media, id, bandwidth, start + index++, time), repBase),
              });
              time += d;
            }
          }
        else {
          const d = Number(t.duration),
            count = Math.ceil((seconds * scale) / d);
          if (!Number.isFinite(count) || count <= 0 || count > LIMIT)
            throw new Error('A bounded DASH segment duration is required.');
          for (let i = 0; i < count; i++)
            segments.push({
              url: safeUrl(template(t.media, id, bandwidth, start + i, i * d), repBase),
            });
        }
      } else if (list) {
        if (list.Initialization)
          init = {
            url: safeUrl(list.Initialization.sourceURL || repBase, repBase),
            range: range(list.Initialization.range),
          };
        segments = array(list.SegmentURL).map((s) => ({
          url: safeUrl(s.media, repBase),
          range: range(s.mediaRange),
        }));
      } else if (rep.BaseURL && !rep.SegmentBase && !set.SegmentBase) segments = [{ url: repBase }];
      else blocked = blocked || 'This DASH indexing scheme is not supported yet.';
      if (segments.length > LIMIT)
        throw new Error('This manifest exceeds the 20,000-segment limit.');
      streams.push({
        id,
        label: mime.startsWith('audio/')
          ? `Audio · ${Math.round(Number(bandwidth) / 1000)} kbps`
          : rep.height
            ? `${rep.height}p`
            : 'Original',
        url,
        width: Number(rep.width) || undefined,
        height: Number(rep.height) || undefined,
        bandwidth: Number(bandwidth),
        mime,
        codecs: rep.codecs || set.codecs,
        segments,
        init,
        blocked,
        container: mime.includes('webm') ? 'webm' : 'mp4',
      });
    }
  if (!streams.length) throw new Error('No DASH representations were found.');
  return streams.sort((a, b) => (b.height || 0) - (a.height || 0));
}
