/** Typed fetch helpers for same-origin API routes (frontend + demo). */

export type SuitabilityWeights = {
  heatMitigation: number;
  parkAccess: number;
  impervious: number;
  equity: number;
};

export async function getGrid(rows = 8, cols = 10) {
  const r = await fetch(`/api/v1/grid?rows=${rows}&cols=${cols}`);
  if (!r.ok) throw new Error(`grid ${r.status}`);
  return r.json() as Promise<{
    meta: {
      bounds: {
        south: number;
        north: number;
        west: number;
        east: number;
      };
      rows: number;
      cols: number;
    };
    cells: Array<{
      id: string;
      lat: number;
      lng: number;
      factors: SuitabilityWeights;
    }>;
  }>;
}

export async function postSuitability(
  weights: SuitabilityWeights,
  rows: number,
  cols: number
) {
  const r = await fetch("/api/v1/suitability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weights, rows, cols }),
  });
  if (!r.ok) throw new Error(`suitability ${r.status}`);
  return r.json() as Promise<{
    cells: Array<{
      id: string;
      lat: number;
      lng: number;
      score: number;
      factors: SuitabilityWeights;
    }>;
    top: Array<{ id: string; lat: number; lng: number; score: number }>;
  }>;
}

export async function postPredict(body: {
  scenario: string;
  cellIds: string[];
  intensity: number;
  grid?: { rows?: number; cols?: number };
}) {
  const r = await fetch("/api/v1/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : `predict ${r.status}`
    );
  }
  return r.json() as Promise<import("@/lib/prediction/types").PredictResponseV1>;
}
