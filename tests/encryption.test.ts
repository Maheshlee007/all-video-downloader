import { describe, expect, it } from 'vitest';
import { parseHls } from '../src/core/hls';
import { assemble } from '../src/core/assemble';
const base = 'https://cdn.example.com/master.m3u8';
describe('standard AES-128 HLS', () => {
  it('derives 128-bit IVs from the media sequence without losing integer precision', () => {
    const [s] = parseHls(
      '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:9007199254740993\n#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts\nb.ts\n#EXT-X-ENDLIST',
      base,
    );
    expect(s.blocked).toBeUndefined();
    expect(s.segments![0].encryption?.iv).toBe(9007199254740993n.toString(16).padStart(32, '0'));
    expect(s.segments![1].encryption?.iv).toBe(9007199254740994n.toString(16).padStart(32, '0'));
  });
  it('handles key rotation, explicit IVs and METHOD=NONE', () => {
    const [s] = parseHls(
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key1",IV=0xA\na.ts\n#EXT-X-KEY:METHOD=AES-128,URI="key2",IV=0xB\nb.ts\n#EXT-X-KEY:METHOD=NONE\nc.ts\n#EXT-X-ENDLIST',
      base,
    );
    expect(s.segments![0].encryption).toEqual({
      keyUrl: 'https://cdn.example.com/key1',
      iv: 'A'.padStart(32, '0'),
    });
    expect(s.segments![1].encryption?.keyUrl).toContain('key2');
    expect(s.segments![2].encryption).toBeUndefined();
  });
  it('rejects invalid IVs and encrypted maps without an explicit IV', () => {
    expect(() =>
      parseHls('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0xZZ\na.ts\n#EXT-X-ENDLIST', base),
    ).toThrow('vector');
    expect(() =>
      parseHls(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-MAP:URI="init.mp4"\na.m4s\n#EXT-X-ENDLIST',
        base,
      ),
    ).toThrow('explicit IV');
  });
  it('refuses DRM key formats', () => {
    const [s] = parseHls(
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,KEYFORMAT="com.example.drm",URI="key"\na.ts\n#EXT-X-ENDLIST',
      base,
    );
    expect(s.blocked).toContain('Protected');
  });
  it('rejects invalid key lengths before writing output', async () => {
    const [stream] = parseHls(
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts\n#EXT-X-ENDLIST',
      base,
    );
    await expect(
      assemble(stream, {
        fetch: async () => new Uint8Array(15),
        write: async () => {
          throw new Error('Should never write');
        },
        progress: async () => {},
      }),
    ).rejects.toThrow('exactly 16 bytes');
  });
});
