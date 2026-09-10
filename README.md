# R2 Library

Mihon / TachiManga / Tachiyomi extension. Reads a Cloudflare R2 bucket.

Package: `eu.kanade.tachiyomi.extension.all.r2merge` (in-place update of R2 Merge — credentials persist).

Lib **1.4**, `1.4.6`. NSFW.

## Bucket layout

Each folder under the root prefix is a title. Mix any of: image folders, `.cbz`/`.zip`, and `chapters.json`.

```text
<title-id>/
  details.json          # optional (or ComicInfo.xml)
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
    { "title": "Ch 3", "number": 3, "url": "Chapter 003.cbz" },
    { "title": "Ch 4", "number": 4, "pages": ["https://cdn.example.com/4/001.jpg"] }
  ]
}
```

Bucket zip/folder chapters are picked up automatically. `chapters.json` is merged on top (gallery hosts, relative/remote archives, or `pages`). Relative paths resolve against the series folder.

Gallery hosts: nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, Hitomi.

`details.json` `"cover"`: `https://…`, `"Chapter 1_1"` (chapter + 1-based page), `"chapter 4_24.png"`, or a relative image.

`.cbr` / `.rar` / `.pdf` are not readable.

Layout notes: [`examples/r2-merge-layout/README.md`](examples/r2-merge-layout/README.md)

## Install

TachiManga wants **index.pb**:

```
https://github.com/raahat-hossain/extensions/raw/cursor/r2-merge-extension-8f4a/repo/index.pb
```

Sideload: [`repo/apk/tachiyomi-all.r2merge-v1.4.6.apk`](repo/apk/tachiyomi-all.r2merge-v1.4.6.apk)

Settings: Account ID, Access Key, Secret, Bucket. Root Prefix empty if titles sit at bucket root. Optional public image URL (r2.dev / custom domain).

## Build

Needs Android SDK 37 + a Yūzōnō checkout (`.ref/yuzono` or `YUZONO_DIR`).

```sh
bash scripts/build-r2-merge-apk.sh
```
