"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const KW_CENTER: [number, number] = [-80.5449, 43.4643];

async function geocode(query: string): Promise<[number, number] | null> {
  if (!query.trim() || !MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi,neighborhood,place&limit=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    return [feature.center[0], feature.center[1]];
  } catch {
    return null;
  }
}

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let map: mapboxgl.Map | null = null;
    let rafId = 0;

    import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.default.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/standard",
        config: {
          basemap: {
            lightPreset: "night", // dark navy ground, deep shadows
          },
        },
        center: KW_CENTER,
        zoom: 15.5,
        pitch: 62,
        bearing: -17.6,
        antialias: true,
      });

      // Use 'style.load' as per official docs — fires after style fully loads
      map.on("style.load", () => {
        if (!map) return;

        // Find first symbol layer that has text — insert buildings just below it
        // so road/place labels remain visible on top of buildings
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(
          (layer) =>
            layer.type === "symbol" &&
            (layer.layout as Record<string, unknown>)?.["text-field"]
        )?.id;

        // Standard style has no "composite" source; add Streets v8 for the building layer.
        const buildingsSourceId = "cityscapes-streets-v8";
        if (!map.getSource(buildingsSourceId)) {
          map.addSource(buildingsSourceId, {
            type: "vector",
            url: "mapbox://mapbox.mapbox-streets-v8",
          });
        }

        map.addLayer(
          {
            id: "add-3d-buildings",
            source: buildingsSourceId,
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              // Terracotta/rust tones matching the reference night-mode image
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["get", "height"],
                0,   "#2a1410",
                20,  "#4a2817",
                60,  "#6b3c24",
                130, "#8b5030",
                250, "#9b5e38",
              ],
              // Smooth pop-in as user zooms past 15 — exactly per the docs
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "height"],
              ],
              // Also interpolate base so buildings grow from the ground up
              "fill-extrusion-base": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "min_height"],
              ],
              "fill-extrusion-opacity": 0.85,
            },
          },
          labelLayerId // insert below label layer
        );

        // Slow cinematic auto-rotate for the hero background
        let angle = -17.6;
        const rotate = () => {
          angle += 0.03;
          map?.setBearing(angle);
          rafId = requestAnimationFrame(rotate);
        };
        rotate();
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      map?.remove();
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) { router.push("/map"); return; }
    setLoading(true);
    const coords = await geocode(query);
    setLoading(false);
    if (coords) {
      router.push(
        `/map?q=${encodeURIComponent(query)}&lng=${coords[0]}&lat=${coords[1]}`
      );
    } else {
      router.push(`/map?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div ref={mapRef} className="map-container" />
      <div className="home-vignette" />
      <div className="home-overlay">
        <h1 className="hero-title">CityScapes</h1>
        <p className="hero-sub">
          Visualize the future of your city.<br />
          Powered by AI &amp; real-world urban data.
        </p>
        <form className="hero-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Enter an address or neighbourhood…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
          <button type="submit" aria-label="Search" disabled={loading}>
            {loading ? <span className="spinner" /> : "→"}
          </button>
        </form>
      </div>
    </div>
  );
}
