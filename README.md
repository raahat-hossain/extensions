# Suwatte Extensions

Dev catalog for [Suwatte](https://suwatte.mantton.com/developers/introduction/) source plugins.

## Static Demo (`en.static-demo`)

Minimal end-to-end source with **two static titles**, **one chapter each**, **two pages each**, and rich metadata filled in (summary, credits, genres, properties, characters, links, endpoints, stats, artworks, etc.).

| ID | Title | Type | Status | Pages |
| --- | --- | --- | --- | --- |
| `static-signal` | The Static Signal | Manga (RTL) | Completed | 2 |
| `harbor-lights` | Harbor Lights | Manhwa (vertical) | Ongoing | 2 |

Also wires homepage feeds, custom feeds, sort options, and search filters so the toolchain/app path is exercised beyond bare search → content → chapters.

## Setup

```sh
npm install
npm run build
```

## Device test

```sh
npm run serve
```

Then in Suwatte: **Settings → Sources → Manage Sources** → add the printed LAN URL → install **Static Demo**.

## Local smoke

```sh
npm run smoke
```

Runs the source through `@suwatte/toolchain/emulator` without the app.
