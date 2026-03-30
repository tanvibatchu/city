import type { GridCell } from "./types";

/**
 * Minimal illustrative grid for API/dev. Replace with real GeoJSON / DB later.
 * BBox roughly around Kitchener–Waterloo downtown corridor (approximate).
 */
export const KW_BOUNDS = {
  south: 43.43,
  north: 43.52,
  west: -80.58,
  east: -80.43,
} as const;

function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function buildSeedGrid(rows = 8, cols = 10): GridCell[] {
  const { south, north, west, east } = KW_BOUNDS;
  const cells: GridCell[] = [];
  const dLat = (north - south) / rows;
  const dLng = (east - west) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `kw-${r}-${c}`;
      const lat = south + (r + 0.5) * dLat;
      const lng = west + (c + 0.5) * dLng;
      const h = hash01(id);
      cells.push({
        id,
        lat,
        lng,
        factors: {
          heatMitigation: clamp01(0.35 + 0.5 * Math.sin(h * Math.PI * 2)),
          parkAccess: clamp01(0.4 + 0.45 * hash01(id + "p")),
          impervious: clamp01(0.3 + 0.6 * hash01(id + "i")),
          equity: clamp01(0.25 + 0.65 * hash01(id + "e")),
        },
      });
    }
  }
  return cells;
}
