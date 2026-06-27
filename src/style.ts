import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { demSourceSpec, contourSourceSpec } from './demSource';
import { HILLSHADE_PRESETS, type ViewerState } from './config';

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

/**
 * Build a complete MapLibre style from the viewer state. Pure function.
 *
 * When the base map is enabled, `base` (a fetched OpenFreeMap vector style) is
 * cloned and our DEM-derived layers are merged into it — hillshade is inserted
 * just below the base map's first label so terrain shading sits under text.
 * When disabled, our layers render on a blank style.
 */
export function buildStyle(state: ViewerState, base?: StyleSpecification): StyleSpecification {
  // --- Base map ON: merge into the vector style ------------------------------
  if (state.basemap && base) {
    const style: StyleSpecification = structuredClone(base);

    if (state.hillshade) style.sources[DEM_HILLSHADE] = demSourceSpec(state.source);
    if (state.terrain) style.sources[DEM_TERRAIN] = demSourceSpec(state.source);

    const inject: LayerSpecification[] = [];
    if (state.hillshade) inject.push(hillshadeLayer(state));
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
    return style;
  }

  // --- Base map OFF: blank style with just our layers ------------------------
  const sources: StyleSpecification['sources'] = {};
  const layers: LayerSpecification[] = [];

  if (state.hillshade) sources[DEM_HILLSHADE] = demSourceSpec(state.source);
  if (state.terrain) sources[DEM_TERRAIN] = demSourceSpec(state.source);
  if (state.hillshade) layers.push(hillshadeLayer(state));
  if (state.contours) {
    sources.contours = contourSourceSpec();
    layers.push(...contourLayers());
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
