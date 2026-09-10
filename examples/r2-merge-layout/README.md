# R2 bucket layout for the R2 Merge Mihon / TachiManga extension

One folder = one library title. Chapters are **remote gallery/reader URLs** (nhentai, HentaiRead, HentaiNexus, Hentai2Read, PandaChaika, E-Hentai, Hitomi), not zip files.

```text
Manga/                          # folder name = content id
  details.json                  # optional metadata (same shape as R2 Library)
  cover.webp                    # custom cover
  chapters.json                 # required
```

## chapters.json

Array, or `{ "chapters": [ ... ] }`. Each entry is a URL string or an object:

```json
{
  "chapters": [
    "https://nhentai.net/g/289857/",
    {
      "title": "Chapter 2",
      "number": 2,
      "url": "https://hentairead.com/hentai/some-slug/",
      "source": "hentairead"
    },
    {
      "title": "Chapter 3",
      "number": 3,
      "id": "21161",
      "source": "hentainexus"
    },
    {
      "title": "Chapter 4",
      "number": 4,
      "url": "https://panda.chaika.moe/archive/12345",
      "source": "pandachaika"
    },
    {
      "title": "Chapter 5",
      "number": 5,
      "url": "https://e-hentai.org/g/1503549/c16349ed0a/"
    },
    {
      "title": "Chapter 6",
      "number": 6,
      "url": "https://hitomi.la/galleries/123456.html"
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `url` / `href` / `link` | Gallery or reader page. Host is enough to pick a parser. |
| `source` / `site` / `host` | Optional override: `nhentai`, `hentairead`, `hentainexus`, `hentai2read`, `pandachaika`, `ehentai`, `hitomi` (aliases: `nh`, `hr`, `hn`, `h2r`, `chaika`, `eh`, `exhentai`) |
| `id` | Gallery/slug id if you skip the URL (`id` + `source`) |
| `title` / `number` / `volume` / `date` / `language` / `scanlator` | Optional display fields |
| `pages` | Optional raw image URLs — skips site parsing for that chapter |

Paste the **gallery/chapter page** URL, not an individual image.

Supported hosts (Yūzōnō nhentai API v2 / E-Hentai / Hitomi, then Keiyoushi HentaiRead / HentaiNexus / PandaChaika):

- `https://nhentai.net/g/<id>/`
- `https://hentairead.com/hentai/<slug>/`
- `https://hentainexus.com/view/<id>` or `/read/<id>`
- `https://hentai2read.com/<slug>/<chapter>/`
- `https://panda.chaika.moe/archive/<id>`
- `https://e-hentai.org/g/<id>/<token>/` (also `exhentai.org`)
- `https://hitomi.la/galleries/<id>.html`

`details.json` uses the same fields as R2 Library. Default rating is **mature** when omitted.
