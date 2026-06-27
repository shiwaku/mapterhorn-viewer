# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A MapLibre GL JS web viewer that overlays several public geospatial datasets on
[Mapterhorn](https://mapterhorn.com/) global terrain tiles:
OpenFreeMap vector base map, hillshade / 3D terrain / contours, USGS earthquakes
+ ShakeMap MMI contours, and WorldPop population grids. Vite + TypeScript, no UI
framework. Deployed to GitHub Pages (`shiwaku/mapterhorn-viewer`) via Actions.

## Commands

```bash
npm install
npm run dev      # vite dev server, http://localhost:5173 (polling watch — see below)
npm run build    # tsc --noEmit (type-check) + vite build
npm run preview  # serve the production build
```

There are no tests or linters. `npm run build` is the gate — it must pass `tsc`.
Deployment is automatic: push to `main` → `.github/workflows/deploy.yml` builds
and publishes to Pages. Live at https://shiwaku.github.io/mapterhorn-viewer/.

## Critical environment note (WSL + /mnt/c)

The repo lives on a Windows drive (`/mnt/c/...`) under WSL2, where inotify file
events do not fire. `vite.config.ts` sets `server.watch.usePolling: true` so HMR
works — **do not remove it**. If a running dev server seems to serve stale code,
it is almost always this: restart `npm run dev` (and verify with
`curl -s http://localhost:5173/src/<file>.ts | grep <new-marker>`).

## Architecture

### Declarative style rebuild
The whole map is driven by a single pure function `buildStyle(state, base, quakes, focus, mmi)`
in `src/style.ts`, which returns a complete MapLibre `StyleSpecification`. On any
UI change, `main.ts` resolves async inputs (base map style, earthquake data) and
calls `map.setStyle(buildStyle(...), { diff: true })`. There is almost no
imperative add/remove of layers — to change rendering, change `ViewerState`
(`src/config.ts`) and what `buildStyle` emits for it.

When the base map is on, `buildStyle` deep-clones the fetched OpenFreeMap style
and **inserts hillshade/population/contour layers below the first `symbol` layer**
so base-map labels stay on top; earthquake/MMI/focus layers go on top of
everything.

### Custom protocols (registered once in `main.ts` before the map is created)
- `mapterhorn://` (`src/demSource.ts`) — routes DEM tiles to Mapterhorn PMTiles
  archives (`planet` / `6-x-y`) via the `pmtiles` lib. Used by the "PMTiles"
  data-source mode.
- maplibre-contour `DemSource` (`src/demSource.ts`) — supplies the `sharedDem`
  protocol + contour vector tiles. It fetches DEM over plain HTTP itself, so
  **contours always read the zxy endpoint** regardless of the selected source mode.
- `wppop://` (`src/population.ts`) — fetches value-encoded population PNG tiles
  from an external PMTiles archive and **recolours them client-side**.

### Data-source modes (hillshade / 3D terrain transport)
`demSourceSpec(mode)` in `src/demSource.ts` emits the raster-dem source for
`tilejson` | `zxy` | `pmtiles`. Hillshade and terrain use **separate** DEM
sources (`dem-hillshade`, `dem-terrain`) per MapLibre's recommendation.

### USGS earthquakes (`src/earthquakes.ts`)
- `loadEarthquakes(feed)` — GeoJSON summary feed; depth copied into properties
  for data-driven colour.
- `loadEvent(idOrUrl)` — single event (accepts id, eventpage short id, or URL).
  Returns `{ marker, mmi, center, bbox }`; pulls the ShakeMap `cont_mmi.json`
  contours from the event's products and adds roman-numeral labels.
- `main.ts` writes the focused event id to `?event=<id>` (history.replaceState)
  so links are shareable; `?event=` on load auto-focuses.

### WorldPop "numeric PNG tiles" (`src/population.ts`)
The key non-obvious pattern. Population is stored as value-encoded PNG tiles:
each pixel = `N = round(people * 10)` split across RGB (`R*65536 + G*256 + B`),
alpha 0 for nodata. The client decodes (`pop = N / 10`) and applies a colour
ramp (`STOPS`); a map click reads the value at a point via `getPopulationAt()`.
- Tiles are **hosted externally** (rental server), not in the repo — set
  `POPULATION_PMTILES_URL` in `src/config.ts`, override at runtime with `?pop=<url>`.
- The host **must send CORS and support HTTP Range** (PMTiles range reads).
- `WPPOP_MAXZOOM` and `STOPS` must match the dataset (currently global 1 km, z7).

### Tile generation pipeline (GDAL → PMTiles)
Documented in `README.md` ("人口グリッドの配信"). When (re)generating value tiles,
**resampling must be `near`** at every step (`gdalwarp -r near`,
`gdaladdo -r nearest`) — averaging blends the encoded RGB and corrupts the values.

## Conventions
- Pinned versions intentionally: maplibre-gl 5.6.0, maplibre-contour 0.0.5,
  pmtiles 4.3.0 (match the official Mapterhorn examples). Vite 8 / TypeScript 6.
- `tsconfig` is strict with `noUnusedLocals`/`noUnusedParameters`.
- `*.pmtiles` is gitignored — generated data files are delivered/hosted, never committed.
- Default view is Mt. Fuji; map position is stored in the URL hash.
- Attribution lives on each source's `attribution` field (shown in MapLibre's control).
