/**
 * Procedural “greenspace preview” + tree sprite for Mapbox (canvas → data URL).
 * Victoria tree placement uses building footprints from the map (see page.tsx query).
 */

/** Mapbox image source corners: top-left, top-right, bottom-right, bottom-left (lng, lat). */
export function ringBoundingQuad(ring: [number, number][]): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ];
}

export function getOuterRingFromPolygonCoords(coords: number[][][]): [number, number][] | null {
  const ring = coords[0];
  if (!ring?.length) return null;
  return ring.map(([lng, lat]) => [lng, lat] as [number, number]);
}

/** Canvas “park” preview: grass, path, canopy silhouettes — stretched over the optimal site as a raster. */
export function buildOptimalGreenspaceDataUrl(): string {
  if (typeof document === "undefined") return "";
  const w = 640;
  const h = 480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.34);
  sky.addColorStop(0, "#1a3352");
  sky.addColorStop(1, "#93c5fd");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.34);

  const grass = ctx.createLinearGradient(0, h * 0.3, 0, h);
  grass.addColorStop(0, "#86efac");
  grass.addColorStop(0.45, "#22c55e");
  grass.addColorStop(1, "#14532d");
  ctx.fillStyle = grass;
  ctx.fillRect(0, h * 0.3, w, h * 0.7);

  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * w, h * 0.3 + Math.random() * h * 0.7, 1.2, 1.2);
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(20,83,45,${0.08 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * w,
      h * 0.35 + Math.random() * h * 0.62,
      8 + Math.random() * 24,
      5 + Math.random() * 14,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(214, 196, 168, 0.95)";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.92);
  ctx.bezierCurveTo(w * 0.28, h * 0.72, w * 0.42, h * 0.55, w * 0.52, h * 0.48);
  ctx.bezierCurveTo(w * 0.62, h * 0.42, w * 0.74, h * 0.38, w * 0.92, h * 0.44);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const drawTree = (x: number, y: number, s: number) => {
    ctx.fillStyle = "#166534";
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x - s * 0.5, y + s * 0.18);
    ctx.lineTo(x + s * 0.5, y + s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#14532d";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x - s * 0.38, y + s * 0.05);
    ctx.lineTo(x + s * 0.38, y + s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#422006";
    ctx.fillRect(x - s * 0.1, y + s * 0.12, s * 0.2, s * 0.42);
  };

  const rnd = (n: number) => {
    let h = 2166136261;
    for (let i = 0; i < n; i++) h = Math.imul(h ^ i, 16777619);
    return (h >>> 0) / 4294967296;
  };
  for (let i = 0; i < 22; i++) {
    const x = 48 + rnd(i * 3) * (w - 96);
    const y = h * 0.38 + rnd(i * 7) * (h * 0.55);
    drawTree(x, y, 18 + rnd(i * 11) * 22);
  }

  return canvas.toDataURL("image/png");
}

/** Small PNG-style tree for Mapbox symbol layer `icon-image`. */
export function buildTreeSpriteDataUrl(): string {
  if (typeof document === "undefined") return "";
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "#166534";
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.38, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#15803d";
  ctx.beginPath();
  ctx.moveTo(s / 2, s * 0.12);
  ctx.lineTo(s * 0.22, s * 0.48);
  ctx.lineTo(s * 0.78, s * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#451a03";
  ctx.fillRect(s * 0.44, s * 0.48, s * 0.12, s * 0.42);
  return canvas.toDataURL("image/png");
}

export function ringCentroid(ring: [number, number][]): [number, number] {
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const r = closed ? ring.slice(0, -1) : ring.slice();
  let sx = 0;
  let sy = 0;
  for (const p of r) {
    sx += p[0];
    sy += p[1];
  }
  const n = r.length || 1;
  return [sx / n, sy / n];
}

/** Mapbox building feature geometry → first outer ring. */
export function getOuterRingFromFeatureGeometry(geom: unknown): [number, number][] | null {
  if (!geom || typeof geom !== "object") return null;
  const g = geom as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && g.coordinates) {
    return getOuterRingFromPolygonCoords(g.coordinates as number[][][]);
  }
  if (g.type === "MultiPolygon" && g.coordinates) {
    const m = g.coordinates as number[][][][];
    if (m[0]) return getOuterRingFromPolygonCoords(m[0]);
  }
  return null;
}

/** Place one tree per edge, pushed slightly outside the footprint (street/park strip). */
export function treePointsAroundBuildingRing(
  ring: [number, number][],
  edgeOffset = 0.000055
): [number, number][] {
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  if (closed.length < 3) return [];
  const [cx, cy] = ringCentroid(closed);
  const out: [number, number][] = [];
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i];
    const b = closed[(i + 1) % closed.length];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const vx = mx - cx;
    const vy = my - cy;
    const len = Math.hypot(vx, vy) || 1e-9;
    out.push([mx + (vx / len) * edgeOffset, my + (vy / len) * edgeOffset]);
  }
  return out;
}

export function dedupePoints(pts: [number, number][], minDist = 0.00008): [number, number][] {
  const res: [number, number][] = [];
  for (const p of pts) {
    if (res.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > minDist)) res.push(p);
  }
  return res;
}

export function boundsContainPoint(
  bounds: [[number, number], [number, number]],
  p: [number, number]
): boolean {
  const [[west, south], [east, north]] = bounds;
  return p[0] >= west && p[0] <= east && p[1] >= south && p[1] <= north;
}
