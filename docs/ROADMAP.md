# Delivery roadmap

## 0.1 — Foundation (this release)

Unified catalog, optional site access, content/network detection, pasted direct/manifest URLs, quality selection, direct/HLS/DASH previews, native file downloads, bounded HLS and DASH segmented assembly, OPFS, queue controls and local history. Controlled fixture tests establish actual playable output.

## 0.2 — Streaming completeness

- Add a separately benchmarked, locally bundled muxer for separate audio/video track merging. Evaluate FFmpeg.wasm against lighter MP4/WebM remuxers for memory, CSP and large-file limits.
- Test HLS audio language selection, subtitles, discontinuity timelines, and byte-range edge cases.
- Implement DASH SIDX and multi-period timelines with a fixture corpus and full output decoding.
- Persist segment checkpoints and recover OPFS assemblies after browser restarts and expired URLs.

Acceptance: independent audio/video tracks become one playable synchronized file; interrupted jobs recover without downloading completed segments again; no orphan storage.

## 0.3 — Recording and extraction

- Live HLS/DASH recording with user-selected stop, quota controls and gap reporting.
- Adapter registry and generic webpage metadata extraction, backed by permitted sample pages.
- Maintain a reproducible compatibility matrix before claiming support for individual websites.
- Add subtitle export, audio language selection and broader batch controls.

## Beyond

Package a desktop shell only after benchmarks show browser limits. Consider optional native FFmpeg/yt-dlp processing for authorized media with signed installers and a constrained native-messaging API. Mobile needs platform-specific permissions/background execution/storage and app-store policy review; reuse the media models and parsers rather than assuming MV3 runs unchanged.

Conversion, authenticated workflows, Firefox support, accessibility audits and store submission each need their own acceptance tests. No universal-site or DownloadHelper-parity claim should precede those tests.
