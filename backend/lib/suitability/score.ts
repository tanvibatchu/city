import type { FactorKey, Factors, GridCell, ScoredCell, Weights } from "./types";
import { FACTOR_KEYS } from "./types";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Normalize non-negative weights to sum to 1 (if all zero, use uniform). */
export function normalizeWeights(w: Weights): Record<FactorKey, number> {
  let sum = 0;
  for (const k of FACTOR_KEYS) {
    sum += Math.max(0, w[k] ?? 0);
  }
  if (sum <= 0) {
    const u = 1 / FACTOR_KEYS.length;
    return Object.fromEntries(FACTOR_KEYS.map((k) => [k, u])) as Record<
      FactorKey,
      number
    >;
  }
  return Object.fromEntries(
    FACTOR_KEYS.map((k) => [k, Math.max(0, w[k] ?? 0) / sum])
  ) as Record<FactorKey, number>;
}

/** Dot product of factors with normalized weights; result clamped to 0–1. */
export function suitabilityScore(factors: Factors, weights: Weights): number {
  const nw = normalizeWeights(weights);
  let s = 0;
  for (const k of FACTOR_KEYS) {
    s += clamp01(factors[k]) * nw[k];
  }
  return clamp01(s);
}

export function scoreGrid(cells: GridCell[], weights: Weights): ScoredCell[] {
  return cells.map((cell) => ({
    ...cell,
    score: suitabilityScore(cell.factors, weights),
  }));
}
