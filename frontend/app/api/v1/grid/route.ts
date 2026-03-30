import { NextResponse } from "next/server";
import { buildSeedGrid, KW_BOUNDS } from "@/lib/suitability";

/**
 * GET /api/v1/grid
 * Returns illustrative grid cells + bbox for map fitting.
 * Query: ?rows=8&cols=10 (optional, capped)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rows = Math.min(32, Math.max(2, Number(searchParams.get("rows")) || 8));
  const cols = Math.min(32, Math.max(2, Number(searchParams.get("cols")) || 10));

  const cells = buildSeedGrid(rows, cols);

  return NextResponse.json({
    meta: {
      bounds: KW_BOUNDS,
      rows,
      cols,
      count: cells.length,
      disclaimer:
        "Illustrative factors for prototype; replace with municipal / open data.",
    },
    cells,
  });
}
