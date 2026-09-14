/**
 * Vite cho kiến trúc NHIỀU TRANG: mọi file .html trong frontend/ (trừ dist, node_modules) là một điểm vào.
 * Thêm trang mới = thêm file HTML + file TS cùng tên, không cần sửa file này.
 * Dev: proxy /api -> backend (cùng origin => cookie phiên hoạt động, không cần CORS đặc biệt).
 */
import { defineConfig } from "vite";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const pages = globSync("**/*.html", { cwd: root, exclude: (p) => p.startsWith("node_modules") || p.startsWith("dist") });
const input = Object.fromEntries(pages.map((p) => [p.replace(/\.html$/, "").replace(/[\\/]/g, "_"), resolve(root, p)]));

export default defineConfig({
  root,
  appType: "mpa",
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input } },
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_ORIGIN ?? "http://localhost:3000", changeOrigin: false } },
  },
});
