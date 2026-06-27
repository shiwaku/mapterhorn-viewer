import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { demSourceSpec, contourSourceSpec } from './demSource';
import { HILLSHADE_PRESETS, USGS_ATTRIBUTION, type ViewerState } from './config';
import type { QuakeData, GeoJsonFC } from './earthquakes';
import { WPPOP_MAXZOOM } from './population';

const WORLDPOP_ATTRIBUTION = '<a href="https://www.worldpop.org/">© WorldPop</a>';

/** Loosely-typed hillshade paint bag (the multidirectional arrays aren't in the 5.6 paint types). */
export type HillshadePaint = Record<string, unknown>;

const DEMO_GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

// MapLibre recommends separate sources for hillshade vs. 3D terrain.
const DEM_HILLSHADE = 'dem-hillshade';
const DEM_TERRAIN = 'dem-terrain';

function hillshadeLayer(state: ViewerState): LayerSpecification {
  const preset = HILLSHADE_PRESETS[state.hillshadeMethod];
  return {
    id: 'hillshade',
    type: 'hillshade',
    source: DEM_HILLSHADE,
    paint: {
      'hillshade-method': state.hillshadeMethod,
      'hillshade-exaggeration': state.hillshadeExaggeration,
      ...preset.paint,
    },
  } as unknown as LayerSpecification;
}

function contourLayers(): LayerSpecification[] {
  return [
    {
      id: 'contour-lines',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      paint: {
        'line-color': 'rgb(215, 151, 60)',
        'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
      },
    } as LayerSpecification,
    {
      id: 'contour-text',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      paint: {
        'text-color': 'rgb(172, 120, 48)',
        'text-halo-color': 'white',
        'text-halo-width': 2,
      },
      layout: {
        'symbol-placement': 'line',
        'text-size': 14,
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], 'm'],
        'text-font': ['Noto Sans Regular'],
      },
    } as LayerSpecification,
  ];
}

/** USGS earthquakes: size by magnitude, colour by depth (km) — shallow red → deep blue. */
function earthquakeLayer(): LayerSpecification {
  return {
    id: 'earthquakes',
    type: 'circle',
    source: 'earthquakes',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['coalesce', ['get', 'mag'], 1],
        2, 3, 4, 6, 5, 10, 6, 15, 7, 22, 8, 32,
      ],
      'circle-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'depth'], 0],
        0, '#d73027', 70, '#fc8d59', 150, '#fee090', 300, '#91bfdb', 700, '#4575b4',
      ],
      'circle-opacity': 0.78,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(20,20,20,0.55)',
    },
  } as unknown as LayerSpecification;
}

/** ShakeMap MMI contours: lines coloured by the feed's own `color`, with roman labels. */
function mmiLayers(): LayerSpecification[] {
  return [
    {
      id: 'shakemap-mmi-lines',
      type: 'line',
      source: 'shakemap-mmi',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'weight'], 4], 2.6, 1.4],
        'line-opacity': 0.9,
      },
    } as unknown as LayerSpecification,
    {
      id: 'shakemap-mmi-labels',
      type: 'symbol',
      source: 'shakemap-mmi',
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'label'],
        'text-size': 13,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': '#1a1a1a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    } as unknown as LayerSpecification,
  ];
}

/** WorldPop population raster (decoded + coloured client-side via the wppop:// protocol). */
function populationSource(): Record<string, unknown> {
  return {
    type: 'raster',
    tiles: ['wppop://{z}/{x}/{y}'],
    tileSize: 256,
    maxzoom: WPPOP_MAXZOOM,
    attribution: WORLDPOP_ATTRIBUTION,
  };
}
function populationLayer(opacity: number): LayerSpecification {
  return {
    id: 'population',
    type: 'raster',
    source: 'population',
    paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest' },
  } as unknown as LayerSpecification;
}

