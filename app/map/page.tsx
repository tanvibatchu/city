"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const KW_CENTER: [number, number] = [-80.5449, 43.4643];

function MapContent() {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let map: mapboxgl.Map | null = null;

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
                0,   "#1a2e1a",
                40,  "#1f3320",
                80,  "#2d1a14",
                150, "#3d2219",
              ],
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 0,
                12.05, ["get", "height"],
              ],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.9,
            },
          },
          "road-label"
        );
      });
    });

    return () => { map?.remove(); };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div ref={mapRef} className="map-container" />

      {/* Top bar */}
      <div className="map-topbar">
        <span className="map-logo">City<span>Scapes</span></span>

        <div className="map-search">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            style={{ color: "rgba(232,220,200,0.35)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
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
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Home
        </Link>
      </div>

      {/* Bottom location chip */}
      <div className="map-chip">
        <span className="map-chip-dot" />
        Kitchener–Waterloo · 3D Urban View
      </div>
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
