# ClipNest release downloads

Download `clipnest-0.1.1.zip` and extract it into a permanent folder. The ZIP contains the built extension files at its root, including `manifest.json`.

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode.
3. Choose Load unpacked and select the extracted folder.
4. Open a normal webpage and click the ClipNest extension icon.

Version 0.1.1 fixes extension-page message authorization when the interface is opened in a browser tab. It retains the restrictions on privileged messages from webpage content scripts. Core regression tests: 46 passed; production build passed. Full browser integration validation remains pending; see `docs/VALIDATION.md`.

`SHA256SUMS` records the ZIP checksum (run `sha256sum -c releases/SHA256SUMS` from the repository root). This file is a compiled copy of `dist`, not a Chrome Web Store signed CRX. Only install extensions from sources you trust.

Version 0.1.2 adds explicit cross-site frame/CDN permission controls, buffered resource discovery, extensionless media detection/analysis, and standard AES-128 HLS. Its full Chromium integration suite gates the new automatic preview-release job. See the repository Releases page for published, validated workflow builds; checked-in ZIPs remain available for manual testing.
