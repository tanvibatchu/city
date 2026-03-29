export function cellsToGeoJSON(cells: Array<{
  id: string;
  lat: number;
  lng: number;
  score: number;
}>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature" as const,
      id: c.id,
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
      properties: { id: c.id, score: c.score },
    })),
  };
}
