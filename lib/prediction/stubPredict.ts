import type { GridCell } from "@/lib/suitability/types";
import { buildSeedGrid } from "@/lib/suitability/seedGrid";
import type { CellPrediction, IndexPair, PredictRequestV1 } from "./types";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Illustrative indices from cell factors (placeholder physics). */
function indicesFromCell(cell: GridCell, greenBoost: number): IndexPair {
  const { heatMitigation, parkAccess, impervious } = cell.factors;
  const b = clamp01(greenBoost);
  const carbonIndex = clamp01(
    0.55 * (1 - impervious) + 0.25 * parkAccess + 0.2 * heatMitigation + 0.15 * b
  );
  const heatMitigationIndex = clamp01(
    0.5 * heatMitigation + 0.35 * parkAccess + 0.15 * b
  );
  return { carbonIndex, heatMitigationIndex };
}

function meanPair(pairs: IndexPair[]): IndexPair {
  if (pairs.length === 0) {
    return { carbonIndex: 0, heatMitigationIndex: 0 };
  }
  const s = pairs.reduce(
    (acc, p) => ({
      carbonIndex: acc.carbonIndex + p.carbonIndex,
      heatMitigationIndex: acc.heatMitigationIndex + p.heatMitigationIndex,
    }),
    { carbonIndex: 0, heatMitigationIndex: 0 }
  );
  const n = pairs.length;
  return {
    carbonIndex: s.carbonIndex / n,
    heatMitigationIndex: s.heatMitigationIndex / n,
  };
}

/**
 * Stub: same shape as real model will return; swap implementation later.
 * Boost scales with intensity and scenario name (cosmetic only for demo).
 */
export function stubPredict(req: PredictRequestV1): {
  baseline: IndexPair;
  scenario: IndexPair;
  delta: { carbonIndex: number; heatMitigationIndex: number };
  cells: CellPrediction[];
} {
  const rows = Math.min(32, Math.max(2, Number(req.grid?.rows) || 8));
  const cols = Math.min(32, Math.max(2, Number(req.grid?.cols) || 10));
  const intensity = clamp01(
    typeof req.intensity === "number" && Number.isFinite(req.intensity)
      ? req.intensity
      : 0.2
  );

  const grid = buildSeedGrid(rows, cols);
  const byId = new Map(grid.map((c) => [c.id, c]));

  const scenarioBoost =
    intensity *
    (0.15 +
      (typeof req.scenario === "string" && req.scenario.includes("solar")
        ? 0.05
        : 0));

  const cells: CellPrediction[] = [];

  for (const id of req.cellIds) {
    const cell = byId.get(id);
    if (!cell) continue;

    const baseline = indicesFromCell(cell, 0);
    const scenario = indicesFromCell(cell, scenarioBoost);
    cells.push({
      id,
      baseline,
      scenario,
      delta: {
        carbonIndex: scenario.carbonIndex - baseline.carbonIndex,
        heatMitigationIndex:
          scenario.heatMitigationIndex - baseline.heatMitigationIndex,
      },
    });
  }

  const basePairs = cells.map((c) => c.baseline);
  const scenPairs = cells.map((c) => c.scenario);
  const baseline = meanPair(basePairs);
  const scenario = meanPair(scenPairs);

  return {
    baseline,
    scenario,
    delta: {
      carbonIndex: scenario.carbonIndex - baseline.carbonIndex,
      heatMitigationIndex:
        scenario.heatMitigationIndex - baseline.heatMitigationIndex,
    },
    cells,
  };
}
