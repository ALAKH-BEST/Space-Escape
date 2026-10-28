import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Builds for game portals (`--mode crazygames` or `--mode poki`).
 *
 * The portal serves the folder from its own CDN inside an iframe, and its rules do not
 * allow our own ads, analytics or other third-party requests. So this build removes
 * those from the page, adds the portal's SDK, and the game runs without accounts or a
 * server (see client/src/lib/portal.ts). The normal build and deploy are untouched.
 */
const SDK_SCRIPTS = {
  crazygames: "https://sdk.crazygames.com/crazygames-sdk-v3.js",
  poki: "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
} as const;

type Target = keyof typeof SDK_SCRIPTS;

const FORBIDDEN = /googletagmanager|googlesyndication|googleapis|gstatic|google-analytics/;

function portalHtml(target: Target): Plugin {
  return {
    name: "portal-html",
    // "pre" so the font module added below is bundled by Vite like any other entry script.
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const cleaned = html
          .replace(/<link[^>]*(?:fonts\.googleapis|fonts\.gstatic)[^>]*>\s*/g, "")
          .replace(/<script[^>]*(?:googletagmanager|googlesyndication)[^>]*><\/script>\s*/g, "")
          .replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>\s*/g, "")
          .replace(
            "</head>",
            `    <script src="${SDK_SCRIPTS[target]}"></script>\n    <script type="module" src="/src/lib/portal-fonts.ts"></script>\n  </head>`,
          );
        if (FORBIDDEN.test(cleaned)) {
          throw new Error("Portal build still references a third-party ad, analytics or font host in index.html");
        }
        return cleaned;
      },
    },
  };
}

/** The Google Fonts @import in index.css is replaced by bundled font files (client/src/lib/portal-fonts.ts, added to the page above). */
function portalCss(): Plugin {
  return {
    name: "portal-css",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith("/client/src/index.css")) return null;
      const stripped = code.replace(/@import url\(['"]https:\/\/fonts\.googleapis\.com[^)]*\);?\s*/g, "");
      if (FORBIDDEN.test(stripped)) throw new Error("Portal build still imports a remote font from index.css");
      return stripped;
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode !== "crazygames" && mode !== "poki") {
    throw new Error("Use --mode crazygames or --mode poki (see the build:crazygames and build:poki scripts).");
  }
  return {
    plugins: [react(), portalHtml(mode), portalCss()],
    root: path.resolve(import.meta.dirname, "client"),
    base: "./",
    define: { "import.meta.env.VITE_PORTAL": JSON.stringify(mode) },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "portal-build", mode),
      emptyOutDir: true,
    },
  };
});
