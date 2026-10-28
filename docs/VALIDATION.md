# Validation record — 2026-10-28

## Passed in the current cloud instance

- 32 core tests: URL classification/safety, HLS qualities, encryption/live/discontinuity flags, ranges, DASH templates/timelines/representations, bounded request bodies and strict range-response handling.
- 5 assembly tests: generated six-second HLS MPEG-TS, HLS fragmented MP4, DASH video-only, DASH audio-only fixtures assembled through the same core pipeline used by the offscreen engine, independently inspected with ffprobe and fully decoded with FFmpeg; blocked streams never fetch their segments.
- Strict TypeScript check and Vite production build.
- Production dependency audit: no reported vulnerabilities at validation time.

## Browser validation

Passed: `npm run test:ui` exercises the ordinary web preview: navigation, extension-only error handling, accessible dialog dismissal, desktop layout, and 390px side-panel layout. Screenshots are written to ignored `test-results/`.

Full `npm run test:browser` is implemented but **has not completed in this cloud instance**. The system Chromium's managed policy blocks unpacked extensions. Playwright's dedicated browser download returned HTTP 403 (domain forbidden) for cdn.playwright.dev. Network additions for cdn.playwright.dev and storage.googleapis.com were saved in the environment configuration draft, along with install/start instructions. Saving the draft does not apply or publish it.

Therefore native Chrome download handoff, actual MV3/offscreen lifecycle, optional-permission prompts, browser pause/resume, and extension content/network detection are **not yet established by a passing browser integration run**. Core media-output tests do not substitute for those checks.

After allowing the saved domains in environment settings, install Playwright Chromium and run the browser suite using its executable path. The suite generates its own local media, loads a temporary unpacked extension, validates detection and downloaded files, and fails on decode errors. GitHub Actions is configured to run this suite in its own runner; its outcome must be checked separately.

No third-party website, store publication, fresh-task environment restoration, live recording, separate-track merging, or mobile/desktop shell has been validated.
