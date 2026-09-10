# Suwatte Extensions

Dev catalog for [Suwatte](https://suwatte.mantton.com/developers/introduction/) source plugins.

Parsers for nhentai / HentaiRead / HentaiNexus follow **Yūzōnō** cursed-manga-extensions first, then **Keiyoushi** extensions-source.

## Sources

### R2 Merge (`en.r2-merge`)

One library entry that **merges** multiple nhentai / HentaiRead / HentaiNexus (and Hentai2Read) galleries into chapters.

R2 stores metadata + cover. Chapter images are fetched live from the site URLs in `chapters.json`.

```text
<title-id>/
  details.json          # optional (same fields as R2 Library)
  cover.webp            # custom cover
  chapters.json         # required — remote gallery/reader URLs
```

Example `chapters.json`:

```json
{
  "chapters": [
    { "title": "Ch 1", "number": 1, "url": "https://nhentai.net/g/289857/" },
    { "title": "Ch 2", "number": 2, "url": "https://hentairead.com/hentai/some-slug/" },
    { "title": "Ch 3", "number": 3, "id": "21161", "source": "hentainexus" }
  ]
}
```

`source` is optional when the host is obvious. Layout notes: [`examples/r2-merge-layout/README.md`](examples/r2-merge-layout/README.md)

Same R2 credentials UI as R2 Library (enter them again on this source — Suwatte stores settings per source). Only folders that contain `chapters.json` show up, so zip titles and merge titles can share a bucket.

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
npm run test:r2-merge
npm run smoke
```

## Install in Suwatte

```sh
npm run serve
```

Or use the published list URL from this branch's `dist/`.
