import { QUAKE_FEEDS, type QuakeFeed } from './config';

/** Minimal GeoJSON shape we rely on (avoids depending on @types/geojson). */
export interface QuakeData {
  type: 'FeatureCollection';
  features: Array<{
    geometry: { coordinates: [number, number, number] };
    properties: Record<string, unknown>;
  }>;
}

const cache = new Map<QuakeFeed, Promise<QuakeData>>();

/** Extract a USGS event id from a raw id or an event-page URL (…/eventpage/<id>/map). */
export function parseEventId(input: string): string {
  const s = input.trim();
  const m = s.match(/eventpage\/([^/?#]+)/);
  if (m) return m[1];
  const segs = s.split(/[/?#]/).filter(Boolean);
  const last = segs[segs.length - 1];
  if (last === 'map') return segs[segs.length - 2] ?? s;
  return last ?? s;
}

/** Generic GeoJSON FeatureCollection (used for ShakeMap contour lines). */
export interface GeoJsonFC {
  type: 'FeatureCollection';
  features: Array<{ geometry: { coordinates: unknown }; properties: Record<string, unknown> }>;
}

export interface FocusedEvent {
  /** One-point collection for the epicentre marker. */
  marker: QuakeData;
  /** ShakeMap MMI contour lines, or null when the event has no ShakeMap. */
  mmi: GeoJsonFC | null;
  center: [number, number];
  /** [west, south, east, north] of the MMI footprint, when available. */
  bbox: [number, number, number, number] | null;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const toRoman = (n: number): string => (Number.isInteger(n) && n >= 1 && n <= 12 ? ROMAN[n] : '');

/** Pull the cont_mmi.json download URL out of an event's ShakeMap product. */
function shakeMmiUrl(feature: { properties?: Record<string, unknown> }): string | null {
  const products = (feature.properties as { products?: Record<string, unknown> })?.products;
  const shakemap = (products as { shakemap?: unknown[] })?.shakemap;
  const contents = (shakemap?.[0] as { contents?: Record<string, { url?: string }> })?.contents;
  return contents?.['download/cont_mmi.json']?.url ?? null;
}

/** Bounding box of every coordinate in a MultiLineString FeatureCollection. */
function bboxOf(fc: GeoJsonFC): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (node: unknown): void => {
    if (Array.isArray(node) && typeof node[0] === 'number' && typeof node[1] === 'number') {
      const [lng, lat] = node as number[];
      w = Math.min(w, lng); e = Math.max(e, lng);
      s = Math.min(s, lat); n = Math.max(n, lat);
    } else if (Array.isArray(node)) {
      node.forEach(visit);
    }
  };
  fc.features.forEach((f) => visit(f.geometry?.coordinates));
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * Fetch a single USGS event (id or event-page URL): the epicentre marker plus,
 * when present, its ShakeMap MMI contours (with roman-numeral labels added).
 */
export async function loadEvent(idOrUrl: string): Promise<FocusedEvent> {
  const id = parseEventId(idOrUrl);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${encodeURIComponent(id)}&format=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Event "${id}" not found (${r.status})`);
  const feature = (await r.json()) as QuakeData['features'][number];
  const coords = feature.geometry?.coordinates;
  feature.properties = feature.properties ?? {};
  feature.properties.depth = Array.isArray(coords) ? coords[2] : null;
  const center: [number, number] = [coords[0], coords[1]];

  let mmi: GeoJsonFC | null = null;
  let bbox: [number, number, number, number] | null = null;
  const mmiUrl = shakeMmiUrl(feature);
  if (mmiUrl) {
    try {
      const cr = await fetch(mmiUrl);
      if (cr.ok) {
        mmi = (await cr.json()) as GeoJsonFC;
        // Roman-numeral label for whole-number MMI levels (half levels stay blank).
        for (const f of mmi.features) {
          const v = f.properties?.value;
          f.properties = f.properties ?? {};
          f.properties.label = typeof v === 'number' ? toRoman(v) : '';
        }
        bbox = bboxOf(mmi);
      }
    } catch {
      /* ShakeMap optional — ignore fetch errors */
    }
  }

  return { marker: { type: 'FeatureCollection', features: [feature] }, mmi, center, bbox };
}

/**
 * Fetch (and cache) a USGS earthquake summary feed. The DEM-style data-driven
 * paint needs depth as a property, but USGS stores it as the geometry's 3rd
 * coordinate — so we copy it onto `properties.depth` (km).
 */
export function loadEarthquakes(feed: QuakeFeed): Promise<QuakeData> {
  let pending = cache.get(feed);
  if (!pending) {
    pending = fetch(QUAKE_FEEDS[feed])
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load earthquake feed "${feed}": ${r.status}`);
        return r.json() as Promise<QuakeData>;
      })
      .then((fc) => {
        for (const f of fc.features) {
          const coords = f.geometry?.coordinates;
          f.properties = f.properties ?? {};
          f.properties.depth = Array.isArray(coords) ? coords[2] : null;
        }
        return fc;
      })
      .catch((err) => {
        cache.delete(feed); // allow a retry on next toggle
        throw err;
      });
    cache.set(feed, pending);
  }
  return pending;
}
