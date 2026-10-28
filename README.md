# ClipNest Universal

A local-first Chrome / Edge extension for discovering, previewing, and saving media. A single catalog combines page scanning, permitted network observations, and pasted media URLs. No backend or account is required.

**Version 0.1.2 is an initial working release, not full Video DownloadHelper parity.** See the [compatibility matrix](docs/COMPATIBILITY.md) for exact limits and the [roadmap](docs/ROADMAP.md) for the next milestones. The original product requirements are preserved in [docs/PRODUCT-BRIEF.md](docs/PRODUCT-BRIEF.md).

## Install locally

Requires Node.js 24+, npm, and Chrome/Edge 116+. Running the media tests also requires FFmpeg/ffprobe.

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select this project's **dist** directory.
4. Pin ClipNest, open a normal webpage, and click the extension icon to open the side panel.
5. Click **Scan page**, grant that site's access, and play a video. On future visits, detection runs automatically on granted sites. Grant embedded/CDN origins separately when needed.
6. If the player uses another domain or a CDN, choose **Enable cross-site detection**, grant the optional HTTP/HTTPS access, then reload and play the page. Per-site permissions remain available.
7. Download an ordinary file or choose a supported HLS/DASH stream. Preview uses bundled hls.js / dash.js and remains subject to codec and CORS restrictions.

For a direct media URL or manifest, paste it into **Analyze URL**. For a webpage URL, open the page in a tab and scan/play it: generic server-side HTML extraction and site adapters are not implemented.

Only save content you have permission to download. ClipNest does not bypass DRM, paywalls, access controls, or protected playback. Standard AES-128 HLS with an accessible identity key is supported.

## Download a built release

After each successful main-branch validation, GitHub Actions publishes a commit-specific preview under [Releases](https://github.com/Maheshlee007/all-video-downloader/releases). Download the **clipnest-\*.zip** asset, not GitHub's automatically generated source-code ZIP. Extract it and load the folder containing manifest.json as an unpacked extension. Failed validation does not publish a release. Actions artifacts remain available separately.

See the [platform review](docs/PLATFORM-REVIEW.md) for why embedded streaming sites differ from direct files, what was fixed, and why YouTube is still unsupported.

## Development

```sh
npm run dev           # UI preview only; extension APIs require loading dist in Chrome
npm test              # Parsers, request bounds, real assembly + FFmpeg decoding
npm run build         # TypeScript + production extension + isolated content script
npm run test:ui       # UI preview interactions and responsive layout
npm run test:browser  # Real Chromium extension + generated local media + FFmpeg validation
npm run package       # artifacts/clipnest-0.1.2.zip, ready to extract and load unpacked
```

Browser integration tests require system Chromium, FFmpeg/ffprobe, and permission to launch Chromium and listen on a loopback test port. Set `CHROMIUM_PATH` if Chromium is elsewhere. Tests generate six-second media from FFmpeg's synthetic video/audio sources; they do not access third-party videos. A temporary extension copy gets permission for the fixture origin; the shipped manifest keeps host access optional. Test screenshots are written to ignored `test-results/`.

After rebuilding, reload the extension in the extensions page. Live extension service workers are not served by Vite HMR. `npm run dev` is for layout work only and displays an explicit preview banner.

## Architecture

- `src/core/`: portable TypeScript models, HLS/DASH parsers, URL classification, bounded networking, IndexedDB persistence.
- `src/extension/background.ts`: MV3 coordinator, catalog, native downloads, permissions and download state.
- `src/extension/content.ts`: DOM metadata detection in permitted pages and frames.
- `src/extension/offscreen.ts`: one-at-a-time segment queue, retries, pause/cancel, OPFS staging, MPEG-TS transmuxing and browser save handoff.
- `src/ui/`: React/Zustand side panel, quality selection, previews, download manager and history.

Segmented files are staged in OPFS and exposed as a disk-backed File object URL rather than concatenating the entire video in RAM. Segment fetches are capped at 64 MiB; manifest fetches at 8 MiB. Temporary files are removed after save completion/interruption, on cancellation/failure, or when a new offscreen document cleans up a previous crashed session. Browser storage quotas still apply. Concurrent final save handoffs can overlap, but only one segmented assembly runs at a time.

Chrome's download manager handles ordinary file pause/resume. Segmented pause occurs between segments; browser restarts require retrying a segmented job from the beginning. IndexedDB preserves catalog/history/job records, not a cross-restart segment checkpoint. Keep Chrome running while jobs finish.

See [validation results](docs/VALIDATION.md) for the distinction between tested core behavior and browser integration evidence. See [security and privacy](docs/SECURITY.md) for permission scope, signed URL retention, redirect policy, and known boundaries. Future mobile/desktop shells can reuse the pure media parsers and models; Chrome APIs and OPFS need platform adapters.

## License

MIT for original ClipNest code. Bundled dependencies retain their own licenses; see [third-party notices](docs/THIRD-PARTY.md).
