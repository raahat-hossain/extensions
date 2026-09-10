# R2 Merge — Mihon / TachiManga / Tachiyomi extension

Kotlin `HttpSource` (lib **1.4**). Not a Suwatte `.stt`.

One library title. Chapters are gallery/reader URLs from nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai / ExHentai, and Hitomi.

Parsers: Yūzōnō nHentai API v2 + E-Hentai / Hitomi, then Keiyoushi HentaiRead / HentaiNexus / PandaChaika.

## R2 layout

```text
<title-id>/
  details.json      # optional
  cover.webp        # optional custom cover
  chapters.json     # required
```

`chapters.json`:

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

`source` is optional when the host is obvious.

## Install

Repo URL (same shape as Yūzōnō — must end in `index.pb`):

```
https://github.com/raahat-hossain/extensions/raw/cursor/r2-merge-extension-8f4a/repo/index.pb
```

Or sideload `repo/apk/tachiyomi-all.r2merge-v1.4.2.apk`. Then source settings: account id / access key / secret / bucket.

## Build

Needs Android SDK 37 (`platforms;android-37` or a symlink from `android-37.0`).

```sh
bash scripts/build-r2-merge-apk.sh
```

APK lands in `repo/apk/`. Gradle host is Yūzōnō (`YUZONO_DIR`, default `.ref/yuzono`).
