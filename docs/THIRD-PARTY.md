# Third-party components

ClipNest bundles libraries through npm rather than executing remotely hosted code.

| Component         | Use                 | License      |
| ----------------- | ------------------- | ------------ |
| React / React DOM | Interface           | MIT          |
| Zustand           | Interface state     | MIT          |
| Lucide            | Icons               | ISC          |
| hls.js            | HLS previews        | Apache-2.0   |
| dash.js           | DASH previews       | BSD-3-Clause |
| mux.js            | MPEG-TS transmuxing | Apache-2.0   |
| fast-xml-parser   | DASH XML parsing    | MIT          |

Build and test tooling includes Vite, TypeScript, esbuild, Vitest, and Playwright. Their transitive packages retain their own licenses. `package-lock.json` records exact versions and integrity metadata. FFmpeg is a system test prerequisite and is not shipped in the extension. There is no copied Video DownloadHelper or Flixmate implementation and no assertion of affiliation.
