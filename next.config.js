/** @type {import('next').NextConfig} */
const nextConfig = { 
  reactStrictMode: true,
  // Port configuration handled via environment variables
  env: {
    PORT: process.env.PORT || '8080'
  },
  // Ensure we don't export static files
  trailingSlash: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  }
};
module.exports = nextConfig;