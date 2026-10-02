/**
 * Petits sons d'Eraser, synthétisés sur place (aucun fichier à télécharger) : le
 * carillon d'un nouveau sort à choisir, le « ploup ploup » d'un objet reçu. Discrets,
 * et coupables : la préférence est gardée dans ce navigateur.
 */

const SOUND_PREFERENCE = "eraser:sounds"

export function soundsEnabled() {
  try { return window.localStorage.getItem(SOUND_PREFERENCE) !== "off" } catch { return true }
}

export function setSoundsEnabled(enabled: boolean) {
  try { window.localStorage.setItem(SOUND_PREFERENCE, enabled ? "on" : "off") } catch { /* stockage indisponible */ }
}

let context: AudioContext | null = null

function audio() {
  if (typeof window === "undefined" || !soundsEnabled()) return null
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  context ??= new Context()
  if (context.state === "suspended") void context.resume().catch(() => undefined)
  return context
}

/** Une note douce : attaque courte, extinction en douceur. */
function note(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

/** Carillon montant, un peu scintillant : trois sorts se présentent. */
export function playSpellChoiceChime() {
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime + 0.02
  ;[659.25, 783.99, 987.77, 1318.51].forEach((frequency, index) => {
    note(ctx, frequency, now + index * 0.085, 0.9, 0.05, "triangle")
    note(ctx, frequency * 2, now + index * 0.085 + 0.01, 0.5, 0.012, "sine")
  })
}

/** Petit son de validation quand un sort est choisi. */
export function playSpellChosen() {
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime + 0.01
  note(ctx, 523.25, now, 0.35, 0.05, "triangle")
  note(ctx, 783.99, now + 0.07, 0.6, 0.05, "triangle")
}

/** « Ploup ploup » : deux bulles qui montent, pour un objet reçu. */
export function playItemReceived() {
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime + 0.01
  ;[0, 0.13].forEach((offset, index) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = "sine"
    const base = index ? 520 : 380
    oscillator.frequency.setValueAtTime(base, now + offset)
    oscillator.frequency.exponentialRampToValueAtTime(base * 2.1, now + offset + 0.09)
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now + offset)
    oscillator.stop(now + offset + 0.2)
  })
}
