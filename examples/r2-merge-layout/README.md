# R2 bucket layout for R2 Library (Mihon / TachiManga)

One folder = one library title. Mix any of: image folders, `.cbz`/`.zip`, and chapter URLs in `details.json` (`chapters` array) or a separate `chapters.json`.

```text
Manga/                          # folder name = content id
  details.json                  # optional
  cover.webp                    # optional
  chapters.json                 # optional
  Chapter 001/                  # folder of images
    001.jpg
    002.jpg
  Chapter 002.cbz               # ranged zip — not downloaded whole
```

## chapters.json

Array, or `{ "chapters": [ ... ] }`. Can also live inside `details.json` as `"chapters": [ ... ]` (preferred — one file). Merged with zip/folder chapters already in the series.

Set `"chaptersOverlay": true` on `details.json` (or `"overlay": true` on `chapters.json`) to **replace by number** instead of always appending:

- Series already has folder/cbz chapters 1–5
- JSON `{ "number": 4, "url": "https://…" }` replaces chapter 4
- JSON `{ "number": 6, … }` and `{ "number": 7, … }` append
- A NovelCrow series URL (`https://novelcrow.com/comic/slug/`) or MangaDex title URL (`https://mangadex.org/title/{uuid}/…`) expands to all chapters on that title, then overlay numbers still apply (e.g. add 7–8 from HentaiRead)

```json
{
  "chaptersOverlay": true,
  "chapters": [
    {
      "title": "Chapter 4",
      "number": 4,
      "url": "https://nhentai.net/g/289857/",
      "pageRange": "3-50"
    },
    {
      "title": "Chapter 6",
      "number": 6,
      "url": "https://hitomi.la/galleries/123456.html"
    }
  ]
}
```

```json
{
  "chapters": [
    "https://nhentai.net/g/289857/",
    {
      "title": "Chapter 2",
      "number": 2,
      "url": "https://hitomi.la/galleries/123456.html"
    },
    {
      "title": "Chapter 3",
      "number": 3,
      "url": "https://cdn.example.com/ch3.cbz"
    },
    {
      "title": "Chapter 4",
      "number": 4,
      "pages": ["https://cdn.example.com/4/001.jpg", "https://cdn.example.com/4/002.jpg"]
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `url` / `href` / `link` / `archive` / `file` | Gallery page, remote `.cbz`/`.zip`, or a path relative to the series folder |
| `source` / `site` / `host` | Optional: `nhentai`, `hentairead`, `hentainexus`, `hentai2read`, `pandachaika`, `ehentai`, `hitomi`, `novelcrow`, `mangadex` (aliases: `nh`, `hr`, `hn`, `h2r`, `chaika`, `eh`, `exhentai`, `nc`, `md`). `zip`/`cbz` forces archive handling |
| `id` | Gallery/slug id if you skip the URL (`id` + `source`) |
| `title` / `number` / `date` / `scanlator` | Optional display fields. With overlay, `number` is the replace/append key |
| `chaptersOverlay` / `overlay` | On the file root (not per chapter). `true` = replace matching numbers, append the rest |
| `pages` | Raw image URLs — skips site/archive parsing |
| `pageRange` | Crop the reader. `"50"` = first 50, `"3-50"` = pages 3–50, `"3-"` = 3 through the end. Also `pageStart`/`pageEnd`. Overlay `{ "number": 4, "pageRange": "1-50" }` slices a folder/cbz already numbered 4 |

### Gallery hosts

- `https://nhentai.net/g/<id>/`
- `https://hentairead.com/hentai/<slug>/`
- `https://hentainexus.com/view/<id>` or `/read/<id>`
- `https://hentai2read.com/<slug>/<chapter>/`
- `https://panda.chaika.moe/archive/<id>`
- `https://e-hentai.org/g/<id>/<token>/` (also `exhentai.org`)
- `https://hitomi.la/galleries/<id>.html`
- `https://novelcrow.com/comic/<slug>/` (series — expands to all chapters)
- `https://novelcrow.com/comic/<slug>/<chapter>/` (single chapter)
- `https://mangadex.org/title/<uuid>/` (series — expands; English preferred per chapter number)
- `https://mangadex.org/chapter/<uuid>` (single chapter)

### Archives and folders

- Chapter folders of jpg/png/webp/… (nested `Volume 1/Chapter 003` is fine)
- `.cbz` / `.zip` in the series folder (range requests)
- Remote `url` ending in `.cbz`/`.zip` (host must support `Range`)
- Images dumped in the series folder with no chapter dirs → one chapter
- `.cbr` / `.rar` / `.pdf` are not readable — convert to `.cbz`

`details.json` uses Tachiyomi local-source fields (`title`, `author`, `artist`, `description`, `genre`, `status`, `cover`). `ComicInfo.xml` in the series folder works as a fallback. Default rating is **mature** when omitted.

### Cover

Resolve order:

1. `details.json` → `"cover"`
2. `cover.(png|jpg|jpeg|webp|gif|avif)` in the title folder
3. First page of the first chapter

`cover` values:

```json
"cover": "https://cdn.example.com/front.jpg"
```

```json
"cover": "Chapter 1_1"
```

That is `chapterName_pageIndex` (1-based). `"Chapter 1_1"` uses the first page of the chapter titled `Chapter 1` — folder, `.cbz`, **or** a `chapters.json` gallery URL. Also matches `Chapter 001` / `001 - Chapter 1.cbz`.

Legacy filename form still works: `"chapter 4_24.png"` → page `24.png` inside that chapter.

Relative image keys work too: `"front.webp"` or `"art/cover.jpg"`.
