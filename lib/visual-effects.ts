/**
 * Les effets visuels d'Eraser : complets (animations des états sur la fiche, flous, glissade
 * de la barre latérale) ou allégés, pour qu'un portable modeste reste fluide. « Automatique »
 * les allège sur un ordinateur à quatre cœurs ou moins. Le choix est gardé sur cet ordinateur ;
 * il pose `data-effects="light"` sur <html>, que app/globals.css lit.
 */
export type EffectsPreference = "auto" | "full" | "light"

const EFFECTS_PREFERENCE = "eraser:effects"
/** Prévenu quand le réglage change (ici ou dans une autre fenêtre). */
export const EFFECTS_EVENT = "eraser:effects"

export const effectsChoices: Array<{ value: EffectsPreference; label: string }> = [
  { value: "auto", label: "Automatique" },
  { value: "full", label: "Complets" },
  { value: "light", label: "Allégés" },
]

export function effectsPreference(): EffectsPreference {
  try {
    const stored = window.localStorage.getItem(EFFECTS_PREFERENCE)
    return stored === "full" || stored === "light" ? stored : "auto"
  } catch { return "auto" }
}

/** Un ordinateur modeste : quatre cœurs ou moins, ou quatre Go de mémoire ou moins. */
export function modestComputer() {
  const cores = navigator.hardwareConcurrency || 8
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  return cores <= 4 || memory <= 4
}

export function effectsAreLight(preference = effectsPreference()) {
  return preference === "light" || (preference === "auto" && modestComputer())
}

export function applyEffects() {
  if (effectsAreLight()) document.documentElement.dataset.effects = "light"
  else delete document.documentElement.dataset.effects
}

export function setEffectsPreference(preference: EffectsPreference) {
  try {
    if (preference === "auto") window.localStorage.removeItem(EFFECTS_PREFERENCE)
    else window.localStorage.setItem(EFFECTS_PREFERENCE, preference)
  } catch { /* stockage indisponible : le choix vaut pour cette fenêtre */ }
  applyEffects()
  window.dispatchEvent(new CustomEvent(EFFECTS_EVENT))
}

// Une autre fenêtre d'Eraser a changé le réglage : celle-ci suit.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== EFFECTS_PREFERENCE) return
    applyEffects()
    window.dispatchEvent(new CustomEvent(EFFECTS_EVENT))
  })
}

/**
 * Le même réglage, appliqué avant le premier affichage (script en tête de page) : une fiche
 * allégée ne commence pas par animer ses états. Doit rester identique à `applyEffects`.
 */
export const applyEffectsScript = `try{var p=localStorage.getItem(${JSON.stringify(EFFECTS_PREFERENCE)});var n=navigator,c=n.hardwareConcurrency||8,m=n.deviceMemory||8;if(p==="light"||(p!=="full"&&(c<=4||m<=4)))document.documentElement.dataset.effects="light"}catch(e){}`
