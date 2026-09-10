# R2 Merge — Mihon / TachiManga / Tachiyomi extension

Kotlin `HttpSource` (lib **1.4**). Not a Suwatte `.stt`.

One library title. Chapters are gallery/reader URLs from nhentai, HentaiRead, HentaiNexus, Hentai2Read.

Parsers: Yūzōnō nHentai API v2, then Keiyoushi HentaiRead / HentaiNexus.

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
    { "title": "Ch 3", "number": 3, "id": "21161", "source": "hentainexus" }
  ]
}
```

`source` is optional when the host is obvious.

## Install

Repo URL (same shape as Yūzōnō — must end in `index.pb`):

```
https://github.com/raahat-hossain/extensions/raw/cursor/r2-merge-extension-8f4a/repo/index.pb
```

Or sideload `repo/apk/tachiyomi-all.r2merge-v1.4.1.apk`. Then source settings: account id / access key / secret / bucket.

## Build

Needs Android SDK 37 (`platforms;android-37` or a symlink from `android-37.0`).

```sh
bash scripts/build-r2-merge-apk.sh
```

APK lands in `repo/apk/`. Gradle host is Yūzōnō (`YUZONO_DIR`, default `.ref/yuzono`).
