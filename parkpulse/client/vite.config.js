import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Only PORT is read from the repo's .env, so the dev proxy finds the API server.
  // Nothing from .env is sent to the browser.
  const { PORT } = loadEnv(mode, "..", "PORT");

  return {
    plugins: [react()],
    server: {
      proxy: { "/api": `http://localhost:${PORT || 3001}` },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.js"],
      restoreMocks: true,
    },
  };
});
