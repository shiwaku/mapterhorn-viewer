import maplibregl from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';

import { DEFAULT_STATE, DEFAULT_VIEW, type ViewerState } from './config';
import { registerProtocols } from './demSource';
import { loadBasemapStyle } from './basemap';
import { buildStyle } from './style';
import { ControlPanel } from './ui/ControlPanel';

// Register PMTiles routing + maplibre-contour DEM decoder before the map starts.
registerProtocols(maplibregl);

/** Resolve the vector base style for a state (or undefined when the base map is off). */
async function baseFor(state: ViewerState): Promise<StyleSpecification | undefined> {
  return state.basemap ? loadBasemapStyle(state.basemapStyle) : undefined;
}

async function init(): Promise<void> {
  // Resolve the real style up front so the map's first render is the final one
  // (no placeholder → diff churn, no aborted sprite request).
  const base = await baseFor(DEFAULT_STATE);

  const map: MlMap = new maplibregl.Map({
    container: 'map',
    hash: true,
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
    maxPitch: 85,
    style: buildStyle(DEFAULT_STATE, base),
  });

  // Controls go on the right — the control panel owns the left edge.
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  const applyState = async (state: ViewerState): Promise<void> => {
    try {
      const next = await baseFor(state);
      map.setStyle(buildStyle(state, next), { diff: true });
    } catch (err) {
      console.error(err);
    }
  };

  const panelEl = document.getElementById('panel');
  if (!panelEl) throw new Error('#panel element missing');

  new ControlPanel(panelEl, DEFAULT_STATE, (state) => void applyState(state));
}

void init();
