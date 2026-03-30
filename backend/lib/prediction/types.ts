/**
 * API v1 — frozen JSON contract for POST /api/v1/predict
 * (stub implementation; replace internals with real model later.)
 *
 * --- REQUEST (example) ---
 * {
 *   "scenario": "increase_canopy",
 *   "cellIds": ["kw-3-4", "kw-3-5"],
 *   "intensity": 0.25,
 *   "grid": { "rows": 8, "cols": 10 }
 * }
 *
 * --- RESPONSE (example) ---
 * {
 *   "meta": {
 *     "apiVersion": "1",
 *     "disclaimer": "Illustrative indices only; not for regulatory or policy decisions.",
 *     "units": "dimensionless indices 0–1"
 *   },
 *   "baseline": {
 *     "carbonIndex": 0.62,
 *     "heatMitigationIndex": 0.55
 *   },
 *   "scenario": {
 *     "carbonIndex": 0.59,
 *     "heatMitigationIndex": 0.63
 *   },
 *   "delta": {
 *     "carbonIndex": -0.03,
 *     "heatMitigationIndex": 0.08
 *   },
 *   "cells": [
 *     {
 *       "id": "kw-3-4",
 *       "baseline": { "carbonIndex": 0.61, "heatMitigationIndex": 0.54 },
 *       "scenario": { "carbonIndex": 0.58, "heatMitigationIndex": 0.62 },
 *       "delta": { "carbonIndex": -0.03, "heatMitigationIndex": 0.08 }
 *     }
 *   ]
 * }
 */

export type PredictScenario =
  | "increase_canopy"
  | "park_expansion"
  | "solar_aggregate"
  | "community_gardens"
  | string;

export interface PredictRequestV1 {
  /** What kind of intervention (stub accepts any string). */
  scenario: PredictScenario;
  /** Grid cell ids from GET /api/v1/grid (e.g. kw-r-c). */
  cellIds: string[];
  /** Intervention strength 0–1. */
  intensity: number;
  /** Must match grid used to resolve cellIds (default 8×10). */
  grid?: { rows?: number; cols?: number };
}

export interface IndexPair {
  /** Higher = lower emissions proxy (illustrative). */
  carbonIndex: number;
  /** Higher = stronger cooling / green benefit proxy. */
  heatMitigationIndex: number;
}

export interface CellPrediction {
  id: string;
  baseline: IndexPair;
  scenario: IndexPair;
  delta: {
    carbonIndex: number;
    heatMitigationIndex: number;
  };
}

export interface PredictResponseV1 {
  meta: {
    apiVersion: "1";
    disclaimer: string;
    units: string;
  };
  baseline: IndexPair;
  scenario: IndexPair;
  delta: {
    carbonIndex: number;
    heatMitigationIndex: number;
  };
  cells: CellPrediction[];
}
