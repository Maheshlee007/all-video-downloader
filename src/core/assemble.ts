import mux from 'mux.js';
import type { Segment, Stream } from './types';
/** Shared browser/desktop media pipeline. Output is written incrementally. */
export async function assemble(
  stream: Stream,
  io: {
    fetch: (segment: Segment) => Promise<Uint8Array>;
    write: (data: Uint8Array) => Promise<void>;
    progress: (completed: number) => Promise<void>;
    checkpoint?: () => Promise<void>;
  },
) {
  if (stream.blocked) throw new Error(stream.blocked);
  if (!stream.segments?.length) throw new Error('No downloadable segments.');
  const keys = new Map<string, CryptoKey>();
  async function read(segment: Segment): Promise<Uint8Array> {
    const bytes = await io.fetch(segment);
    if (!segment.encryption) return bytes;
    const { keyUrl, iv } = segment.encryption;
    if (!/^[0-9a-f]{32}$/i.test(iv)) throw new Error('Invalid AES-128 initialization vector.');
    let key = keys.get(keyUrl);
    if (!key) {
      const keyBytes = await io.fetch({ url: keyUrl });
      if (keyBytes.length !== 16) throw new Error('An AES-128 key must contain exactly 16 bytes.');
      key = await crypto.subtle.importKey(
        'raw',
        keyBytes as unknown as BufferSource,
        'AES-CBC',
        false,
        ['decrypt'],
      );
      keys.set(keyUrl, key);
    }
    const vector = Uint8Array.from(iv.match(/../g)!, (byte) => parseInt(byte, 16));
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-CBC', iv: vector },
          key,
          bytes as unknown as BufferSource,
        ),
      );
    } catch {
      throw new Error(
        'AES-128 segment decryption failed. Rediscover the playlist if its key has expired.',
      );
    }
  }
  let initialized = false,
    pieces: Uint8Array[] = [];
  let transmuxer: InstanceType<typeof mux.mp4.Transmuxer> | undefined;
  if (stream.container === 'ts') {
    transmuxer = new mux.mp4.Transmuxer({ keepOriginalTimestamps: false });
    transmuxer.on('data', (segment) => {
      if (!initialized) {
        pieces.push(segment.initSegment);
        initialized = true;
      }
      pieces.push(segment.data);
    });
  }
  try {
    await io.checkpoint?.();
    if (stream.init) await io.write(await read(stream.init));
    let completed = 0;
    for (const segment of stream.segments) {
      await io.checkpoint?.();
      const bytes = await read(segment);
      if (transmuxer) {
        pieces = [];
        transmuxer.push(bytes);
        transmuxer.flush();
        for (const piece of pieces) await io.write(piece);
      } else await io.write(bytes);
      await io.progress(++completed);
    }
  } finally {
    transmuxer?.dispose();
    keys.clear();
  }
}
