import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { MediaPlayer } from 'dashjs';
import type { Candidate } from '../core/types';
export function Preview({ media }: { media: Candidate }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = video.current!;
    let destroy = () => {};
    const fail = () =>
      setError(
        'Preview unavailable for this stream. Download support may differ from playback support.',
      );
    if (media.kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hls.loadSource(media.url);
      hls.attachMedia(element);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) fail();
      });
      destroy = () => hls.destroy();
    } else if (media.kind === 'dash') {
      const dash = MediaPlayer().create();
      dash.initialize(element, media.url, false);
      dash.on('error', fail);
      destroy = () => dash.reset();
    } else element.src = media.url;
    element.addEventListener('error', fail);
    return () => {
      destroy();
      element.removeEventListener('error', fail);
      element.removeAttribute('src');
      element.load();
    };
  }, [media.url, media.kind]);
  return (
    <>
      <video ref={video} controls playsInline poster={media.poster} />
      {error && <p className="notice">{error}</p>}
    </>
  );
}
