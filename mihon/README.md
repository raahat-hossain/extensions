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

1. **TachiManga:** Browser → Extensions → `+` → `repo/apk/tachiyomi-all.r2merge-v1.4.1.apk`
2. **Repo URL:** `…/repo/index.min.json` on this branch
3. Source settings: Cloudflare account id, R2 access key, secret, bucket, optional endpoint/prefix

## Build

Needs Android SDK 37 (`platforms;android-37` or a symlink from `android-37.0`).

```sh
bash scripts/build-r2-merge-apk.sh
```

APK lands in `repo/apk/`. Gradle host is Yūzōnō (`YUZONO_DIR`, default `.ref/yuzono`).
