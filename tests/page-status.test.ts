import { describe, it, expect } from 'vitest';
import { scanSummary, pageNote, type ScanReport } from '../src/core/page-status';
const empty: ScanReport = {
  count: 0,
  mediaElements: 0,
  blobElements: 0,
  frameCount: 0,
  missingFrameOrigins: [],
};
describe('page diagnostics', () => {
  it('explains when the site has not loaded a player', () =>
    expect(scanSummary(empty)).toContain('No player has loaded'));
  it('reports missing iframe permissions before suggesting playback', () =>
    expect(
      scanSummary({ ...empty, frameCount: 1, missingFrameOrigins: ['https://player.example.com'] }),
    ).toContain('https://player.example.com'));
  it('explains blob playback without claiming it is a media file', () =>
    expect(scanSummary({ ...empty, mediaElements: 1, blobElements: 1 })).toContain('blob-backed'));
  it('reports successful detection', () =>
    expect(scanSummary({ ...empty, count: 2 })).toContain('Found 2'));
  it('distinguishes an existing player without a media URL', () =>
    expect(scanSummary({ ...empty, mediaElements: 1 })).toContain('Start playback'));
  it.each(['https://www.youtube.com/watch?v=M6mYodf0dJM', 'https://youtu.be/M6mYodf0dJM'])(
    'states the actual YouTube limitation for %s',
    (url) => expect(pageNote(url)).toContain('does not yet include YouTube extraction'),
  );
  it('does not misidentify lookalike domains', () =>
    expect(pageNote('https://youtube.com.example.com/watch')).not.toContain('YouTube'));
});
