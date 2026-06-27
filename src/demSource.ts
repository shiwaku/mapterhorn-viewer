import { Protocol } from 'pmtiles';
import mlcontour from 'maplibre-contour';
import type {
  RasterDEMSourceSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl';
import {
  ZXY_TEMPLATE,
  PMTILES_BASE,
  MAPTERHORN_ATTRIBUTION,
  DEM_MAX_ZOOM,
  type SourceMode,
} from './config';

/** Minimal surface of the maplibre-gl namespace we depend on here. */
interface MaplibreLike {
  addProtocol(name: string, fn: (...args: any[]) => any): void;
}

let demSource: InstanceType<typeof mlcontour.DemSource> | null = null;

/**
 * Register the PMTiles routing protocol and the maplibre-contour DEM decoder.
 * Call once at startup, before creating the map.
 */
export function registerProtocols(maplibre: MaplibreLike): void {
  // --- PMTiles routing (pmtiles example) ---------------------------------
  // `mapterhorn://{z}/{x}/{y}` -> the planet archive (z<=12) or the matching
  // z6 archive (z>=13), served as a range request from download.mapterhorn.com.
  const protocol = new Protocol({ metadata: true, errorOnMissingTile: true });
  maplibre.addProtocol('mapterhorn', async (params: any, abortController: any) => {
    const [z, x, y] = params.url.replace('mapterhorn://', '').split('/').map(Number);
    const name = z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
    const url = `pmtiles://${PMTILES_BASE}/${name}.pmtiles/${z}/${x}/${y}.webp`;
    const response: any = await protocol.tile({ ...params, url }, abortController);
    if (response['data'] === null) throw new Error(`Tile z=${z} x=${x} y=${y} not found.`);
    return response;
  });

  // --- maplibre-contour DEM decoder (contour example) --------------------
  // DemSource fetches DEM tiles itself over plain HTTP and cannot go through a
  // maplibre protocol, so contours always read from the zxy endpoint regardless
  // of the selected source mode.
  demSource = new mlcontour.DemSource({
    url: ZXY_TEMPLATE,
    encoding: 'terrarium',
    maxzoom: 12,
    worker: true,
  });
  demSource.setupMaplibre(maplibre as any);
}

/** raster-dem source definition for the selected transport mode. */
export function demSourceSpec(mode: SourceMode): RasterDEMSourceSpecification {
  switch (mode) {
    case 'tilejson':
      // encoding / tileSize come from the TileJSON document itself.
      return {
        type: 'raster-dem',
        url: 'https://tiles.mapterhorn.com/tilejson.json',
        attribution: MAPTERHORN_ATTRIBUTION,
      };
    case 'zxy':
      return {
        type: 'raster-dem',
        tiles: [ZXY_TEMPLATE],
        encoding: 'terrarium',
        tileSize: 512,
        maxzoom: DEM_MAX_ZOOM,
        attribution: MAPTERHORN_ATTRIBUTION,
      };
    case 'pmtiles':
      return {
        type: 'raster-dem',
        tiles: ['mapterhorn://{z}/{x}/{y}'],
        encoding: 'terrarium',
        tileSize: 512,
        maxzoom: DEM_MAX_ZOOM,
        attribution: MAPTERHORN_ATTRIBUTION,
      };
  }
}

/** Vector source emitting contour tiles generated from the DEM. */
export function contourSourceSpec(): VectorSourceSpecification {
  if (!demSource) throw new Error('registerProtocols() must be called before contourSourceSpec()');
  return {
    type: 'vector',
    tiles: [
      demSource.contourProtocolUrl({
        thresholds: {
          12: [100, 500],
          14: [20, 100],
        },
        elevationKey: 'ele',
        levelKey: 'level',
        contourLayer: 'contours',
        buffer: 1,
        overzoom: 2,
      }),
    ],
    maxzoom: DEM_MAX_ZOOM,
  };
}
