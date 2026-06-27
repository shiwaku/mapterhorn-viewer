import type { HillshadePaint } from './style';

/** How the DEM (raster-dem) tiles are transported. Maps to the 3 data-source examples. */
export type SourceMode = 'tilejson' | 'zxy' | 'pmtiles';

/** maplibre-gl hillshade methods available in 5.6.0. */
export type HillshadeMethod = 'standard' | 'basic' | 'combined' | 'igor' | 'multidirectional';

/** OpenFreeMap vector base-map styles (free, no API key). */
export type BasemapStyle = 'liberty' | 'bright' | 'positron';

export interface ViewerState {
  source: SourceMode;
  basemap: boolean;
  basemapStyle: BasemapStyle;
  hillshade: boolean;
  hillshadeMethod: HillshadeMethod;
  /** 0–1, bound to `hillshade-exaggeration`. */
  hillshadeExaggeration: number;
  terrain: boolean;
  /** 0–2, bound to the terrain `exaggeration`. */
  terrainExaggeration: number;
  contours: boolean;
}

// --- Endpoints -------------------------------------------------------------

export const TILEJSON_URL = 'https://tiles.mapterhorn.com/tilejson.json';
export const ZXY_TEMPLATE = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const PMTILES_BASE = 'https://download.mapterhorn.com';

/** OpenFreeMap vector style endpoints (OSM-based, free, no key). */
export const BASEMAP_STYLE_URLS: Record<BasemapStyle, string> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
};

export const MAPTERHORN_ATTRIBUTION =
  '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>';

/** Native zoom of the DEM tiles (z13–z17 archives); deeper is overzoomed. */
export const DEM_MAX_ZOOM = 17;

// --- Defaults --------------------------------------------------------------

/** Mt. Fuji — shows dramatic relief the moment the viewer loads. */
export const DEFAULT_VIEW = {
  center: [138.731, 35.33] as [number, number],
  zoom: 11.5,
  pitch: 60,
  bearing: -20,
};

export const DEFAULT_STATE: ViewerState = {
  source: 'tilejson',
  basemap: true,
  basemapStyle: 'liberty',
  hillshade: true,
  hillshadeMethod: 'igor',
  hillshadeExaggeration: 0.2,
  terrain: true,
  terrainExaggeration: 1,
  contours: false,
};

// --- Hillshade presets (values lifted from the official examples) ----------

/**
 * Paint preset per method. The `hillshade-exaggeration` here is the default the
 * UI loads when a method is selected; the slider then overrides it live.
 */
export const HILLSHADE_PRESETS: Record<HillshadeMethod, { exaggeration: number; paint: HillshadePaint }> = {
  // migration / contour example
  igor: {
    exaggeration: 0.2,
    paint: {
      'hillshade-highlight-color': 'rgb(255, 255, 228)',
      'hillshade-shadow-color': 'rgb(114, 124, 131)',
    },
  },
  // pmtiles example — colourful 4-direction illumination
  multidirectional: {
    exaggeration: 0.5,
    paint: {
      'hillshade-highlight-color': ['#FF4000', '#FFFF00', '#40FF00', '#00FF80'],
      'hillshade-shadow-color': ['#00BFFF', '#0000FF', '#BF00FF', '#FF0080'],
      'hillshade-illumination-direction': [270, 315, 0, 45],
      'hillshade-illumination-altitude': [30, 30, 30, 30],
    },
  },
  // terrain example shadow tint
  standard: {
    exaggeration: 0.5,
    paint: {
      'hillshade-shadow-color': '#473B24',
    },
  },
  basic: {
    exaggeration: 0.5,
    paint: {},
  },
  combined: {
    exaggeration: 0.5,
    paint: {},
  },
};
