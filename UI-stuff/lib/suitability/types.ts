/** Factor keys must stay in sync with slider labels in the UI. */
export const FACTOR_KEYS = [
  "heatMitigation",
  "parkAccess",
  "impervious",
  "equity",
] as const;

export type FactorKey = (typeof FACTOR_KEYS)[number];

export type Factors = Record<FactorKey, number>;

export type Weights = Record<FactorKey, number>;

export interface GridCell {
  id: string;
  lat: number;
  lng: number;
  /** Normalized 0–1 inputs (prototype / illustrative). */
  factors: Factors;
}

export interface ScoredCell extends GridCell {
  /** Combined suitability 0–1 after weighting. */
  score: number;
}
