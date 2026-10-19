import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * Retouches du routeur de vinext 0.0.50 (navigateur seulement), faites à la compilation :
 *
 * - il garde chaque page visitée 5 minutes dans une table privée et ne sait que tout oublier :
 *   la table devient accessible (`__ERASER_VISITED_PAGES__`) pour n'oublier que la page où l'on
 *   vient d'écrire, et dure 30 minutes. Une page revue s'affiche tout de suite, puis se relit en
 *   arrière-plan (lib/navigation-cache.ts) ;
 * - il rangeait chaque page sous la page d'où l'on venait (« contexte d'interception », qui ne
 *   sert qu'aux routes interceptées de Next.js, qu'Eraser n'a pas) : une page vue en venant de
 *   l'accueil n'était jamais resservie en venant d'ailleurs, ni préchargée pour un autre départ.
 *   Chaque page a maintenant une seule copie.
 *
 * Si vinext change, rien n'est modifié et la compilation le signale.
 */
const vinextRouterPatches: Array<{ file: RegExp; find: string; replace: string }> = [
  {
    file: /vinext[\\/]dist[\\/]server[\\/]app-browser-entry\.js$/,
    find: "const VISITED_RESPONSE_CACHE_TTL = 5 * 6e4;",
    replace: "const VISITED_RESPONSE_CACHE_TTL = 30 * 6e4;",
  },
  {
    file: /vinext[\\/]dist[\\/]server[\\/]app-browser-entry\.js$/,
    find: "const visitedResponseCache = /* @__PURE__ */ new Map();",
    replace: "const visitedResponseCache = /* @__PURE__ */ new Map();\nif (typeof window !== \"undefined\") window.__ERASER_VISITED_PAGES__ = visitedResponseCache;",
  },
  {
    file: /vinext[\\/]dist[\\/]server[\\/]app-browser-entry\.js$/,
    find: "function getRequestState(navigationKind, previousNextUrlOverride) {",
    replace: "function getRequestState(navigationKind, previousNextUrlOverride) {\n\treturn { ...vinextRequestState(navigationKind, previousNextUrlOverride), interceptionContext: null };\n}\nfunction vinextRequestState(navigationKind, previousNextUrlOverride) {",
  },
  {
    file: /vinext[\\/]dist[\\/]shims[\\/]navigation\.js$/,
    find: "function getCurrentInterceptionContext() {\n\tif (isServer) return null;",
    replace: "function getCurrentInterceptionContext() {\n\treturn null;",
  },
]

function eraserVinextRouter(): Plugin {
  return {
    name: "eraser-vinext-router",
    transform(code, id) {
      const path = id.split("?")[0]
      const patches = vinextRouterPatches.filter((patch) => patch.file.test(path))
      if (!patches.length) return null
      let next = code
      for (const patch of patches) {
        if (!next.includes(patch.find)) {
          this.warn(`vinext a changé (${patch.find.slice(0, 60)}…) : cette retouche du routeur n'est pas faite (lib/navigation-cache.ts retombe sur l'oubli complet).`)
          continue
        }
        next = next.replace(patch.find, patch.replace)
      }
      return next
    },
  }
}

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  resolve: {
    alias: {
      "cloudflare:workers": resolve(
        process.cwd(),
        "desktop/runtime/cloudflare-workers.ts",
      ),
    },
  },
  // Le React Compiler mémorise chaque composant et chaque calcul de rendu : un clic ne
  // redessine plus que ce qui a vraiment changé, sans memo/useMemo écrits à la main.
  plugins: [vinext(), babel({ presets: [reactCompilerPreset()] }), eraserVinextRouter()],
});
