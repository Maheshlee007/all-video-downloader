declare module 'mux.js' {
  const mux: {
    mp4: {
      Transmuxer: new (options?: { keepOriginalTimestamps?: boolean }) => {
        on(
          event: 'data',
          handler: (segment: { initSegment: Uint8Array; data: Uint8Array; type: string }) => void,
        ): void;
        push(data: Uint8Array): void;
        flush(): void;
        dispose(): void;
      };
    };
  };
  export default mux;
}
