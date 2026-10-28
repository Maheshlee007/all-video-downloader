import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, readFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assemble } from '../src/core/assemble';
import { parseHls } from '../src/core/hls';
import { parseDash } from '../src/core/dash';
import type { Stream } from '../src/core/types';
let directory: string;
function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'clipnest-media-'));
  const input = [
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
  ];
  ffmpeg([
    ...input,
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '0',
    join(directory, 'ts.m3u8'),
  ]);
  ffmpeg([
    ...input,
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_list_size',
    '0',
    join(directory, 'fmp4.m3u8'),
  ]);
  ffmpeg(['-i', join(directory, 'ts.m3u8'), '-c', 'copy', join(directory, 'source.mp4')]);
  ffmpeg([
    '-i',
    join(directory, 'source.mp4'),
    '-map',
    '0:v',
    '-c',
    'copy',
    '-f',
    'dash',
    '-seg_duration',
    '2',
    join(directory, 'video.mpd'),
  ]);
  ffmpeg([
    '-i',
    join(directory, 'source.mp4'),
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
    join(directory, 'audio.mpd'),
  ]);
}, 20000);
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('real media assembly and independent decoding', () => {
  it.each([
    ['ts.m3u8', ['video', 'audio']],
    ['fmp4.m3u8', ['video', 'audio']],
    ['video.mpd', ['video']],
    ['audio.mpd', ['audio']],
  ])('assembles %s into playable output', async (name, tracks) => {
    const text = await readFile(join(directory, name as string), 'utf8');
    const url = `https://fixtures.example.com/${name}`;
    const [stream] = String(name).endsWith('mpd') ? parseDash(text, url) : parseHls(text, url);
    expect(stream.blocked).toBeUndefined();
    expect(stream.segments!.length).toBeGreaterThan(1);
    const output = join(directory, `${name}.output.mp4`),
      file = await open(output, 'w');
    const progress: number[] = [];
    try {
      await assemble(stream, {
        fetch: async (segment) =>
          new Uint8Array(await readFile(join(directory, basename(new URL(segment.url).pathname)))),
        write: async (data) => {
          await file.write(data);
        },
        progress: async (completed) => {
          progress.push(completed);
        },
      });
    } finally {
      await file.close();
    }
    expect(progress.at(-1)).toBe(stream.segments!.length);
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
        { encoding: 'utf8' },
      ),
    );
    for (const track of tracks)
      expect(probe.streams.some((s: any) => s.codec_type === track)).toBe(true);
    expect(Number(probe.format.duration)).toBeGreaterThan(5);
    expect(Number(probe.format.duration)).toBeLessThan(7);
    // Decode every frame and audio packet; a successful manifest parse alone is not enough.
    const stderr = execFileSync(
      'ffmpeg',
      ['-xerror', '-v', 'error', '-i', output, '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(stderr).toBe('');
  });
  it('rejects a blocked stream before fetching its segments', async () => {
    let fetched = false;
    await expect(
      assemble(
        {
          url: 'https://example.com',
          id: 'x',
          label: 'x',
          blocked: 'Encrypted',
          segments: [{ url: 'https://example.com/s' }],
        } as Stream,
        {
          fetch: async () => {
            fetched = true;
            return new Uint8Array();
          },
          write: async () => {},
          progress: async () => {},
        },
      ),
    ).rejects.toThrow('Encrypted');
    expect(fetched).toBe(false);
  });
});
