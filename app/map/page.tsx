"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import {
  postPredict,
  postSuitability,
  type SuitabilityWeights,
} from "@/lib/api/client";
import { cellsToGeoJSON } from "@/lib/map/cellsToGeoJSON";
import { KW_BOUNDS } from "@/lib/suitability";
import type { PredictResponseV1 } from "@/lib/prediction/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const KW_CENTER: [number, number] = [-80.5449, 43.4643];

const DEFAULT_WEIGHTS: SuitabilityWeights = {
  heatMitigation: 1,
  parkAccess: 1,
  impervious: 1,
  equity: 1,
};

function MapContent() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapboxMap | null>(null);
  const gridDimsRef = useRef({ rows: 8, cols: 10 });
  const weightsRef = useRef<SuitabilityWeights>(DEFAULT_WEIGHTS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [weights, setWeights] = useState<SuitabilityWeights>(DEFAULT_WEIGHTS);
  const [top, setTop] = useState<
    Array<{ id: string; lat: number; lng: number; score: number }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [greeneryPct, setGreeneryPct] = useState(30);
  const [predict, setPredict] = useState<PredictResponseV1 | null>(null);
  const [predictErr, setPredictErr] = useState<string | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [loadingPredict, setLoadingPredict] = useState(false);

  weightsRef.current = weights;

  const applyGridData = useCallback(
    async (w: SuitabilityWeights) => {
      const map = mapInstanceRef.current;
      if (!map?.getSource("urban-grid")) return;
      const { rows, cols } = gridDimsRef.current;
      const data = await postSuitability(w, rows, cols);
      const src = map.getSource("urban-grid") as GeoJSONSource;
      src.setData(cellsToGeoJSON(data.cells));
      setTop(data.top.slice(0, 5));
    },
    []
  );

  const refreshGridDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void applyGridData(weightsRef.current).catch(() => setTop([]));
    }, 200);
  }, [applyGridData]);

  useEffect(() => {
    refreshGridDebounced();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [weights, refreshGridDebounced]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let map: MapboxMap | null = null;

    import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.default.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: KW_CENTER,
        zoom: 14,
        pitch: 55,
        bearing: 0,
        antialias: true,
      });
      mapInstanceRef.current = map;

      map.addControl(new mapboxgl.default.NavigationControl(), "bottom-right");

      map.on("load", () => {
        if (!map) return;

        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });

        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 0.0],
            "sky-atmosphere-sun-intensity": 5,
          },
        });

        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 12,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["get", "height"],
                0,
                "#1a2e1a",
                40,
                "#1f3320",
                80,
                "#2d1a14",
                150,
                "#3d2219",
              ],
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                0,
                12.05,
                ["get", "height"],
              ],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.9,
            },
          },
          "road-label"
        );

        map.addSource("urban-grid", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "urban-grid-circles",
          type: "circle",
          source: "urban-grid",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              11,
              4,
              14,
              10,
              18,
              18,
            ],
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "score"],
              0,
              "#4c1d95",
              0.35,
              "#b45309",
              0.65,
              "#ca8a04",
              1,
              "#22c55e",
            ],
            "circle-opacity": 0.88,
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(232,220,200,0.25)",
          },
        });

        map.addLayer({
          id: "urban-grid-selected",
          type: "circle",
          source: "urban-grid",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              11,
              8,
              14,
              16,
              18,
              26,
            ],
            "circle-color": "rgba(34,197,94,0)",
            "circle-opacity": 0,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#f97316",
          },
        });

        map.on("mouseenter", "urban-grid-circles", () => {
          map!.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "urban-grid-circles", () => {
          map!.getCanvas().style.cursor = "";
        });

        map.on("click", "urban-grid-circles", (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.id as string | undefined;
          if (id) setSelectedId(id);
        });

        map.fitBounds(
          [
            [KW_BOUNDS.west, KW_BOUNDS.south],
            [KW_BOUNDS.east, KW_BOUNDS.north],
          ],
          { padding: 72, duration: 0 }
        );

        void (async () => {
          try {
            setLoadingGrid(true);
            await applyGridData(weightsRef.current);
          } finally {
            setLoadingGrid(false);
          }
        })();
      });
    });

    return () => {
      map?.remove();
      mapInstanceRef.current = null;
    };
  }, [applyGridData]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map?.getLayer("urban-grid-selected")) return;
    if (selectedId) {
      map.setFilter("urban-grid-selected", ["==", ["get", "id"], selectedId]);
      map.setPaintProperty("urban-grid-selected", "circle-opacity", 1);
    } else {
      map.setFilter("urban-grid-selected", ["==", ["get", "id"], ""]);
      map.setPaintProperty("urban-grid-selected", "circle-opacity", 0);
    }
  }, [selectedId]);

  const runPredict = () => {
    if (!selectedId) {
      setPredictErr("Tap a green dot on the map first.");
      return;
    }
    setPredictErr(null);
    setLoadingPredict(true);
    const { rows, cols } = gridDimsRef.current;
    postPredict({
      scenario: "increase_canopy",
      cellIds: [selectedId],
      intensity: greeneryPct / 100,
      grid: { rows, cols },
    })
      .then(setPredict)
      .catch((e: Error) => setPredictErr(e.message))
      .finally(() => setLoadingPredict(false));
  };

  const wLabel: Record<keyof SuitabilityWeights, string> = {
    heatMitigation: "Heat relief",
    parkAccess: "Park access",
    impervious: "Surface / grey",
    equity: "Equity",
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={mapRef} className="map-container" />

      <div className="map-topbar">
        <span className="map-logo">
          City<span>Scapes</span>
        </span>

        <div className="map-search">
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "rgba(232,220,200,0.35)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35"
            />
          </svg>
          <input
            type="text"
            placeholder="Search a location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        <Link href="/" className="back-btn">
          <svg
            width="13"
            height="13"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Home
        </Link>
      </div>

      <aside className="map-panel">
        <h2 className="map-panel-title">Green priority</h2>
        <p className="map-panel-hint">
          Dots = prototype grid. Purple → green = higher suitability score.
        </p>
        {(Object.keys(weights) as (keyof SuitabilityWeights)[]).map((k) => (
          <label key={k} className="map-slider-row">
            <span>{wLabel[k]}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(weights[k] * 50)}
              onChange={(e) =>
                setWeights((prev) => ({
                  ...prev,
                  [k]: Number(e.target.value) / 50,
                }))
              }
            />
          </label>
        ))}
        {loadingGrid && (
          <p className="map-panel-muted">Loading grid…</p>
        )}
        <div className="map-panel-section">
          <h3 className="map-panel-sub">Top picks</h3>
          <ol className="map-top-list">
            {top.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={
                    selectedId === t.id ? "map-top-btn active" : "map-top-btn"
                  }
                  onClick={() => setSelectedId(t.id)}
                >
                  #{i + 1} {t.id} · {(t.score * 100).toFixed(0)}%
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="map-panel-section">
          <h3 className="map-panel-sub">Scenario (+greenery)</h3>
          <p className="map-panel-hint">
            Select a dot, then add greenery (additive intensity for the stub
            model).
          </p>
          <label className="map-slider-row">
            <span>+{greeneryPct}% greenery</span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={greeneryPct}
              onChange={(e) => setGreeneryPct(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="map-predict-btn"
            disabled={loadingPredict || !selectedId}
            onClick={runPredict}
          >
            {loadingPredict ? "Running…" : "Run prediction"}
          </button>
          {predictErr && (
            <p className="map-panel-err">{predictErr}</p>
          )}
          {predict && (
            <div className="map-predict-out">
              <div>
                <strong>Carbon index</strong>{" "}
                <span className="map-delta">
                  {predict.baseline.carbonIndex.toFixed(2)} →{" "}
                  {predict.scenario.carbonIndex.toFixed(2)}
                </span>{" "}
                (Δ {predict.delta.carbonIndex.toFixed(3)})
              </div>
              <div>
                <strong>Heat mitigation</strong>{" "}
                <span className="map-delta">
                  {predict.baseline.heatMitigationIndex.toFixed(2)} →{" "}
                  {predict.scenario.heatMitigationIndex.toFixed(2)}
                </span>{" "}
                (Δ {predict.delta.heatMitigationIndex.toFixed(3)})
              </div>
              <p className="map-panel-muted">{predict.meta.disclaimer}</p>
            </div>
          )}
        </div>
      </aside>

      <div className="map-chip">
        <span className="map-chip-dot" />
        Kitchener–Waterloo · suitability + scenario (prototype)
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div style={{ background: "#0f1f0f", width: "100vw", height: "100vh" }} />
      }
    >
      <MapContent />
    </Suspense>
  );
}
