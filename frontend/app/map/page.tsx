"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────
type HotspotScore = 1 | 2 | 3 | 4 | 5;
interface Hotspot {
  id: string;
  lng: number;
  lat: number;
  score: HotspotScore;
  name: string;
  reason: string;
  factors: string[];
}
interface ChatMessage { role: "user" | "ai"; text: string }

// ─── Score config ─────────────────────────────────────────────────────────────
const SCORE_CONFIG: Record<HotspotScore, { color: string; label: string }> = {
  1: { color: "#22c55e", label: "Low Priority" },
  2: { color: "#84cc16", label: "Medium-Low" },
  3: { color: "#eab308", label: "Medium" },
  4: { color: "#f97316", label: "Medium-High" },
  5: { color: "#ef4444", label: "High Priority" },
};

// ─── Hotspot generation ───────────────────────────────────────────────────────
// Deterministic AI-suggested greenspace spots relative to a center point.
// Scoring considers: residential density, park proximity, foot traffic,
// open land availability, and visual appeal.
function generateHotspots(center: [number, number]): Hotspot[] {
  const [lng, lat] = center;
  const raw = [
    {
      dlng: 0.0028, dlat: 0.0018, score: 5 as HotspotScore,
      name: "North Residential Cluster",
      reason: "Dense housing block with no green within 600 m — highest intervention need.",
      factors: ["High residential density", "No park within 600m", "High foot traffic", "Low canopy cover"],
    },
    {
      dlng: -0.0035, dlat: -0.0012, score: 5 as HotspotScore,
      name: "South Commercial Strip",
      reason: "Heavy commercial zone with minimal canopy. Urban heat island detected.",
      factors: ["Commercial density", "Minimal green canopy", "Heat island effect", "High pedestrian use"],
    },
    {
      dlng: 0.0015, dlat: -0.0025, score: 4 as HotspotScore,
      name: "Transit Hub Buffer",
      reason: "High daily commuter flow; underutilised lot adjacent — good conversion candidate.",
      factors: ["High commuter flow", "Underutilised adjacent lot", "Strong visual improvement potential"],
    },
    {
      dlng: -0.0022, dlat: 0.0030, score: 4 as HotspotScore,
      name: "Mixed-Use Corridor",
      reason: "Active street level retail with 400 m to nearest park. Residents underserved.",
      factors: ["Active street level", "400m to nearest park", "High resident density"],
    },
    {
      dlng: 0.0040, dlat: -0.0008, score: 4 as HotspotScore,
      name: "East Neighbourhood",
      reason: "Growing residential area with recent zoning changes; greenspace allocation lagging.",
      factors: ["Growing residential", "Recent upzoning", "Limited existing greenspace"],
    },
    {
      dlng: -0.0010, dlat: 0.0040, score: 3 as HotspotScore,
      name: "School Zone Buffer",
      reason: "Adjacent school grounds — community benefit for shade, play, and air quality.",
      factors: ["Proximity to school", "Community benefit", "Moderate foot traffic"],
    },
    {
      dlng: 0.0032, dlat: 0.0035, score: 3 as HotspotScore,
      name: "Parking Lot Conversion",
      reason: "Underutilised surface lot with strong greening potential. Good visual appeal.",
      factors: ["Underutilised surface lot", "Good visual appeal", "Easy conversion"],
    },
    {
      dlng: -0.0045, dlat: -0.0030, score: 3 as HotspotScore,
      name: "Industrial Edge Zone",
      reason: "Transitional buffer between industrial and residential. Medium opportunity.",
      factors: ["Industrial-residential buffer", "Medium visual appeal", "Moderate opportunity"],
    },
    {
      dlng: 0.0008, dlat: -0.0042, score: 2 as HotspotScore,
      name: "South Waterway Edge",
      reason: "Proximity to water feature improves natural conditions. Moderate foot traffic.",
      factors: ["Water feature proximity", "Moderate foot traffic", "Natural drainage benefit"],
    },
    {
      dlng: -0.0030, dlat: 0.0015, score: 2 as HotspotScore,
      name: "West Block Clearing",
      reason: "Partial tree coverage already exists — expansion opportunity at lower cost.",
      factors: ["Partial tree coverage", "Lower intervention cost", "Expansion of existing green"],
    },
    {
      dlng: 0.0050, dlat: 0.0010, score: 1 as HotspotScore,
      name: "Outer Greenway Extension",
      reason: "Adjacent to existing park. Connectivity value but low urgency.",
      factors: ["Adjacent to existing park", "Connectivity value", "Low urgency"],
    },
    {
      dlng: -0.0055, dlat: 0.0040, score: 1 as HotspotScore,
      name: "NW Perimeter Space",
      reason: "Low density area with natural green already present. Minimal intervention needed.",
      factors: ["Low density", "Existing natural green", "Minimal intervention needed"],
    },
  ];

  return raw.map((s, i) => ({
    id: `hs-${i}`,
    lng: lng + s.dlng,
    lat: lat + s.dlat,
    score: s.score,
    name: s.name,
    reason: s.reason,
    factors: s.factors,
  }));
}

