import { PMTiles } from 'pmtiles';

/**
 * WorldPop population shown as "numeric PNG tiles": each pixel encodes
 * people-per-cell as a 24-bit integer N = round(pop * SCALE) split across RGB
 * (R = high byte, G = mid, B = low), alpha 0 for nodata. We decode on the
 * client and apply a colour ramp, so the palette can be changed freely.
 *
 * Encoding mirrors https://qiita.com/shi-works/items/4069b2a38c5944cd9b20
 */

/** Native max zoom of the generated tileset (set to match the PMTiles build). */
export const WPPOP_MAXZOOM = 7;

/** N = round(pop * SCALE); decode with pop = N / SCALE. */
const SCALE = 10;

/** Colour ramp stops: people per 1 km cell → RGB (interpolated, log-ish breaks). */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [255, 255, 212]],
  [50, [254, 227, 145]],
  [200, [254, 196, 79]],
  [1000, [254, 153, 41]],
  [5000, [236, 112, 20]],
  [20000, [204, 76, 2]],
  [80000, [140, 45, 4]],
];

/** Upper bound of the legend ramp (people per 1 km cell). */
export const POPULATION_MAX = STOPS[STOPS.length - 1][0];

/** Legend stops exposed to the UI. */
export const POPULATION_LEGEND = STOPS.map(([v, c]) => ({
  value: v,
  color: `rgb(${c[0]},${c[1]},${c[2]})`,
}));

function ramp(v: number): [number, number, number] {
  if (v <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [hv, hc] = STOPS[i];
    if (v <= hv) {
      const [lv, lc] = STOPS[i - 1];
      const t = (v - lv) / (hv - lv);
      return [
        Math.round(lc[0] + (hc[0] - lc[0]) * t),
        Math.round(lc[1] + (hc[1] - lc[1]) * t),
        Math.round(lc[2] + (hc[2] - lc[2]) * t),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Recolour one encoded PNG tile to a coloured RGBA PNG. */
async function colorize(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue; // nodata stays transparent
    const value = (d[i] * 65536 + d[i + 1] * 256 + d[i + 2]) / SCALE;
    if (value <= 0) {
      d[i + 3] = 0;
      continue;
    }
    const [r, g, b] = ramp(value);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255; // layer raster-opacity handles global transparency
  }
  ctx.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

interface MaplibreLike {
  addProtocol(name: string, fn: (...args: any[]) => any): void;
}

let archive: PMTiles | null = null;

/** Register the `wppop://` protocol backed by a PMTiles archive. */
export function registerPopulation(maplibre: MaplibreLike, pmtilesUrl: string): void {
  archive = new PMTiles(pmtilesUrl);
  maplibre.addProtocol('wppop', async (params: { url: string }) => {
    const [z, x, y] = params.url.replace('wppop://', '').split('/').map(Number);
    const tile = await archive!.getZxy(z, x, y);
    if (!tile || !tile.data) return { data: null }; // empty/sea tile → nothing drawn
    return { data: await colorize(tile.data) };
  });
}

/** Decode the single encoded pixel (px,py) of a tile PNG → people, or null if nodata. */
async function decodePixel(buffer: ArrayBuffer, px: number, py: number): Promise<number | null> {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
  if (a === 0) return null;
  const value = (r * 65536 + g * 256 + b) / SCALE;
  return value > 0 ? value : null;
}

/**
 * Read the WorldPop value (people per ~1 km cell) at a lng/lat by sampling the
 * native-zoom tile from the PMTiles archive. Returns null over nodata/sea.
 */
export async function getPopulationAt(lng: number, lat: number): Promise<number | null> {
  if (!archive) return null;
  const z = WPPOP_MAXZOOM;
  const n = 2 ** z;
  const wrapped = (((lng + 180) % 360) + 360) % 360 - 180;
  const xt = ((wrapped + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yt = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  if (yt < 0 || yt >= n) return null;
  const tx = Math.floor(xt);
  const ty = Math.floor(yt);
  const px = Math.min(255, Math.floor((xt - tx) * 256));
  const py = Math.min(255, Math.floor((yt - ty) * 256));
  const tile = await archive.getZxy(z, tx, ty);
  if (!tile || !tile.data) return null;
  return decodePixel(tile.data, px, py);
}
