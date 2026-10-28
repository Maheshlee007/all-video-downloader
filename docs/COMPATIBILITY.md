# Compatibility — v0.1.0

The 46 core tests verify format parsing and assembly; full extension browser integration is pending because the cloud system browser blocks unpacked extensions and the dedicated test-browser host is not yet allowed. These are format-level capabilities, not a promise that every website exposing that format works. Browser checks use controlled synthetic fixtures; no third-party website compatibility is claimed.

| Capability                                                            | Status      | Limits / evidence                                                                                        |
| --------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Direct MP4 / WebM / audio / ordinary files                            | Implemented | Native Chrome downloads; browser handoff integration pending in this cloud environment                   |
| Page detection                                                        | Implemented | video/audio/source and OpenGraph metadata, accessible permitted frames                                   |
| Network detection                                                     | Implemented | URL and MIME classification on granted origins; TS/m4s segment noise filtered                            |
| Pasted media URLs                                                     | Implemented | Direct files, HLS, DASH                                                                                  |
| Pasted webpage extraction                                             | Deferred    | Open the page, grant site access, and play its video                                                     |
| Preview                                                               | Implemented | Native video + bundled hls.js/dash.js; codec/CORS limitations apply                                      |
| HLS master quality selection                                          | Implemented | Resolution/bandwidth variants; one master-to-media level                                                 |
| Unencrypted HLS VOD, MPEG-TS                                          | Implemented | mux.js transmuxes multiplexed tracks to fragmented MP4; core pipeline output decoded with FFmpeg         |
| Unencrypted HLS VOD, fMP4                                             | Implemented | EXT-X-MAP plus ordered fragments; separately tested synthetic fixture                                    |
| HLS byte ranges                                                       | Implemented | Parser and strict HTTP 206/body-length checks; initialization offsets must be explicit                   |
| HLS AES-128 / SAMPLE-AES / DRM                                        | Unsupported | Explicitly rejected; no decryption or bypass                                                             |
| HLS discontinuities                                                   | Deferred    | Explicitly blocked                                                                                       |
| External HLS audio rendition merging                                  | Deferred    | Explicitly blocked, even when a group offers an optional external track                                  |
| DASH SegmentTemplate                                                  | Implemented | Duration or bounded SegmentTimeline, initialization, Number/Time/RepresentationID/Bandwidth substitution |
| DASH SegmentList                                                      | Implemented | Initialization and media byte ranges                                                                     |
| DASH single track / multiplexed representation                        | Implemented | Video-only and audio-only synthetic outputs decoded with FFmpeg                                          |
| DASH separate audio + video merge                                     | Deferred    | Video-only choice blocked when separate audio adaptation is advertised; audio may be saved               |
| DASH SegmentBase / SIDX, multiple periods, unbounded timeline repeats | Deferred    | Rejected explicitly                                                                                      |
| Live recording                                                        | Deferred    | Live manifests blocked                                                                                   |
| Conversion / FFmpeg.wasm                                              | Deferred    | No codec conversion; mux.js remuxes MPEG-TS without encoding                                             |
| Download manager                                                      | Implemented | Native file pause/resume; segment-boundary pause; cancel/retry/history; sequential segmented queue       |
| Resume after browser restart                                          | Partial     | Native downloads use Chrome; segmented jobs require retry from the start                                 |
| Batch                                                                 | Implemented | Selected direct files only                                                                               |
| Subtitles / site adapters / YouTube extractor                         | Deferred    | No site-specific claims                                                                                  |
| Mobile / desktop app                                                  | Future      | Shared core is isolated from Chrome except storage/network adapters                                      |

Authenticated sites may reject requests: manifest/segment fetches omit cookies and custom authentication headers and do not replay website session headers. Signed URLs work while valid and accessible. Redirects are refused for manifest/segment requests to avoid automatically following an unvalidated target. Expired URLs require rediscovery.
