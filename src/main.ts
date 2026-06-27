import maplibregl from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';

import { DEFAULT_STATE, DEFAULT_VIEW, POPULATION_PMTILES_URL, type ViewerState } from './config';
import { registerProtocols } from './demSource';
import { registerPopulation, getPopulationAt } from './population';
import { loadBasemapStyle } from './basemap';
import { loadEarthquakes, loadEvent, type QuakeData, type GeoJsonFC } from './earthquakes';
import { buildStyle } from './style';
import { ControlPanel } from './ui/ControlPanel';

// Register PMTiles routing + maplibre-contour DEM decoder before the map starts.
registerProtocols(maplibregl);

// WorldPop population: numeric PNG tiles served from an external PMTiles
// archive (rental server). `?pop=<url>` overrides the configured default.
const POPULATION_PMTILES =
  new URLSearchParams(window.location.search).get('pop') || POPULATION_PMTILES_URL;
registerPopulation(maplibregl, POPULATION_PMTILES);

/** Reflect the focused event in the URL (`?event=<id>`) so a copied link reproduces it. */
function setEventParam(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('event', id);
  else url.searchParams.delete('event');
  window.history.replaceState(window.history.state, '', url.toString());
}

/** Resolve the vector base style for a state (or undefined when the base map is off). */
async function baseFor(state: ViewerState): Promise<StyleSpecification | undefined> {
  return state.basemap ? loadBasemapStyle(state.basemapStyle) : undefined;
}

/** Resolve earthquake data for a state (or undefined when the overlay is off). */
async function quakesFor(state: ViewerState): Promise<QuakeData | undefined> {
  return state.earthquakes ? loadEarthquakes(state.quakeFeed) : undefined;
}

/** Popup content for an earthquake feature. */
function quakePopupHtml(p: Record<string, unknown>): string {
  const mag = typeof p.mag === 'number' ? p.mag.toFixed(1) : '—';
  const depth = typeof p.depth === 'number' ? `${p.depth.toFixed(0)} km` : '—';
  const when = typeof p.time === 'number' ? new Date(p.time).toLocaleString() : '—';
  const place = String(p.place ?? 'Unknown location');
  const url = typeof p.url === 'string' ? p.url : null;
  const link = url ? `<a href="${url}" target="_blank" rel="noopener">USGS event page →</a>` : '';
  return `<div class="mh-popup">
    <div class="mh-popup-mag">M ${mag}</div>
    <div class="mh-popup-place">${place}</div>
    <dl><dt>Depth</dt><dd>${depth}</dd><dt>Time</dt><dd>${when}</dd></dl>
    ${link}
  </div>`;
}

async function init(): Promise<void> {
  // Resolve the real style up front so the map's first render is the final one
  // (no placeholder → diff churn, no aborted sprite request).
  const [base, quakes] = await Promise.all([baseFor(DEFAULT_STATE), quakesFor(DEFAULT_STATE)]);

  const map: MlMap = new maplibregl.Map({
    container: 'map',
    hash: true,
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
    maxPitch: 85,
    style: buildStyle(DEFAULT_STATE, base, quakes),
  });

  // Controls go on the right — the control panel owns the left edge.
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  // Latest applied state + the focused single event (independent of the feed).
  let currentState: ViewerState = DEFAULT_STATE;
  let focus: QuakeData | undefined;
  let focusMmi: GeoJsonFC | undefined;

  const applyState = async (state: ViewerState): Promise<void> => {
    currentState = state;
    try {
      const [nextBase, nextQuakes] = await Promise.all([baseFor(state), quakesFor(state)]);
      map.setStyle(buildStyle(state, nextBase, nextQuakes, focus, focusMmi), { diff: true });
    } catch (err) {
      console.error(err);
    }
  };

  // Earthquake interactivity — handlers bind by layer id and survive setStyle,
  // firing only while the matching layer exists.
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' });
  const showPopup = (lngLat: maplibregl.LngLatLike, props: Record<string, unknown>) =>
    popup.setLngLat(lngLat).setHTML(quakePopupHtml(props)).addTo(map);

  const QUAKE_LAYERS = ['earthquakes', 'quake-focus-dot', 'quake-focus-halo'];
  for (const layer of QUAKE_LAYERS) {
    map.on('click', layer, (e) => {
      const f = e.features?.[0];
      if (f) showPopup(e.lngLat, f.properties as Record<string, unknown>);
    });
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  // Click anywhere to read the WorldPop value (unless an earthquake was clicked).
  map.on('click', async (e) => {
    if (!currentState.population) return;
    const onQuake = map.queryRenderedFeatures(e.point, {
      layers: QUAKE_LAYERS.filter((id) => map.getLayer(id)),
    });
    if (onQuake.length) return;
    const value = await getPopulationAt(e.lngLat.lng, e.lngLat.lat);
    if (value == null) return;
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="mh-popup">
          <div class="mh-popup-mag" style="color:#cc4c02">${Math.round(value).toLocaleString()}</div>
          <div class="mh-popup-place">people · WorldPop 2020 (~1 km cell)</div>
          <dl><dt>Lng, Lat</dt><dd>${e.lngLat.lng.toFixed(4)}, ${e.lngLat.lat.toFixed(4)}</dd></dl>
        </div>`,
      )
      .addTo(map);
  });

  /** Load a single USGS event + ShakeMap, highlight it, and frame it. Empty input clears it. */
  const focusEvent = async (idOrUrl: string): Promise<void> => {
    if (!idOrUrl.trim()) {
      focus = undefined;
      focusMmi = undefined;
      setEventParam(null);
      popup.remove();
      await applyState(currentState);
      return;
    }
    try {
      const ev = await loadEvent(idOrUrl);
      focus = ev.marker;
      focusMmi = ev.mmi ?? undefined;
      // Write the canonical id to the URL so the current view is shareable.
      const canonicalId = String((ev.marker.features[0] as { id?: unknown }).id ?? '').trim();
      setEventParam(canonicalId || null);
      await applyState(currentState);
      // Frame the whole MMI footprint when available, else fly to the epicentre.
      if (ev.bbox) {
        map.fitBounds(ev.bbox, { padding: 70, maxZoom: 10, pitch: 0 });
      } else {
        map.flyTo({ center: ev.center, zoom: Math.max(map.getZoom(), 7.5), speed: 1.2 });
      }
      showPopup(ev.center, ev.marker.features[0].properties as Record<string, unknown>);
    } catch (err) {
      console.error(err);
      window.alert(String(err instanceof Error ? err.message : err));
    }
  };

  const panelEl = document.getElementById('panel');
  if (!panelEl) throw new Error('#panel element missing');

  new ControlPanel(panelEl, DEFAULT_STATE, (state) => void applyState(state), (id) => void focusEvent(id));

  // Deep link: ?event=<id|url> auto-focuses an event once the map is ready.
  const eventParam = new URLSearchParams(location.search).get('event');
  if (eventParam) map.once('load', () => void focusEvent(eventParam));
}

void init();
