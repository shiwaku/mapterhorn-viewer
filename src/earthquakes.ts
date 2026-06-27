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
