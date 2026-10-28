import { describe, expect, it } from 'vitest';
import { pageCandidate, resourceCandidates } from '../src/core/discovery';
describe('embedded and already-loaded media discovery', () => {
  it.each(['direct', 'hls', 'dash'] as const)(
    'preserves %s hints on extensionless URLs',
    (kind) => {
      expect(pageCandidate('https://cdn.example.com/play?token=abc', kind).kind).toBe(kind);
    },
  );
  it('keeps the file classification when a page provides no hint', () => {
    expect(pageCandidate('https://cdn.example.com/master.m3u8', 'page').kind).toBe('hls');
  });
  it('recovers and deduplicates manifests requested before scanning', () => {
    const found = resourceCandidates(
      [
        'https://cdn.example.com/master.m3u8?sig=abc',
        'https://cdn.example.com/master.m3u8?sig=abc',
        'https://cdn.example.com/movie.mp4',
      ],
      'Episode',
      'https://site.example.com/watch',
    );
    expect(found).toHaveLength(2);
    expect(found[0].kind).toBe('hls');
    expect(found[0].pageUrl).toBe('https://site.example.com/watch');
  });
  it('filters segment noise, private URLs, scripts and blob pipelines', () => {
    expect(
      resourceCandidates(
        [
          'https://cdn.example.com/1.ts',
          'https://cdn.example.com/1.m4s',
          'http://127.0.0.1/video.mp4',
          'blob:https://example.com/id',
          'https://example.com/app.js',
        ],
        'Title',
        'https://example.com',
      ),
    ).toEqual([]);
    expect(pageCandidate('https://cdn.example.com/1.m4s', 'direct').kind).toBe('page');
  });
});
