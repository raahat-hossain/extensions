# R2 Library

Mihon / TachiManga / Tachiyomi extension. Reads a Cloudflare R2 bucket.

Package: `eu.kanade.tachiyomi.extension.all.r2merge` (in-place update of R2 Merge — credentials persist).

Lib **1.4**, `1.4.7`. NSFW.

## Bucket layout

Each folder under the root prefix is a title. Mix any of: image folders, `.cbz`/`.zip`, and chapter URLs in `details.json` (or a separate `chapters.json`).

```text
<title-id>/
  details.json          # metadata + optional chapters[]
  cover.webp            # optional
  Chapter 001/          # folder of images
  Chapter 002.cbz       # zip/cbz, ranged (not downloaded whole)
```

Generator (details + chapters): [`web/index.html`](web/index.html)

On iPhone, open:

```
https://cdn.jsdelivr.net/gh/raahat-hossain/extensions@cursor/r2-merge-extension-8f4a/web/index.html
```

```json
{
  "title": "Example",
  "author": "Hyji",
  "status": "completed",
  "cover": "Chapter 1_1",
  "chapters": [
    { "title": "Chapter 1", "number": 1, "url": "https://nhentai.net/g/289857/" },
    { "title": "Chapter 2", "number": 2, "url": "https://hitomi.la/galleries/123456.html" },
    { "title": "Chapter 3", "number": 3, "url": "Chapter 003.cbz" }
  ]
}
```

Bucket zip/folder chapters are picked up automatically. Gallery URLs can live in `details.json` → `chapters` (preferred) or a separate `chapters.json`. Both are merged.

Gallery hosts: nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, Hitomi.

`details.json` `"cover"`: `https://…`, `"Chapter 1_1"` (chapter + 1-based page), `"chapter 4_24.png"`, or a relative image.

`.cbr` / `.rar` / `.pdf` are not readable.

Layout notes: [`examples/r2-merge-layout/README.md`](examples/r2-merge-layout/README.md)

## Install

TachiManga wants **index.pb**:

```
https://github.com/raahat-hossain/extensions/raw/cursor/r2-merge-extension-8f4a/repo/index.pb
```

Sideload: [`repo/apk/tachiyomi-all.r2merge-v1.4.7.apk`](repo/apk/tachiyomi-all.r2merge-v1.4.7.apk)

Settings: Account ID, Access Key, Secret, Bucket. Root Prefix empty if titles sit at bucket root. Optional public image URL (r2.dev / custom domain).

## Build

Needs Android SDK 37 + a Yūzōnō checkout (`.ref/yuzono` or `YUZONO_DIR`).

```sh
bash scripts/build-r2-merge-apk.sh
```
