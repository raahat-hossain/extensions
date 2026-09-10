# Extensions

Archive branch with the **Suwatte** sources (frozen before this repo was stripped to R2 Library-only).

Suwatte list URL (paste this, not `runners.json`):

```
https://raahat-hossain.github.io/extensions/suwatte
```

Open that in Safari → **Add To Suwatte**. In-app “add list” uses the same directory URL. A `runners.json` raw GitHub link 404s — Suwatte then requests `{url}/runners.json`.

Dev catalog for **Suwatte** sources, plus a **Mihon / TachiManga** APK: **R2 Library**.

Parsers follow **Yūzōnō** cursed-manga-extensions first, then **Keiyoushi**. The R2 zip/folder reader is the MNG Collection layout.

## R2 Library — Mihon / TachiManga (`eu.kanade.tachiyomi.extension.all.r2merge`)

One source. Same R2 credentials as before. Display name is **R2 Library** (in-place update of R2 Merge, lib **1.4**, `1.4.3`).

Each folder under the root prefix is a title. Chapters can be mixed in the same series:

```text
<title-id>/
  details.json          # optional
  cover.webp            # optional
  chapters.json         # optional — gallery URLs, remote .cbz, or page lists
  Chapter 001/          # folder of images
    001.jpg
    002.jpg
  Chapter 002.cbz       # zip/cbz, ranged (not downloaded whole)
```

```json
{
  "chapters": [
    { "title": "Ch 1", "number": 1, "url": "https://nhentai.net/g/289857/" },
    { "title": "Ch 2", "number": 2, "url": "https://hitomi.la/galleries/123456.html" },
    { "title": "Ch 3", "number": 3, "url": "https://cdn.example.com/ch3.cbz" },
    { "title": "Ch 4", "number": 4, "pages": ["https://cdn.example.com/4/001.jpg"] }
  ]
}
```

Bucket zip/folder chapters are picked up automatically. `chapters.json` is merged on top (gallery hosts, remote archives, or `pages`).

Gallery hosts: nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, Hitomi.

Layout notes: [`examples/r2-merge-layout/README.md`](examples/r2-merge-layout/README.md)

### Install

```
https://github.com/raahat-hossain/extensions/raw/cursor/suwatte-extensions-8f4a/repo/index.pb
```

Sideload: `repo/apk/tachiyomi-all.r2merge-v1.4.3.apk`

Settings: Account ID, Access Key, Secret, Bucket. Root Prefix empty if titles sit at bucket root. Optional public image URL (r2.dev / custom domain).

### Build APK

Needs Android SDK 37 + a Yūzōnō checkout (`.ref/yuzono` or `YUZONO_DIR`).

```sh
bash scripts/build-r2-merge-apk.sh
```

## R2 Library (`en.r2-library`) — Suwatte

v1.8 — same layout as the Mihon extension: mix folder/.cbz chapters with gallery URLs in `details.json` `chapters[]` (or `chapters.json`). `details.cover` wins over `cover.webp` (absolute / `Chapter 1_1` / relative image). Gallery hosts: nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, Hitomi.

Suwatte `.stt` is separate from the TachiManga APK. After building, copy `dist/` to Pages at `/suwatte`.

## Setup (Suwatte sources)

```sh
npm install
npm run build
npm run test:r2
npm run smoke
```
