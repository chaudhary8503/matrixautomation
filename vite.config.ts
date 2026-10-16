import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Libraries that rarely change get their own long-cached chunks, so an app update doesn't make
// returning visitors download React & co. again. Only libraries the public pages use are named
// here; admin-only ones (supabase-js auth/storage, Radix) stay in the lazily loaded admin chunks.
const VENDOR_GROUPS = [
  { name: "vendor-react", test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
  { name: "vendor-query", test: /node_modules[\\/]@tanstack[\\/]/ },
  { name: "vendor-motion", test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
  { name: "vendor-db", test: /node_modules[\\/]@supabase[\\/]postgrest-js[\\/]/ },
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 8080 },
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: { codeSplitting: { groups: VENDOR_GROUPS } },
    },
  },
});
