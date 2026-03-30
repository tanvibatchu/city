import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['deck.gl', '@deck.gl/core', '@deck.gl/mapbox', '@deck.gl/mesh-layers', '@luma.gl/core'],
};

export default nextConfig;
