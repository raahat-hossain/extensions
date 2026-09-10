# R2 bucket layout for R2 Library (Mihon / TachiManga)

One folder = one library title. Mix any of: image folders, `.cbz`/`.zip`, and `chapters.json` (gallery URLs, remote archives, or page lists).

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

Array, or `{ "chapters": [ ... ] }`. Each entry is a URL string or an object. Merged with zip/folder chapters already in the series.

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
| `source` / `site` / `host` | Optional: `nhentai`, `hentairead`, `hentainexus`, `hentai2read`, `pandachaika`, `ehentai`, `hitomi` (aliases: `nh`, `hr`, `hn`, `h2r`, `chaika`, `eh`, `exhentai`). `zip`/`cbz` forces archive handling |
| `id` | Gallery/slug id if you skip the URL (`id` + `source`) |
| `title` / `number` / `date` / `scanlator` | Optional display fields |
| `pages` | Raw image URLs — skips site/archive parsing |

### Gallery hosts

- `https://nhentai.net/g/<id>/`
- `https://hentairead.com/hentai/<slug>/`
- `https://hentainexus.com/view/<id>` or `/read/<id>`
- `https://hentai2read.com/<slug>/<chapter>/`
- `https://panda.chaika.moe/archive/<id>`
- `https://e-hentai.org/g/<id>/<token>/` (also `exhentai.org`)
- `https://hitomi.la/galleries/<id>.html`

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

That is `chapterName_pageIndex` (1-based). `"Chapter 1_1"` opens the chapter folder/archive named `Chapter 1` (also matches `Chapter 001` / `001 - Chapter 1.cbz`) and uses the first image.

Legacy filename form still works: `"chapter 4_24.png"` → page `24.png` inside that chapter.

Relative image keys work too: `"front.webp"` or `"art/cover.jpg"`.
