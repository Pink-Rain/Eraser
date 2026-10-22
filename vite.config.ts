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

/**
 * Les fenêtres et menus Radix rendaient la page inerte en mettant `pointer-events: none` sur
 * <body> : tout le style de la page était recalculé à chaque ouverture et fermeture. Ils posent
 * maintenant un calque sous la fenêtre (lib/modal-blocker.ts), sans toucher au style de la page.
 */
const radixLayerPatches: Array<{ file: RegExp; find: string; replace: string }> = [
  {
    file: /@radix-ui[\\/]react-dismissable-layer[\\/]dist[\\/]index\.mjs$/,
    find: "var originalBodyPointerEvents;",
    replace: "var originalBodyPointerEvents;\nvar eraserBlocker = null;",
  },
  {
    file: /@radix-ui[\\/]react-dismissable-layer[\\/]dist[\\/]index\.mjs$/,
    find: "          originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;\n          ownerDocument.body.style.pointerEvents = \"none\";",
    replace: "          eraserBlocker = globalThis.__ERASER_BLOCK_OUTSIDE__ ?? null;\n          if (eraserBlocker) eraserBlocker.show(ownerDocument, node);\n          else {\n          originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;\n          ownerDocument.body.style.pointerEvents = \"none\";\n          }",
  },
  {
    file: /@radix-ui[\\/]react-dismissable-layer[\\/]dist[\\/]index\.mjs$/,
    find: "            ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;",
    replace: "            if (eraserBlocker) { eraserBlocker.hide(ownerDocument); eraserBlocker = null; }\n            else ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;",
  },
]

/**
 * Le salon en direct (chat, tabletop) prépare d'avance des connexions pair à pair : trystero en
 * créait vingt d'un coup en rejoignant un salon. Chacune coûte des dizaines de millisecondes sous
 * Windows : l'écran gelait 1,5 à 2 s au lancement d'Eraser, et encore à chaque changement de
 * salon. Elles sont maintenant préparées une à une, quand la page est au repos, et six suffisent
 * (une par joueur ; au-delà, trystero en crée une à l'arrivée du pair, comme avant).
 */
const trysteroPoolPatches: Array<{ file: RegExp; find: string; replace: string }> = [
  {
    file: /@trystero-p2p[\\/]core[\\/]dist[\\/]offer-pool\.mjs$/,
    find: "\t\talloc(poolSize, this.makeOffer).forEach((p) => this.push(p));\n\t\tthis.active = true;",
    replace: [
      "\t\tthis.active = true;",
      "\t\tconst eraserRound = this.eraserRound = (this.eraserRound ?? 0) + 1;",
      "\t\tconst eraserFill = (left) => {",
      "\t\t\tif (!this.active || this.eraserRound !== eraserRound || left <= 0) return;",
      "\t\t\tif (this.pool.length < 6) this.push(this.makeOffer());",
      "\t\t\tconst next = () => eraserFill(left - 1);",
      "\t\t\tif (typeof requestIdleCallback === \"function\") requestIdleCallback(next, { timeout: 3000 });",
      "\t\t\telse setTimeout(next, 60);",
      "\t\t};",
      "\t\teraserFill(6);",
    ].join("\n"),
  },
]

function eraserTrysteroPool(): Plugin {
  return {
    name: "eraser-trystero-pool",
    transform(code, id) {
      const path = id.split("?")[0]
      const patches = trysteroPoolPatches.filter((patch) => patch.file.test(path))
      if (!patches.length) return null
      let next = code
      for (const patch of patches) {
        if (!next.includes(patch.find)) {
          this.warn(`trystero a changé (${patch.find.slice(0, 60)}…) : ses connexions sont de nouveau préparées toutes d'un coup.`)
          return null
        }
        next = next.replace(patch.find, patch.replace)
      }
      return next
    },
  }
}

function eraserRadixLayers(): Plugin {
  return {
    name: "eraser-radix-layers",
    transform(code, id) {
      const path = id.split("?")[0]
      const patches = radixLayerPatches.filter((patch) => patch.file.test(path))
      if (!patches.length) return null
      let next = code
      for (const patch of patches) {
        if (!next.includes(patch.find)) {
          this.warn(`@radix-ui/react-dismissable-layer a changé (${patch.find.slice(0, 60)}…) : les fenêtres gardent pointer-events sur <body>.`)
          return null
        }
        next = next.replace(patch.find, patch.replace)
      }
      return next
    },
  }
}

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
    alias: [
      { find: "cloudflare:workers", replacement: resolve(process.cwd(), "desktop/runtime/cloudflare-workers.ts") },
      // <body> ne défile jamais chez Eraser : rien à retirer, et plus de recalcul de toute la page
      // à chaque fenêtre (lib/vendor/remove-scroll-bar.ts).
      { find: /^react-remove-scroll-bar$/, replacement: resolve(process.cwd(), "lib/vendor/remove-scroll-bar.ts") },
    ],
  },
  // Le React Compiler mémorise chaque composant et chaque calcul de rendu : un clic ne
  // redessine plus que ce qui a vraiment changé, sans memo/useMemo écrits à la main.
  plugins: [vinext(), babel({ presets: [reactCompilerPreset()] }), eraserVinextRouter(), eraserRadixLayers(), eraserTrysteroPool()],
});
