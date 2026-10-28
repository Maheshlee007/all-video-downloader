# Downloader architecture review — 2026-10-28

## Findings from upstream sources

1. **DownloadHelper v10 is browser-first.** The official [CoApp repository](https://github.com/aclap-dev/vdhcoapp) now explicitly says the companion is no longer developed and v10 does not require it. Its older native engine provided filesystem operations and FFmpeg, but that is not evidence that a native companion is mandatory for today's product. DownloadHelper's current browser implementation is not provided by that repository; we have not audited its proprietary streaming core. Its main documentation website was blocked by this environment, so current website-specific claims could not be independently checked there.
2. **Preview is different from saving.** [hls.js](https://github.com/video-dev/hls.js) supplies Media Source playback, manifest handling and transmuxing. A video element with a blob URL is usually a playback pipeline, not a downloadable source URL. Saving needs the original manifest, initialization/media segments, audio tracks, keys where applicable, timeline handling, and a muxer.
3. **Broad coverage requires both generic detection and extraction.** [yt-dlp's generic extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/generic.py) handles metadata/embedded players and delegates to other extractors. Its [site list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) explicitly notes unlisted sites may still work through embed/generic extraction; listing or guessing a domain is not proof that an actual episode downloads.
4. **Ordinary AES-128 HLS is distinct from DRM.** The [yt-dlp HLS downloader](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/downloader/hls.py) handles fragment ordering, encryption metadata, keys and byte ranges. ClipNest can likewise process standard AES-CBC when the playlist exposes an accessible 16-byte identity key. This does not provide Widevine, FairPlay, SAMPLE-AES, license acquisition or DRM bypass.
5. **YouTube is a separate extraction/muxing problem.** yt-dlp has a [dedicated YouTube extractor](https://github.com/yt-dlp/yt-dlp/tree/master/yt_dlp/extractor/youtube) rather than treating a watch URL as an MP4. Its [README](https://github.com/yt-dlp/yt-dlp#dependencies) describes FFmpeg/ffprobe for merging separate audio/video and a supported JavaScript engine plus current challenge helpers. Bundling hls.js or fetching the YouTube page does not implement those capabilities.

## What was wrong in ClipNest

- Site-only permissions could miss a player iframe or CDN on another origin.
- Network observation missed requests made before permission was granted; existing DOM scanning did not inspect buffered resource timings.
- DOM detection classified extensionless `<source type="video/mp4">` media correctly, but the worker discarded that classification and reclassified the URL as a webpage.
- URL analysis read a media response as a small text document before checking its MIME type, so an extensionless large video could fail at the manifest size limit.
- All encrypted HLS was blocked, including normal AES-128 identity-key playlists.
- The workflow uploaded Actions artifacts but never called the Releases API. A successful Actions run therefore did not create a release.

## Changes in 0.1.2

- Explicit optional cross-site HTTP/HTTPS access for frames and CDNs, with clear permission explanation. Per-site mode remains available. No silent broad permission grant.
- Buffered and newly observed resource timing discovery, retaining one candidate per manifest instead of adding each transport segment.
- Retained media type hints for extensionless DOM sources, header-only classification of extensionless direct media, active-page metadata tracking, and scan feedback.
- Standard AES-128 identity-key HLS processing with explicit or sequence-derived IVs, key rotation, and in-memory-only imported keys. Segments are still staged on disk. SAMPLE-AES and protected DASH remain unsupported.
- Release publication after a successful main-branch validation run: the workflow publishes a commit-specific preview release with the built ZIP and SHA-256 checksums. Failed validation does not publish.

## Platform expectations

| Platform/case                                | What can be established now                                                                   | Still required                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary direct files                        | Controlled full-extension fixture test passed in CI for 0.1.1                                 | Actual host may still require session headers or reject downloads                                                                 |
| HLS players / blob-backed players            | Generic manifest discovery plus TS/fMP4 assembly; 0.1.2 adds AES-128 and frame/resource fixes | Exact player URL, permitted host/CDN access, and an actual site download test                                                     |
| AniWave / HiAnime or similarly named domains | No verified site adapter or compatibility claim                                               | Exact current domain and playable page; aliases/mirrors may use different players, keys and request rules                         |
| YouTube                                      | No supported downloader in this extension release                                             | Dedicated extractor, current challenge handling, separate-track selection and muxing; browser/store policy must also be evaluated |
| DRM streams                                  | Explicitly unsupported                                                                        | No DRM bypass is planned                                                                                                          |

The next compatibility milestone is a fixture-backed browser muxer for separate tracks plus tests against exact permitted sample pages. An optional local yt-dlp/FFmpeg engine can be evaluated for specialized extraction; installing one is not a substitute for testing it, and it is not mandatory for ordinary browser downloads. Mobile/desktop should reuse the core models/parsers but will need their own permission, networking, filesystem and execution adapters.