// ─── Geocoding ────────────────────────────────────────────────────────────────
async function geocode(q: string): Promise<[number, number] | null> {
  if (!q.trim() || !MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,neighborhood,place&limit=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const f = data.features?.[0];
    return f ? [f.center[0], f.center[1]] : null;
  } catch { return null; }
}

// ─── Add 3D buildings (official Mapbox pattern) ───────────────────────────────
function add3DBuildings(map: MapboxMap) {
  const layers = map.getStyle().layers;
  const labelLayerId = layers.find(
    (l) => l.type === "symbol" && (l.layout as Record<string, unknown>)?.["text-field"]
  )?.id;
  if (map.getLayer("add-3d-buildings")) return;
  map.addLayer(
    {
      id: "add-3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["get", "height"],
          0, "#2a1410", 20, "#4a2817", 60, "#6b3c24", 130, "#8b5030", 250, "#9b5e38"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "height"]],
        "fill-extrusion-base":   ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "min_height"]],
        "fill-extrusion-opacity": 0.88,
      },
    },
    labelLayerId
  );
}

// ─── AI response generator ────────────────────────────────────────────────────
function generateAIResponse(msg: string, location: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("park") || lower.includes("green") || lower.includes("tree") || lower.includes("nature")) {
    return `Great proposal. Based on the greenspace analysis for ${location}, I've identified 12 candidate sites. The two highest-priority zones are the North Residential Cluster and South Commercial Strip — both show high density with no park within 600 m and elevated urban heat signatures. I recommend focusing initial intervention there. Shall I generate a detailed feasibility report?`;
  }
  if (lower.includes("road") || lower.includes("street") || lower.includes("traffic")) {
    return `Noted. Road network changes around ${location} would affect the pedestrian flow models. The East Neighbourhood hotspot (Level 4) is particularly sensitive to street-level improvements. Would you like me to overlay traffic density data?`;
  }
  if (lower.includes("housing") || lower.includes("residential") || lower.includes("building")) {
    return `Residential development proposals near ${location} should be weighted against greenspace impact. Current analysis shows the North Residential Cluster is already at a Level 5 deficiency — adding density without green investment would worsen the score. I can model projected impact if needed.`;
  }
  return `Change request logged for ${location}. I'm analysing urban density, land-use patterns, and green coverage in this area. Based on current hotspot data, the most impactful intervention points are within 400 m of your searched location. Would you like me to prioritise specific hotspots or run a broader impact simulation?`;
}

