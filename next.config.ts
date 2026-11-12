import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let other devices on the LAN load dev JS/HMR (otherwise the page never hydrates)
  allowedDevOrigins: ["192.168.*.*", "oneroot-erp-backend-d48g.onrender.com"],
  experimental: {
    agentFeedback: true,
    // Next.js upgrade agent: security fixes only
    agentUpgrade: "security",
    // ERP pages fetch their data in the browser after sign-in, so only validate segments
    // that explicitly opt in with `export const instant` (stops dev-overlay errors on every page)
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  // Shareable attachment links (https://erp.oneroot.farm/files/<id>.jpg?exp=…&sig=…) are served by the API
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");
    return [{ source: "/files/:name", destination: `${api}/attachments/public/:name` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
        // Not next/font's generated CSS: on Vercel its font URLs carry a query the Tailwind loader breaks
        condition: { not: { path: /internal\/font\// } },
      },
    },
  },
};

export default nextConfig;
