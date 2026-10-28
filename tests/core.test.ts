import { describe, it, expect } from 'vitest';
import { parseHls, attributes } from '../src/core/hls';
import { parseDash } from '../src/core/dash';
import { safeUrl, classify, isSegment, filename } from '../src/core/url';
import { mediaFetch } from '../src/core/network';
const base = 'https://media.example.com/assets/master.m3u8';
describe('URL safety and classification', () => {
  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pass@example.com/a',
    'http://127.1/a',
    'http://0x7f000001/a',
    'http://10.0.0.1/a',
    'http://172.16.1.1/a',
    'http://192.168.0.1/a',
    'http://169.254.169.254/a',
    'http://localhost./a',
    'http://[::1]/a',
    'http://service.local/a',
  ])('rejects unsafe URL %s', (url) => expect(() => safeUrl(url)).toThrow());
  it('keeps signed URL query strings and resolves relative paths', () =>
    expect(safeUrl('../movie.mp4?token=abc#t=2', base)).toBe(
      'https://media.example.com/movie.mp4?token=abc',
    ));
  it('classifies MIME types without suffixes', () => {
    expect(classify('https://example.com/watch', 'application/vnd.apple.mpegurl')).toBe('hls');
    expect(classify('https://example.com/watch', 'application/dash+xml')).toBe('dash');
    expect(classify('https://example.com/watch', 'video/mp4')).toBe('direct');
  });
  it('does not present transport segments as individual videos', () =>
    expect(isSegment('https://example.com/001.ts?sig=hello')).toBe(true));
  it('sanitizes reserved characters and dot paths', () =>
    expect(filename('../../hi:there.mp4', 'mp4')).toBe('_.._hi_there.mp4'));
});
describe('HLS parsing', () => {
  it('parses quoted comma-separated codecs', () =>
    expect(
      attributes(
        '#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.4d,mp4a.40.2",RESOLUTION=1280x720',
      ).CODECS,
    ).toBe('avc1.4d,mp4a.40.2'));
  it('groups a master playlist into qualities', () => {
    const streams = parseHls(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200,RESOLUTION=1920x1080\nhigh.m3u8',
      base,
    );
    expect(streams.map((s) => s.label)).toEqual(['1080p', '360p']);
    expect(streams[0].url).toBe('https://media.example.com/assets/high.m3u8');
  });
  it('preserves byte ranges and initialization segments', () => {
    const [s] = parseHls(
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="30@0"\n#EXT-X-BYTERANGE:50@30\nmedia.mp4\n#EXT-X-BYTERANGE:40\nmedia.mp4\n#EXT-X-ENDLIST',
      base,
    );
    expect(s.init?.range).toEqual({ offset: 0, length: 30 });
    expect(s.segments?.[1].range).toEqual({ offset: 80, length: 40 });
    expect(s.blocked).toBeUndefined();
  });
  it('rejects implicit ranges across different resources', () =>
    expect(() =>
      parseHls(
        '#EXTM3U\n#EXT-X-BYTERANGE:20@0\na.mp4\n#EXT-X-BYTERANGE:20\nb.mp4\n#EXT-X-ENDLIST',
        base,
      ),
    ).toThrow('Implicit'));
  it.each([
    ['#EXT-X-KEY:METHOD=AES-128,URI="key"', 'Encrypted'],
    ['#EXT-X-DISCONTINUITY', 'timelines'],
  ])('flags unsupported %s', (tag, message) =>
    expect(parseHls(`#EXTM3U\n${tag}\nsegment.ts\n#EXT-X-ENDLIST`, base)[0].blocked).toContain(
      message,
    ),
  );
  it('marks live playlists and external audio explicitly', () => {
    expect(parseHls('#EXTM3U\nsegment.ts', base)[0].blocked).toContain('Live');
    expect(
      parseHls(
        '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100,AUDIO="a"\nvideo.m3u8',
        base,
      )[0].blocked,
    ).toContain('Separate');
  });
  it('refuses private segment targets', () =>
    expect(() => parseHls('#EXTM3U\nhttp://127.0.0.1/movie.ts\n#EXT-X-ENDLIST', base)).toThrow(
      'private',
    ));
  it('rejects an empty or unrelated document', () => {
    expect(() => parseHls('<html/>', base)).toThrow('not an HLS');
    expect(() => parseHls('#EXTM3U', base)).toThrow('No complete');
  });
});
describe('DASH parsing', () => {
  const wrap = (content: string) =>
    `<MPD mediaPresentationDuration="PT6S"><Period>${content}</Period></MPD>`;
  it('expands bounded number templates and initialization', () => {
    const [s] = parseDash(
      wrap(
        '<AdaptationSet mimeType="video/mp4"><SegmentTemplate timescale="1" duration="2" startNumber="7" initialization="init-$RepresentationID$.mp4" media="$Number%03d$.m4s"/><Representation id="v" height="720" bandwidth="800000"/></AdaptationSet>',
      ),
      base,
    );
    expect(s.label).toBe('720p');
    expect(s.init?.url).toContain('init-v.mp4');
    expect(s.segments?.map((s) => s.url.split('/').pop())).toEqual([
      '007.m4s',
      '008.m4s',
      '009.m4s',
    ]);
  });
  it('expands explicit timelines and inherited BaseURL', () => {
    const [s] = parseDash(
      wrap(
        '<BaseURL>https://cdn.example.com/</BaseURL><AdaptationSet mimeType="audio/mp4"><SegmentTemplate media="$Time$.m4s"><SegmentTimeline><S t="20" d="5" r="2"/></SegmentTimeline></SegmentTemplate><Representation id="a"/></AdaptationSet>',
      ),
      base,
    );
    expect(s.segments?.map((s) => s.url)).toEqual([
      'https://cdn.example.com/20.m4s',
      'https://cdn.example.com/25.m4s',
      'https://cdn.example.com/30.m4s',
    ]);
  });
  it('supports SegmentList ranges', () => {
    const [s] = parseDash(
      wrap(
        '<AdaptationSet><Representation id="v"><SegmentList><Initialization sourceURL="all.mp4" range="0-19"/><SegmentURL media="all.mp4" mediaRange="20-99"/></SegmentList></Representation></AdaptationSet>',
      ),
      base,
    );
    expect(s.segments?.[0].range).toEqual({ offset: 20, length: 80 });
  });
  it('flags DRM and separate video/audio', () => {
    const streams = parseDash(
      wrap(
        '<AdaptationSet mimeType="video/mp4"><ContentProtection schemeIdUri="urn:uuid:test"/><Representation id="v"><BaseURL>video.mp4</BaseURL></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation id="a"><BaseURL>audio.mp4</BaseURL></Representation></AdaptationSet>',
      ),
      base,
    );
    expect(streams.find((s) => s.id === 'v')?.blocked).toContain('Protected');
    expect(streams.find((s) => s.id === 'a')?.blocked).toBeUndefined();
  });
  it('rejects unbounded repeats, entity declarations and multiple periods', () => {
    expect(() =>
      parseDash(
        wrap(
          '<AdaptationSet><Representation><SegmentTemplate media="$Time$.m4s"><SegmentTimeline><S d="2" r="-1"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet>',
        ),
        base,
      ),
    ).toThrow('Unbounded');
    expect(() => parseDash('<!DOCTYPE x><MPD/>', base)).toThrow('entity');
    expect(() => parseDash('<MPD><Period/><Period/></MPD>', base)).toThrow('Multi-period');
  });
});
describe('bounded and authenticated request handling', () => {
  it('enforces body limits and disables redirects and credentials', async () => {
    const original = globalThis.fetch;
    let options: RequestInit | undefined;
    globalThis.fetch = async (_url, init) => {
      options = init;
      return new Response(new Uint8Array(40));
    };
    try {
      await expect(mediaFetch('https://example.com/a', {}, 20)).rejects.toThrow('size limit');
      expect(options?.redirect).toBe('error');
      expect(options?.credentials).toBe('omit');
    } finally {
      globalThis.fetch = original;
    }
  });
  it('rejects a server that ignores byte ranges', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('ignored range', { status: 200 });
    try {
      await expect(
        mediaFetch('https://example.com/a', { headers: { Range: 'bytes=0-2' } }),
      ).rejects.toThrow('ignored');
    } finally {
      globalThis.fetch = original;
    }
  });
});