/** Highlight ring + dot for a single focused event. */
function focusLayers(): LayerSpecification[] {
  return [
    {
      id: 'quake-focus-halo',
      type: 'circle',
      source: 'quake-focus',
      paint: {
        'circle-radius': 24,
        'circle-color': 'rgba(255,59,48,0.16)',
        'circle-stroke-color': '#ff3b30',
        'circle-stroke-width': 2.5,
      },
    } as unknown as LayerSpecification,
    {
      id: 'quake-focus-dot',
      type: 'circle',
      source: 'quake-focus',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ff3b30',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    } as unknown as LayerSpecification,
  ];
}

/**
 * Build a complete MapLibre style from the viewer state. Pure function.
 *
 * When the base map is enabled, `base` (a fetched OpenFreeMap vector style) is
 * cloned and our DEM-derived layers are merged into it — hillshade is inserted
 * just below the base map's first label so terrain shading sits under text.
 * When disabled, our layers render on a blank style.
 */
export function buildStyle(
  state: ViewerState,
  base?: StyleSpecification,
  quakes?: QuakeData,
  focus?: QuakeData,
  mmi?: GeoJsonFC,
): StyleSpecification {
  // --- Base map ON: merge into the vector style ------------------------------
  if (state.basemap && base) {
    const style: StyleSpecification = structuredClone(base);

    if (state.hillshade) style.sources[DEM_HILLSHADE] = demSourceSpec(state.source);
    if (state.terrain) style.sources[DEM_TERRAIN] = demSourceSpec(state.source);

    const inject: LayerSpecification[] = [];
    if (state.hillshade) inject.push(hillshadeLayer(state));
    if (state.population) {
      style.sources.population = populationSource() as never;
      inject.push(populationLayer(state.populationOpacity));
    }
    if (state.contours) {
      style.sources.contours = contourSourceSpec();
      inject.push(...contourLayers());
    }

    // Insert below the first symbol (label) layer so base-map text stays on top.
    const firstSymbol = style.layers.findIndex((l) => l.type === 'symbol');
    const at = firstSymbol === -1 ? style.layers.length : firstSymbol;
    style.layers.splice(at, 0, ...inject);

    if (state.terrain) {
      style.terrain = { source: DEM_TERRAIN, exaggeration: state.terrainExaggeration };
      style.sky = {};
    }
    // Earthquakes sit on top of everything (including labels).
    if (state.earthquakes && quakes) {
      style.sources.earthquakes = { type: 'geojson', data: quakes as never, attribution: USGS_ATTRIBUTION };
      style.layers.push(earthquakeLayer());
    }
    if (state.shakemap && mmi) {
      style.sources['shakemap-mmi'] = { type: 'geojson', data: mmi as never, attribution: USGS_ATTRIBUTION };
      style.layers.push(...mmiLayers());
    }
    if (focus) {
      style.sources['quake-focus'] = { type: 'geojson', data: focus as never, attribution: USGS_ATTRIBUTION };
      style.layers.push(...focusLayers());
    }
    return style;
  }

  // --- Base map OFF: blank style with just our layers ------------------------
  const sources: StyleSpecification['sources'] = {};
  const layers: LayerSpecification[] = [];

  if (state.hillshade) sources[DEM_HILLSHADE] = demSourceSpec(state.source);
  if (state.terrain) sources[DEM_TERRAIN] = demSourceSpec(state.source);
  if (state.hillshade) layers.push(hillshadeLayer(state));
  if (state.population) {
    sources.population = populationSource() as never;
    layers.push(populationLayer(state.populationOpacity));
  }
  if (state.contours) {
    sources.contours = contourSourceSpec();
    layers.push(...contourLayers());
  }
  if (state.earthquakes && quakes) {
    sources.earthquakes = { type: 'geojson', data: quakes as never, attribution: USGS_ATTRIBUTION };
    layers.push(earthquakeLayer());
  }
  if (state.shakemap && mmi) {
    sources['shakemap-mmi'] = { type: 'geojson', data: mmi as never, attribution: USGS_ATTRIBUTION };
    layers.push(...mmiLayers());
  }
  if (focus) {
    sources['quake-focus'] = { type: 'geojson', data: focus as never, attribution: USGS_ATTRIBUTION };
    layers.push(...focusLayers());
  }

  const style: StyleSpecification = {
    version: 8,
    glyphs: DEMO_GLYPHS,
    sources,
    layers,
  };
  if (state.terrain) {
    style.terrain = { source: DEM_TERRAIN, exaggeration: state.terrainExaggeration };
    style.sky = {};
  }
  return style;
}
