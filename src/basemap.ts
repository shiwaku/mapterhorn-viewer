import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAP_STYLE_URLS, type BasemapStyle } from './config';

// Cache the in-flight/resolved promise per style so repeated toggles don't refetch.
const cache = new Map<BasemapStyle, Promise<StyleSpecification>>();

/** Fetch (and cache) an OpenFreeMap vector style document. */
export function loadBasemapStyle(style: BasemapStyle): Promise<StyleSpecification> {
  let pending = cache.get(style);
  if (!pending) {
    pending = fetch(BASEMAP_STYLE_URLS[style])
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load base map "${style}": ${r.status}`);
        return r.json() as Promise<StyleSpecification>;
      })
      .catch((err) => {
        cache.delete(style); // allow a retry on next toggle
        throw err;
      });
    cache.set(style, pending);
  }
  return pending;
}
