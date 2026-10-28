# ClipNest Universal — One extension for video detection, preview and downloading

The goal is to build one powerful video-downloader extension that combines the capabilities of Video DownloadHelper, Flixmate, HLS downloaders, streaming recorders and URL-based video downloaders.

Instead of maintaining separate extensions for different websites and video formats, ClipNest will have a single interface backed by multiple detection and downloading engines.

An important finding: Video DownloadHelper v10 became self-contained in December 2025, removing its previous native companion requirement. It now processes ordinary downloads and many HLS/DASH streams inside the browser. That makes a browser-first architecture more realistic than assuming we need desktop software from the beginning.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://dev.downloadhelper.net\&sz=32)

Video Download Helper



## 1. What our universal downloader should support

| Capability             | Intended functionality                                           | Priority |
| ---------------------- | ---------------------------------------------------------------- | -------- |
| Direct video downloads | MP4, WebM, MOV and supported audio files                         | P0       |
| URL-based downloading  | Paste a video URL or webpage URL, analyze and download           | P0       |
| Video preview          | Thumbnail, duration, quality, playable preview where supported   | P0       |
| HLS streaming          | `.m3u8`, `.ts`, `.m4s`, fragmented MP4                           | P0       |
| DASH streaming         | `.mpd`, separate video/audio segments                            | P0       |
| Segmented downloads    | Download many parts and assemble into one playable file          | P0       |
| Quality selection      | 360p, 720p, 1080p, 4K when available                             | P0       |
| Automatic detection    | Detect videos when opening or playing a webpage                  | P0       |
| Audio + video merging  | Combine separate tracks without unnecessary re-encoding          | P0       |
| Download manager       | Progress, queue, pause/resume where technically supported        | P0       |
| Embedded videos        | Detect media inside accessible frames and embedded players       | P1       |
| Live-stream recording  | Record supported streams while they are available                | P1       |
| Audio and subtitles    | Audio-only downloads, subtitle tracks, language selection        | P1       |
| Site-specific support  | Adapter-based extractors for websites requiring special handling | P1       |
| Format conversion      | MP4, MKV, WebM, MP3 and other supported outputs                  | P2       |
| Batch downloads        | Download multiple detected videos from one page                  | P2       |

P0 = essential first release, P1 = next development phase, P2 = enhancement.

The key architectural requirement is that every video should go through one unified detection and download workflow, regardless of which engine discovers it.

There are genuine limits. A browser `blob:` URL may represent a Media Source Extensions playback pipeline rather than an actual downloadable file, and DRM-protected streams cannot be treated as ordinary segmented media.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.mozilla.org\&sz=32)

MDN+1



## 2. Proposed architecture

We should use a hybrid discovery architecture, not one detection technique. This is how we avoid needing a different downloader for every website.

One UI, three discovery paths and specialized download engines

### How discovery will work

Layer A — Page scanning

Read accessible video/audio elements, source tags, poster images, player metadata and embedded frames. This covers ordinary HTML5 players and websites exposing standard media elements.

Layer B — Network monitoring

Observe requests for MP4/WebM, manifests and segment resources. Detect media by URL patterns, response content types and request context, then group related requests into a single video candidate.

Chrome's `webRequest` API supports request observation, subject to host permissions, but it is not a universal response-body capture API.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.chrome.com\&sz=32)

Chrome for Developers



Layer C — URL extraction

When you paste a URL, classify it as a direct media file, HLS manifest, DASH manifest or webpage. For webpage URLs, use generic metadata discovery followed by a site adapter when necessary.

All three layers must feed the same media catalog. For example, an HLS playlist containing 900 segments should appear as one video with multiple available qualities, not 900 separate downloads.

## 3. How segmented streaming downloads work

Consider an HLS stream:

master.m3u8

Available qualities: 480p · 720p · 1080p

1080p media playlist

References video segments in playback order

001.ts

002.ts

003.ts

...

final-video.mp4

Ordered segments + audio + remuxing

The HLS engine must understand master/media playlists, initialization segments, MPEG-TS and fMP4/CMAF segments, audio renditions, byte ranges, discontinuities and live-playlist updates.

DASH requires a different parser for MPD representations, segment timelines and separate audio/video tracks. The two engines should share download scheduling, retries, storage and muxing.

For large files, use disk-backed staging via OPFS rather than collecting every segment in RAM. OPFS is subject to browser storage quotas, so we need capacity checks and recovery procedures.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.mozilla.org\&sz=32)

MDN



## 4. Unified extension interface

I recommend a persistent Chrome side panel for inspecting detected media and managing downloads, with a small popup for quick actions. Chrome supports persistent extension side panels through its official API.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.chrome.com\&sz=32)

Chrome for Developers



ClipNest

Paste a video URL to analyze…

Current tab

Detected media · Downloads · History

