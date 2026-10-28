# Validation record — 2026-10-28

## Current 0.1.2 checks

- 59 core tests passed: sender authorization, URL handling, resource/extensionless discovery, HLS/DASH parsing, AES-128 IVs/key rotation/key-format rejection, and bounded request handling.
- Six real-media assembly tests include five generated outputs: ordinary TS HLS, AES-128 TS HLS, fragmented-MP4 HLS, DASH video and DASH audio. The same pipeline used by the offscreen engine produced files inspected with ffprobe and fully decoded by FFmpeg. The sixth check verifies blocked streams do not fetch segments.
- Strict TypeScript and production build passed before release packaging.
- `npm run test:ui` covers navigation, preview-only errors, dialog behavior and responsive 390px layout. Its current run result is recorded in the task report.

## Full extension integration evidence

The [0.1.1 workflow, run #2](https://github.com/Maheshlee007/all-video-downloader/actions/runs/40648522604), completed successfully. Its checked-in workflow ran the real Chromium extension suite, including content detection, native direct download, HLS/DASH assembly, pause/resume, output decoding and UI checks. The public run summary reported Success and two artifacts. Detailed logs require GitHub login and were not read here.

The 0.1.2 browser suite adds extensionless source classification, extensionless URL analysis, buffered manifest recovery, cross-origin iframe discovery and real AES-128 HLS output decoding. Publication is gated on that suite succeeding in Actions. Do not infer the new run passed merely from the prior successful run; check its actual result.

The cloud system browser blocks unpacked extensions by managed policy, and the dedicated Playwright browser download host is still outside the applied runtime allowlist. Local full-extension tests remain blocked. Network additions and installation/startup instructions were previously saved as an environment configuration draft; saving that draft does not apply or publish it.

## Release evidence

The previous workflow uploaded Actions artifacts only; it did not create a GitHub Release. The new release job runs only after successful validation on main, downloads that run's build artifact, and uses its scoped GitHub Actions token to publish a commit-specific preview release with ZIP and SHA-256 checksums. A local build or Git push alone is not proof publication succeeded. See the actual release job and Releases page.

No YouTube, AniWave, HiAnime, similarly named mirror, DRM, separate-track merge, live recording, mobile or desktop compatibility has been established. See PLATFORM-REVIEW.md for the sources and remaining work.
