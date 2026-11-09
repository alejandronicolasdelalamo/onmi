/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:5000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "avatars/*.gif"],
      manifest: {
        name: "ONMi",
        short_name: "ONMi",
        description: "Notes, habits, projects and focus time in one place.",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        id: "/",
        categories: ["productivity", "lifestyle"],
        start_url: "/",
        shortcuts: [
          {
            name: "Habits",
            url: "/habits",
            icons: [{ src: "icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Calendar",
            url: "/calendar",
            icons: [{ src: "icon-192.png", sizes: "192x192" }],
          },
        ],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/docs": { target: API_TARGET, changeOrigin: true },
      "/db-admin": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("victory-vendor")
          )
            return "charts";
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("micromark") ||
            id.includes("mdast") ||
            id.includes("unified")
          )
            return "markdown";
          if (id.includes("@dnd-kit")) return "dnd";
          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id,
            )
          )
            return "react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
