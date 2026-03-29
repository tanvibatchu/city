import { NextResponse } from "next/server";
import {
  FACTOR_KEYS,
  type Weights,
  buildSeedGrid,
  scoreGrid,
} from "@/lib/suitability";

function parseWeights(body: unknown): Weights | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const w: Partial<Weights> = {};
  for (const k of FACTOR_KEYS) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      w[k] = v;
    } else {
      w[k] = 1;
    }
  }
  return w as Weights;
}

/**
 * POST /api/v1/suitability
 * Body: { weights: { heatMitigation, parkAccess, impervious, equity }, rows?, cols? }
 * Returns: scored cells sorted by score descending (for "top recommendations").
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const obj = json as { weights?: unknown; rows?: number; cols?: number };
  const weights = parseWeights(obj.weights);
  if (!weights) {
    return NextResponse.json(
      { error: "Missing weights object with numeric factor keys" },
      { status: 400 }
    );
  }

  const rows = Math.min(32, Math.max(2, Number(obj.rows) || 8));
  const cols = Math.min(32, Math.max(2, Number(obj.cols) || 10));

  const cells = buildSeedGrid(rows, cols);
  const scored = scoreGrid(cells, weights).sort((a, b) => b.score - a.score);

  return NextResponse.json({
    weights,
    cells: scored,
    top: scored.slice(0, 5),
  });
}
