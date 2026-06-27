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

/** Fetch a single USGS event by id (or event-page URL) as a one-feature collection. */
export async function loadEvent(idOrUrl: string): Promise<QuakeData> {
  const id = parseEventId(idOrUrl);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${encodeURIComponent(id)}&format=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Event "${id}" not found (${r.status})`);
  const feature = (await r.json()) as QuakeData['features'][number];
  const coords = feature.geometry?.coordinates;
  feature.properties = feature.properties ?? {};
  feature.properties.depth = Array.isArray(coords) ? coords[2] : null;
  return { type: 'FeatureCollection', features: [feature] };
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
