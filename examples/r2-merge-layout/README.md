# R2 bucket layout for the R2 Merge Mihon / TachiManga extension

One folder = one library title. Chapters are **remote gallery/reader URLs** (nhentai, HentaiRead, HentaiNexus, Hentai2Read), not zip files.

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
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `url` / `href` / `link` | Gallery or reader page. Host is enough to pick a parser. |
| `source` / `site` / `host` | Optional override: `nhentai`, `hentairead`, `hentainexus`, `hentai2read` (aliases: `nh`, `hr`, `hn`, `h2r`) |
| `id` | Gallery/slug id if you skip the URL (`id` + `source`) |
| `title` / `number` / `volume` / `date` / `language` / `scanlator` | Optional display fields |
| `pages` | Optional raw image URLs — skips site parsing for that chapter |

Paste the **gallery/chapter page** URL, not an individual image.

Supported hosts (Yūzōnō nhentai API v2, then Keiyoushi HentaiRead / HentaiNexus parsers):

- `https://nhentai.net/g/<id>/`
- `https://hentairead.com/hentai/<slug>/`
- `https://hentainexus.com/view/<id>` or `/read/<id>`
- `https://hentai2read.com/<slug>/<chapter>/`

`details.json` uses the same fields as R2 Library. Default rating is **mature** when omitted.