// ─── Main map component ───────────────────────────────────────────────────────
function MapContent() {
  const mapRef          = useRef<HTMLDivElement>(null);
  const mapInstanceRef  = useRef<mapboxgl.Map | null>(null);
  const markerRef       = useRef<mapboxgl.Marker | null>(null);
  const hotspotMarkers  = useRef<mapboxgl.Marker[]>([]);
  const centerRef       = useRef<[number, number]>(KW_CENTER);

  const searchParams = useSearchParams();
  const [query, setQuery]               = useState(searchParams.get("q") ?? "");
  const [loading, setLoading]           = useState(false);
  const [locationLabel, setLocationLabel] = useState("Kitchener–Waterloo");
  const [activePanel, setActivePanel]   = useState<"communicate" | null>(null);
  const [message, setMessage]           = useState("");
  const [chat, setChat]                 = useState<ChatMessage[]>([]);
  const [aiTyping, setAiTyping]         = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [hotspotsVisible, setHotspotsVisible] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const gridDimsRef = useRef({ rows: 8, cols: 10 });
  const weightsRef = useRef<SuitabilityWeights>(DEFAULT_WEIGHTS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weights, setWeights] = useState<SuitabilityWeights>(DEFAULT_WEIGHTS);
  const [top, setTop] = useState<
    Array<{ id: string; lat: number; lng: number; score: number }>
  >([]);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [greeneryPct, setGreeneryPct] = useState(30);
  const [predict, setPredict] = useState<PredictResponseV1 | null>(null);
  const [predictErr, setPredictErr] = useState<string | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [loadingPredict, setLoadingPredict] = useState(false);

  weightsRef.current = weights;

  const applyGridData = useCallback(async (w: SuitabilityWeights) => {
    const map = mapInstanceRef.current;
    if (!map?.getSource("urban-grid")) return;
    const { rows, cols } = gridDimsRef.current;
    const data = await postSuitability(w, rows, cols);
    const src = map.getSource("urban-grid") as GeoJSONSource;
    src.setData(cellsToGeoJSON(data.cells));
    setTop(data.top.slice(0, 5));
  }, []);

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

  const wLabel: Record<keyof SuitabilityWeights, string> = {
    heatMitigation: "Heat relief",
    parkAccess: "Park access",
    impervious: "Surface / grey",
    equity: "Equity",
  };

  const runPredict = () => {
    if (!selectedCellId) {
      setPredictErr("Tap a grid dot on the map first.");
      return;
    }
    setPredictErr(null);
    setLoadingPredict(true);
    const { rows, cols } = gridDimsRef.current;
    postPredict({
      scenario: "increase_canopy",
      cellIds: [selectedCellId],
      intensity: greeneryPct / 100,
      grid: { rows, cols },
    })
      .then(setPredict)
      .catch((e: Error) => setPredictErr(e.message))
      .finally(() => setLoadingPredict(false));
  };

  // scroll chat to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  // ── Drop hotspot markers ────────────────────────────────────────────────────
  const placeHotspots = useCallback((center: [number, number]) => {
    import("mapbox-gl").then((mapboxgl) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      // Clear old
      hotspotMarkers.current.forEach((m) => m.remove());
      hotspotMarkers.current = [];

      const spots = generateHotspots(center);

      spots.forEach((spot) => {
        const { color } = SCORE_CONFIG[spot.score];
        const size = 14 + spot.score * 4; // bigger = higher priority

        const el = document.createElement("div");
        el.className = "hotspot-dot";
        el.style.width  = `${size}px`;
        el.style.height = `${size}px`;
        el.style.background = color;
        el.style.boxShadow  = `0 0 ${spot.score * 5}px ${color}88`;
        if (spot.score >= 4) el.classList.add("hotspot-pulse");
        el.title = spot.name;

        el.addEventListener("click", () => setSelectedHotspot(spot));

        const marker = new mapboxgl.default.Marker({ element: el })
          .setLngLat([spot.lng, spot.lat])
          .addTo(map);
        hotspotMarkers.current.push(marker);
      });
    });
  }, []);

  // ── Fly to location ─────────────────────────────────────────────────────────
  const flyTo = useCallback((lng: number, lat: number, label?: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markerRef.current?.remove();

    map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: 62, bearing: -17.6, duration: 2400, essential: true });

    centerRef.current = [lng, lat];

    import("mapbox-gl").then((mapboxgl) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      const m = new mapboxgl.default.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      markerRef.current = m;
    });

    // Place hotspots after fly animation finishes
    setTimeout(() => placeHotspots([lng, lat]), 2500);

    if (label) setLocationLabel(label);
  }, [placeHotspots]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const qParam   = searchParams.get("q")   ?? "";
    const lngParam = searchParams.get("lng");
    const latParam = searchParams.get("lat");
    const hasCoords = !!(lngParam && latParam);
    const initCenter: [number, number] = hasCoords
      ? [parseFloat(lngParam!), parseFloat(latParam!)]
      : KW_CENTER;

    centerRef.current = initCenter;

    let mapInstance: MapboxMap | null = null;

    import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      mapInstance = new mapboxgl.default.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/standard",
        config: { basemap: { lightPreset: "night" } },
        center: initCenter,
        zoom: hasCoords ? 16.5 : 15.5,
        pitch: 62,
        bearing: -17.6,
        antialias: true,
      });

      mapInstanceRef.current = mapInstance;
      mapInstance.addControl(new mapboxgl.default.NavigationControl(), "bottom-right");

      mapInstance.on("style.load", () => {
        if (!mapInstance) return;
        add3DBuildings(mapInstance);

        mapInstance.addSource("urban-grid", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        mapInstance.addLayer({
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
              "#166534",
              0.5,
              "#dc2626",
              1,
              "#4ade80",
            ],
            "circle-opacity": 0.88,
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(232,220,200,0.25)",
          },
        });
        mapInstance.addLayer({
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

        mapInstance.on("mouseenter", "urban-grid-circles", () => {
          mapInstance!.getCanvas().style.cursor = "pointer";
        });
        mapInstance.on("mouseleave", "urban-grid-circles", () => {
          mapInstance!.getCanvas().style.cursor = "";
        });
        mapInstance.on("click", "urban-grid-circles", (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.id as string | undefined;
          if (id) setSelectedCellId(id);
        });

        mapInstance.fitBounds(
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

        if (hasCoords) {
          const lng = parseFloat(lngParam!);
          const lat = parseFloat(latParam!);
          const el = document.createElement("div");
          el.className = "map-marker";
          new mapboxgl.default.Marker({ element: el }).setLngLat([lng, lat]).addTo(mapInstance!);
          if (qParam) setLocationLabel(qParam);
          placeHotspots([lng, lat]);
        } else if (qParam) {
          geocode(qParam).then((c) => { if (c) flyTo(c[0], c[1], qParam); });
        } else {
          placeHotspots(KW_CENTER);
        }
      });
    });

    return () => {
      hotspotMarkers.current.forEach((m) => m.remove());
      markerRef.current?.remove();
      mapInstance?.remove();
      mapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map?.getLayer("urban-grid-selected")) return;
    if (selectedCellId) {
      map.setFilter("urban-grid-selected", ["==", ["get", "id"], selectedCellId]);
      map.setPaintProperty("urban-grid-selected", "circle-opacity", 1);
    } else {
      map.setFilter("urban-grid-selected", ["==", ["get", "id"], ""]);
      map.setPaintProperty("urban-grid-selected", "circle-opacity", 0);
    }
  }, [selectedCellId]);

  // Toggle hotspot visibility
  useEffect(() => {
    hotspotMarkers.current.forEach((m) => {
      (m.getElement() as HTMLElement).style.display = hotspotsVisible ? "block" : "none";
    });
  }, [hotspotsVisible]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const coords = await geocode(query);
    setLoading(false);
    if (coords) flyTo(coords[0], coords[1], query);
  };

  // ── Send change message ─────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const userMsg = message.trim();
    setChat((c) => [...c, { role: "user", text: userMsg }]);
    setMessage("");
    setAiTyping(true);
    await new Promise((r) => setTimeout(r, 1200));
    setAiTyping(false);
    setChat((c) => [...c, { role: "ai", text: generateAIResponse(userMsg, locationLabel) }]);
  };

  const togglePanel = (panel: "communicate") =>
    setActivePanel((p) => (p === panel ? null : panel));

  // Count hotspots per score for legend stats
  const hotspotCounts = generateHotspots(centerRef.current).reduce<Record<number, number>>(
    (acc, h) => { acc[h.score] = (acc[h.score] || 0) + 1; return acc; }, {}
  );

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Map */}
      <div ref={mapRef} className="map-container" />

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-text">CS</span>
        </div>

        <button
          className={`sidebar-btn ${activePanel === "communicate" ? "active" : ""}`}
          onClick={() => togglePanel("communicate")}
          title="Propose a change"
        >
          {/* Chat bubble */}
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </button>

        <button
          className={`sidebar-btn ${hotspotsVisible ? "active" : ""}`}
          onClick={() => setHotspotsVisible((v) => !v)}
          title="Toggle greenspace hotspots"
        >
          {/* Map layers */}
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
        </button>

        <button className="sidebar-btn" title="Analytics" onClick={() => {}}>
          {/* Bar chart */}
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </button>

        <div className="sidebar-spacer" />

        <Link href="/" className="sidebar-btn" title="Home">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
        </Link>
      </div>

      {/* ── Communicate panel ─────────────────────────────────────────────── */}
      <div className={`communicate-panel ${activePanel === "communicate" ? "open" : ""}`}>
        <div className="comm-header">
          <div>
            <h2 className="comm-title">Propose a Change</h2>
            <p className="comm-sub">Describe urban changes for {locationLabel}</p>
          </div>
          <button className="comm-close" onClick={() => setActivePanel(null)}>✕</button>
        </div>

        {/* Greens chip row */}
        <div className="comm-chips">
          {["Add greenspace", "Plant trees", "Convert parking", "Pedestrian zone", "Community garden"].map((chip) => (
            <button key={chip} className="comm-chip" onClick={() => setMessage(chip)}>
              {chip}
            </button>
          ))}
        </div>

        {/* Chat history */}
        <div className="comm-chat">
          {chat.length === 0 && (
            <div className="comm-empty">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} style={{ opacity: 0.3 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              <span>Describe a change you want to see in this area</span>
            </div>
          )}
          {chat.map((msg, i) => (
            <div key={i} className={`comm-msg ${msg.role}`}>
              {msg.role === "ai" && <span className="comm-msg-label">AI</span>}
              <p>{msg.text}</p>
            </div>
          ))}
          {aiTyping && (
            <div className="comm-msg ai">
              <span className="comm-msg-label">AI</span>
              <p className="typing-dots"><span /><span /><span /></p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form className="comm-input-row" onSubmit={handleSend}>
          <input
            type="text"
            className="comm-input"
            placeholder="e.g. Add a greenspace near the transit hub…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button type="submit" className="comm-send">→</button>
        </form>
      </div>

      {/* ── API: suitability + prediction (backend) ───────────────────────── */}
      <aside className="map-panel">
        <h2 className="map-panel-title">Green priority (API)</h2>
        <p className="map-panel-hint">
          Grid dots: dark green → red (mid) → light green by suitability score.
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
        {loadingGrid && <p className="map-panel-muted">Loading grid…</p>}
        <div className="map-panel-section">
          <h3 className="map-panel-sub">Top picks</h3>
          <ol className="map-top-list">
            {top.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={
                    selectedCellId === t.id ? "map-top-btn active" : "map-top-btn"
                  }
                  onClick={() => setSelectedCellId(t.id)}
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
            Select a grid dot, then run prediction (stub model).
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
            disabled={loadingPredict || !selectedCellId}
            onClick={runPredict}
          >
            {loadingPredict ? "Running…" : "Run prediction"}
          </button>
          {predictErr && <p className="map-panel-err">{predictErr}</p>}
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

      {/* ── Top search bar ────────────────────────────────────────────────── */}
      <div className="map-topbar" style={{ left: "calc(60px + 20px)", transform: "none", width: "min(640px, calc(100vw - 120px))" }}>
        <span className="map-logo">City<span>Scapes</span></span>
        <form className="map-search-form" onSubmit={handleSearch}>
          <div className="map-search">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              style={{ color: "rgba(232,220,200,0.35)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input type="text" placeholder="Search an address or place…" value={query}
              onChange={(e) => setQuery(e.target.value)} autoComplete="off" disabled={loading} />
            <button type="submit" className="map-search-submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "→"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Hotspot detail tooltip ────────────────────────────────────────── */}
      {selectedHotspot && (
        <div className="hotspot-detail">
          <div className="hotspot-detail-header">
            <span
              className="hotspot-score-badge"
              style={{ background: SCORE_CONFIG[selectedHotspot.score].color }}
            >
              Level {selectedHotspot.score} — {SCORE_CONFIG[selectedHotspot.score].label}
            </span>
            <button className="hotspot-close" onClick={() => setSelectedHotspot(null)}>✕</button>
          </div>
          <h3 className="hotspot-detail-name">{selectedHotspot.name}</h3>
          <p className="hotspot-detail-reason">{selectedHotspot.reason}</p>
          <div className="hotspot-factors">
            {selectedHotspot.factors.map((f) => (
              <span key={f} className="hotspot-factor-tag">{f}</span>
            ))}
          </div>
          <button
            className="hotspot-propose-btn"
            onClick={() => {
              setMessage(`Propose a greenspace at ${selectedHotspot.name}`);
              setActivePanel("communicate");
              setSelectedHotspot(null);
            }}
          >
            Propose change here →
          </button>
        </div>
      )}

      {/* ── Legend + stats ────────────────────────────────────────────────── */}
      {hotspotsVisible && (
        <div className="hs-legend">
          <p className="hs-legend-title">Greenspace Priority</p>
          {([5, 4, 3, 2, 1] as HotspotScore[]).map((s) => (
            <div key={s} className="hs-legend-row">
              <span className="hs-legend-dot" style={{ background: SCORE_CONFIG[s].color }} />
              <span className="hs-legend-label">{s} — {SCORE_CONFIG[s].label}</span>
              <span className="hs-legend-count">{hotspotCounts[s] ?? 0}</span>
            </div>
          ))}
          <div className="hs-legend-total">Total sites: {Object.values(hotspotCounts).reduce((a, b) => a + b, 0)}</div>
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div style={{ background: "#0f1f0f", width: "100vw", height: "100vh" }} />}>
      <MapContent />
    </Suspense>
  );
}