[Exploring Western Canada, Land of Big Mountains and Turquoise Lakes](https://images.openai.com/static-rsc-4/X8CZjC6YMox4tod8khZjALqk9Cl8hz_SVssYvH5pYb6zmML6G-gS0fVwFdgB5DMcXmGsapuam02zhPV6PncRnw1ZYLPUpDpp4jGNAJC1r4T1sawByhdE5MdZHE5WP4BU0O-o8ufcj2Qocou4EGU4OkdUiVPHS1yeSujB7mksW2Q?purpose=inline)

Detected video

HLS · 24:18 · Multiple qualities

Preview

Download

Video quality

Choose an available stream

1080p

Example download

68%

142 of 210 segments · Sample interface

Conceptual interface, not a working player or live download session.

Preview should use a normal video element for direct files, [hls.js](https://github.com/video-dev/hls.js?utm_source=chatgpt.com) for supported HLS streams and [dash.js](https://github.com/Dash-Industry-Forum/dash.js?utm_source=chatgpt.com) for DASH. Both libraries have established browser playback implementations. Preview availability will still depend on formats, CORS and access permissions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



## 5. Technology decisions

| Component                     | Selected approach                    |
| ----------------------------- | ------------------------------------ |
| Extension                     | Chrome Manifest V3                   |
| UI                            | React + TypeScript + Vite            |
| State                         | Zustand                              |
| Background coordination       | Service worker                       |
| Network observation           | `chrome.webRequest`                  |
| Persistent media jobs         | IndexedDB                            |
| Large-media temporary storage | OPFS                                 |
| Direct downloads              | `chrome.downloads`                   |
| HLS/DASH preview              | hls.js and dash.js                   |
| Streaming download engines    | Dedicated TypeScript modules         |
| Muxing/conversion             | Bundled FFmpeg.wasm, where practical |
| Optional advanced engine      | Native messaging + FFmpeg / yt-dlp   |
| Server/database               | None required                        |

The long-running media engine must not depend on an MV3 service worker staying alive indefinitely. Chrome can terminate inactive workers, so jobs need persisted state and resumable execution.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.chrome.com\&sz=32)

Chrome for Developers



The native companion is not mandatory for the initial product. We should attempt browser-only processing first and introduce it only when benchmarking proves it necessary for certain formats, large files or specialized extractors.

## 6. What about YouTube and other difficult websites?

YouTube is a special case. The current Chrome version of Video DownloadHelper explicitly excludes YouTube downloading; its documentation attributes this to Chrome Web Store policy.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://chromewebstore.google.com\&sz=32)

Chrome Web Store+2



For supported sites and authorized media, a future optional local engine could use [yt-dlp](https://github.com/yt-dlp/yt-dlp?utm_source=chatgpt.com) for URL extraction, format selection and segmented downloading. However, compatibility changes frequently, and this would not make every video downloadable.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



We should distinguish three boundaries:

- Technically downloadable: Ordinary file and non-DRM streams with accessible resources.
- Technically restricted: DRM, inaccessible media or incompatible playback protocols.
- Legally or platform restricted: Downloads disallowed by copyright, service terms or Chrome Web Store policy.

The extension should report these conditions clearly rather than displaying a download action that cannot succeed.

## 7. Development roadmap

Phase 1 — Research and foundation

Audit the three open-source references plus the selected media libraries. Build the new modular MV3 foundation, media candidate schema, URL analyzer, page/network detectors and unified side panel.

Success: direct media is discovered, previewed and downloaded from controlled test pages.

Phase 2 — Streaming engine (most important)

Implement complete non-DRM HLS and DASH workflows, quality selection, ordered segment downloads, audio selection, muxing, disk-backed staging and proper cleanup.

Success: independently verified playable outputs from multi-segment and separate-track streams.

Phase 3 — Reliability and advanced features

Add background queueing, resumable segments where supported, live recording, batch downloads, subtitles, deduplication, error handling and download history. Include testing for expiring URLs, redirects, partial responses and interrupted sessions.

Success: interrupted and long-running downloads recover correctly without leaking storage or memory.

Phase 4 — Wider compatibility

Add maintainable site adapters for permitted content that generic discovery cannot identify. Evaluate an optional native processing companion only for demonstrated browser limitations.

Success: a documented compatibility matrix based on real website and media-format tests.

Security should be built into each phase: request site permissions only as needed, avoid storing session credentials, reject unsafe local-network targets in URL processing, verify upstream binaries and keep executable code inside the extension package. Chrome MV3 does not generally permit remotely hosted executable extension code.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.chrome.com\&sz=32)

Chrome for Developers+1



## Final development direction

I would rework ClipNest v0.2 into a modular universal downloader rather than keep extending its limited HLS implementation. Preserve useful detection/UI concepts, but replace the streaming core with a proper manifest parser, download scheduler and muxing pipeline.

The first major goal should be an extension that reliably handles direct URLs, MP4/WebM, HLS, DASH, separate audio/video tracks and in-browser previews. That foundation will cover far more scenarios than adding dozens of individual website-specific rules from the start.

We can then expand coverage by solving actual failures rather than accumulating fragile site-specific code.