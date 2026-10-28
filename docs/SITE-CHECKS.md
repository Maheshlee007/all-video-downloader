# Requested site checks — 2026-10-28

## Exact requests

- YouTube: https://www.youtube.com/watch?v=M6mYodf0dJM
- AniWave: the episode-1 URL supplied in the chat for title ID 82796 on aniwaves.ru.

## Observations in the newly published cloud environment

The current enforced policy includes the requested top-level hosts. No environment settings were changed during this recheck.

YouTube watch-page requests, and independent requests to youtube.com/robots.txt and www.youtube.com/robots.txt, still failed at the configured proxy with a tunnel HTTP 403. That is not evidence of a YouTube player response or a successful extractor. Duplicate allowlist entries were not added. This requires network/provider diagnosis; the present extension also lacks a dedicated YouTube extractor and separate-track muxer.

The AniWave HTML returned HTTP 200, approximately 93 KB. A real Chromium navigation also returned HTTP 200, but after loading there were zero video elements, no player iframe, and an empty episode-server container. Browser script errors included `jQuery is not defined` and `Swiper is not defined`. Requests to cdnjs.cloudflare.com failed at the network tunnel, including the site's jQuery and Swiper dependencies. challenges.cloudflare.com was also blocked. These are observed prerequisites for further player inspection; no protection or challenge was bypassed. Thumbnails on static.aniwaves.ru were blocked as well. Advertising/analytics failures are not treated as necessary download prerequisites.

The player therefore never initialized in this environment. No video manifest/CDN could be identified and no episode download was verified. The original HTML and browser diagnostics were examined locally; no session headers, cookies, or signed media URLs were committed.

## Enhancements in 0.1.3

- Pasted webpage URLs offer a deliberate Open page for detection action instead of only returning a generic error. Extensionless media detection is retained. Failed automatic inspection still reports the underlying failure; opening a page is not reported as a successful download.
- Scans report whether media elements or blob-backed players exist and identify iframe origins lacking host access.
- Empty-player feedback explains that the site itself must finish loading, addressing the observed AniWave failure.
- YouTube page analysis explicitly states that its extractor/track-merging support is absent.

Validation: all 67 core tests, TypeScript/build, the full local Chromium extension suite, and the UI suite passed. Browser tests exercise actual page opening, empty-player reports, cross-origin detection, direct/HLS/AES-128/DASH downloads, and independent media decoding. These controlled fixture results do not establish compatibility with either requested live site.

The recheck initially prepared a local ZIP without publishing. The user subsequently requested a push and downloadable GitHub release; version 0.1.3 is now prepared for that release workflow. This publication does not change the live-site compatibility findings above.
