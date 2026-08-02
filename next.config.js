const withPWA = require("@ducanh2912/next-pwa").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

module.exports = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  skipWaiting: true,
  clientsClaim: true,
  workboxOptions: {
    exclude: [/apple-touch-icon/, /apple-icon/, /rehab-icon/, /favicon/],
  },
})(nextConfig);
