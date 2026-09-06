# R2 bucket layout for the R2 Library source

```text
manga/
  the-static-signal/
    details.json          # metadata (see example)
    cover.webp            # optional if details.cover is set
    chapter 1.cbz
    chapter 4.cbz         # zip/cbz chapter archives
  harbor-lights/
    details.json
    cover.jpg
    001 - Dock 14.cbz
```

## Rules

- Root prefix defaults to `manga/` (override in source settings).
- Each **folder** under that prefix is one title. Folder name = content id.
- Chapter files are `.cbz` or `.zip`. Sorted naturally by filename. Numbers in the filename become chapter numbers.
- Archives must contain image pages (jpg/png/webp/…). Nested folders are fine; `__MACOSX` / dotfiles are skipped.

## Cover

Resolve order:

1. `cover.(png|jpg|jpeg|webp|gif|avif)` in the title folder
2. `details.json` → `"cover": "https://…"` absolute URL
3. `details.json` → chapter page ref: `"[chapter name]_[page name]"`

Chapter page ref example:

```json
"cover": "chapter 4_24.png"
```

That means: open the archive whose name is `chapter 4` (`chapter 4.cbz` / `chapter 4.zip`, or `004 - chapter 4.cbz`), then use page `24.png` inside it as the cover.

## Config in Suwatte

Source settings → **R2 Library**:

| Field | Notes |
| --- | --- |
| Account ID | Cloudflare account id |
| Access Key ID | R2 API token access key |
| Secret Access Key | R2 API token secret |
| Bucket | Bucket name |
| S3 Endpoint | Optional. Blank → `https://<accountId>.r2.cloudflarestorage.com` |
| Root Prefix | Default `manga` |

Token needs **Object Read** (List + Get).
