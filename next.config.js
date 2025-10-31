/** @type {import('next').NextConfig} */
const nextConfig = { 
  reactStrictMode: true,
  // Port configuration handled via environment variables
  env: {
    PORT: process.env.PORT || '8080'
  }
};
module.exports = nextConfig;