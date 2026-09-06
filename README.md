# Suwatte Extensions

Dev catalog for [Suwatte](https://suwatte.mantton.com/developers/introduction/) source plugins.

## Sources

### Static Demo (`en.static-demo`)

Two fixture titles (1 chapter / 2 pages each) with rich metadata. Good for verifying the toolchain path.

### R2 Library (`en.r2-library`)

Reads a private Cloudflare R2 bucket.

**Root Prefix**

- Leave **empty** when title folders live at the **bucket root** (common when the bucket itself is named `manga`).
- Set to `manga` only if objects are under `manga/<title-id>/…` inside the bucket.

Layout (bucket root):

```text
<title-id>/
  details.json          # optional metadata
  cover.webp            # optional if details.cover is set
  chapter 1.cbz | .zip
  chapter 4.cbz | .zip
```

**Cover resolution**

1. `cover.*` file in the folder
2. `details.cover` absolute `http(s)` URL
3. `details.cover` chapter-page ref: `"[chapter name]_[page name]"`
4. Placeholder tile if none of the above (list/browse still works)

Example:

```json
"cover": "chapter 4_24.png"
```

→ page `24.png` inside `chapter 4.cbz` (also matches `004 - chapter 4.cbz`).

Full field list: [`examples/r2-layout/manga/the-static-signal/details.json`](examples/r2-layout/manga/the-static-signal/details.json)

Configure credentials in Suwatte → source settings (Account ID, Access Key, Secret, Bucket, optional endpoint/prefix).

## Setup

```sh
npm install
npm run build
npm run test:r2
npm run smoke
```

## Install in Suwatte

```sh
npm run serve
```

Or use the published list URL from this branch's `dist/`.
