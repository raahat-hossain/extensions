# Extensions

Dev catalog for **Suwatte** sources, plus a **Mihon / TachiManga** APK for merged R2 series.

Parsers follow **Yūzōnō** cursed-manga-extensions first, then **Keiyoushi**.

## R2 Merge — Mihon / TachiManga (`eu.kanade.tachiyomi.extension.all.r2merge`)

This is **not** a Suwatte `.stt`. TachiManga installs the APK (lib **1.4**).

One library title. Chapters are live gallery/reader URLs from nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, and Hitomi.

```text
<title-id>/
  details.json      # optional
  cover.webp        # optional custom cover
  chapters.json     # required
```

```json
{
  "chapters": [
    { "title": "Ch 1", "number": 1, "url": "https://nhentai.net/g/289857/" },
    { "title": "Ch 2", "number": 2, "url": "https://hentairead.com/hentai/some-slug/" },
    { "title": "Ch 3", "number": 3, "id": "21161", "source": "hentainexus" },
    { "title": "Ch 4", "number": 4, "url": "https://panda.chaika.moe/archive/12345" },
    { "title": "Ch 5", "number": 5, "url": "https://e-hentai.org/g/1503549/c16349ed0a/" },
    { "title": "Ch 6", "number": 6, "url": "https://hitomi.la/galleries/123456.html" }
  ]
}
```

`source` is optional when the host is obvious. Aliases: `nh` / `hr` / `hn` / `h2r` / `chaika` / `eh` / `exhentai` / `hitomi`. Bare URL strings work. `pages: ["https://…"]` skips site parsing. Same R2 bucket as R2 Library is fine — this source only lists folders that contain `chapters.json`.

Layout notes: [`examples/r2-merge-layout/README.md`](examples/r2-merge-layout/README.md)

### Install

TachiManga wants the same **`index.pb`** URL shape as Yūzōnō (not `index.min.json`). Delete the broken `repo/index.pb` row first, then add:

```
https://github.com/raahat-hossain/extensions/raw/cursor/r2-merge-extension-8f4a/repo/index.pb
```

APK sideload still works: Browser → Extensions → `+` → `repo/apk/tachiyomi-all.r2merge-v1.4.2.apk`

Source settings: Cloudflare account id, R2 access key, secret, bucket. Leave **Root Prefix** empty if title folders sit at bucket root.

### Build APK

Needs Android SDK 37 + a Yūzōnō checkout (`.ref/yuzono` or `YUZONO_DIR`).

```sh
bash scripts/build-r2-merge-apk.sh
```

## R2 Library (`en.r2-library`) — Suwatte

Reads a private Cloudflare R2 bucket (zip/cbz chapters).

**Root Prefix**

- Leave **empty** when title folders live at the **bucket root** (common when the bucket itself is named `manga`).
- Set to `manga` only if objects are under `manga/<title-id>/…` inside the bucket.

```text
<title-id>/
  details.json
  cover.webp
  chapter 1.cbz | .zip
```

Configure credentials in Suwatte → source settings.

## Setup (Suwatte sources)

```sh
npm install
npm run build
npm run test:r2
npm run smoke
```

```sh
npm run serve
```
