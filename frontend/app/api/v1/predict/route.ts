import { NextResponse } from "next/server";
import { stubPredict, type PredictRequestV1, type PredictResponseV1 } from "@/lib/prediction";

function parseBody(json: unknown): PredictRequestV1 | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const scenario = o.scenario;
  const cellIds = o.cellIds;
  if (typeof scenario !== "string" || !Array.isArray(cellIds)) return null;
  const ids = cellIds.filter((x): x is string => typeof x === "string");
  if (ids.length === 0) return null;

  const intensity =
    typeof o.intensity === "number" && Number.isFinite(o.intensity)
      ? o.intensity
      : 0.2;

  let grid: { rows?: number; cols?: number } | undefined;
  if (o.grid && typeof o.grid === "object") {
    const g = o.grid as Record<string, unknown>;
    grid = {
      rows: typeof g.rows === "number" ? g.rows : undefined,
      cols: typeof g.cols === "number" ? g.cols : undefined,
    };
  }

  return {
    scenario,
    cellIds: ids,
    intensity,
    grid,
  };
}

/**
 * POST /api/v1/predict — v1 JSON contract (see lib/prediction/types.ts).
 * Stub uses placeholder math; swap stubPredict for real model in lib/prediction.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const req = parseBody(json);
  if (!req) {
    return NextResponse.json(
      {
        error:
          "Expected { scenario: string, cellIds: string[], intensity?: number, grid?: { rows?, cols? } }",
      },
      { status: 400 }
    );
  }

  const out = stubPredict(req);

  if (out.cells.length === 0) {
    return NextResponse.json(
      {
        error:
          "No matching cell ids for this grid. Check cellIds and grid.rows/cols (must match GET /api/v1/grid).",
      },
      { status: 400 }
    );
  }

  const body: PredictResponseV1 = {
    meta: {
      apiVersion: "1",
      disclaimer:
        "Illustrative indices only; not for regulatory or policy decisions.",
      units: "dimensionless indices 0–1",
    },
    baseline: out.baseline,
    scenario: out.scenario,
    delta: out.delta,
    cells: out.cells,
  };

  return NextResponse.json(body);
}
