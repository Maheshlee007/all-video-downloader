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
    if (stream.init) await io.write(await io.fetch(stream.init));
    let completed = 0;
    for (const segment of stream.segments) {
      await io.checkpoint?.();
      const bytes = await io.fetch(segment);
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
  }
}
