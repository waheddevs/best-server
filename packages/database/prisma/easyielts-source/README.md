# Pinned easyIELTS import snapshot

This directory contains only the user-authorized static test modules and one
referenced audio asset required by the BEST LC import workflow. It is not a copy
of the easyIELTS application, runtime, credentials, AI integrations, or private
browser/server data.

- Upstream: `https://github.com/thinkall/easyIELTS.git`
- Audited commit: `7b39a29fc82304ff2c976495e0250232def1baf4`
- Imported on: 2026-09-28
- Static modules: 7
- Source tests: 39 (10 Listening, 10 Reading, 10 Writing, 9 Speaking)
- WAV SHA-256:
  `3eec286acc4092861ba762f8b5048d29358beb840f9936d7315eb92c8a2c4ed2`

The TypeScript files remain source snapshots. Do not edit their educational
content in place. A reviewed upstream refresh must replace the snapshot,
re-run normalization tests, and intentionally handle provenance hash drift.

The WAV is not served from this directory. Upload it through the existing BEST
LC media upload/confirmation flow, then pass its verified media UUID through
the importer's `--media-map` option.
