/**
 * Petits sons d'Eraser : le passage de rang, le sort choisi, l'objet équipé, l'objet reçu.
 * Ils viennent du dossier Drive « Sons » (levelup.mp3…), chargés une fois puis gardés ;
 * tant qu'un fichier manque (ou que Google ne répond pas), le son synthétisé d'origine le
 * remplace. Discrets, et coupables : la préférence est gardée dans ce navigateur.
 *
 * Un volume général (50 % par défaut) passe sur tous les sons ; il est gardé sur cet
 * ordinateur et survit à la fermeture d'Eraser.
 */
import type { SoundName } from "@/lib/sound-names"

const SOUND_PREFERENCE = "eraser:sounds"
const VOLUME_PREFERENCE = "eraser:volume"
export const DEFAULT_SOUND_VOLUME = 0.5
/** Prévenu quand le volume change (curseur, autre fenêtre) : les lecteurs audio s'y règlent. */
export const SOUND_VOLUME_EVENT = "eraser:volume"

/** Le volume général, de 0 à 1. */
export function soundVolume() {
  try {
    const stored = window.localStorage.getItem(VOLUME_PREFERENCE)
    const value = stored === null ? DEFAULT_SOUND_VOLUME : Number(stored)
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_SOUND_VOLUME
  } catch { return DEFAULT_SOUND_VOLUME }
}

export function setSoundVolume(volume: number) {
  const value = Math.max(0, Math.min(1, Math.round(volume * 100) / 100))
  try { window.localStorage.setItem(VOLUME_PREFERENCE, String(value)) } catch { /* stockage indisponible */ }
  if (master) master.gain.value = value
  window.dispatchEvent(new CustomEvent(SOUND_VOLUME_EVENT, { detail: value }))
}

// Une autre fenêtre d'Eraser a changé le volume : celle-ci suit.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== VOLUME_PREFERENCE) return
    const value = soundVolume()
    if (master) master.gain.value = value
    window.dispatchEvent(new CustomEvent(SOUND_VOLUME_EVENT, { detail: value }))
  })
}

export function soundsEnabled() {
  try { return window.localStorage.getItem(SOUND_PREFERENCE) !== "off" } catch { return true }
}

export function setSoundsEnabled(enabled: boolean) {
  try { window.localStorage.setItem(SOUND_PREFERENCE, enabled ? "on" : "off") } catch { /* stockage indisponible */ }
}

let context: AudioContext | null = null
/** Tous les sons passent par lui : c'est le volume général. */
let master: GainNode | null = null

function audio() {
  if (typeof window === "undefined" || !soundsEnabled()) return null
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  context ??= new Context()
  if (!master) {
    master = context.createGain()
    master.gain.value = soundVolume()
    master.connect(context.destination)
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined)
  return context
}

/** La sortie des sons : le volume général, puis les haut-parleurs. */
const output = (ctx: AudioContext) => master ?? ctx.destination

// Les fichiers des sons, décodés une fois. Un échec est oublié au bout d'une minute.
const decoded = new Map<SoundName, Promise<AudioBuffer | null>>()

function loadSound(ctx: AudioContext, name: SoundName) {
  let promise = decoded.get(name)
  if (!promise) {
    promise = fetch(`/api/sounds/${name}`, { cache: "force-cache" })
      .then(async (response) => response.ok ? await ctx.decodeAudioData(await response.arrayBuffer()) : null)
      .catch(() => null)
    decoded.set(name, promise)
    void promise.then((buffer) => { if (!buffer) window.setTimeout(() => { if (decoded.get(name) === promise) decoded.delete(name) }, 60_000) })
  }
  return promise
}

/** Charge les sons à l'avance : le premier ne part pas en retard. */
export function preloadSounds(names: SoundName[]) {
  const ctx = audio()
  if (!ctx) return
  for (const name of names) void loadSound(ctx, name)
}

/**
 * Joue le fichier du son ; s'il n'est pas prêt assez vite, ou introuvable, le son de
 * secours (synthétisé) le remplace. Un son en retard n'est jamais joué après coup.
 */
function playFile(name: SoundName, fallback: (ctx: AudioContext) => void, volume = 0.8) {
  const ctx = audio()
  if (!ctx) return
  let settled = false
  const timer = window.setTimeout(() => { if (!settled) { settled = true; fallback(ctx) } }, 700)
  void loadSound(ctx, name).then((buffer) => {
    if (settled) return
    settled = true
    window.clearTimeout(timer)
    if (!buffer) { fallback(ctx); return }
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.buffer = buffer
    source.connect(gain).connect(output(ctx))
    source.start()
  })
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
  oscillator.connect(gain).connect(output(ctx))
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

/** Un essai du volume, au réglage du curseur. */
export function playVolumePreview() {
  playFile("equiperitem", (ctx) => {
    const now = ctx.currentTime + 0.01
    note(ctx, 880, now, 0.12, 0.05, "triangle")
    note(ctx, 1174.66, now + 0.05, 0.18, 0.04, "triangle")
  })
}

/** Le passage de rang (levelup.mp3) ; à défaut, un carillon montant, un peu scintillant. */
export function playSpellChoiceChime() {
  playFile("levelup", chime)
}

function chime(ctx: AudioContext) {
  const now = ctx.currentTime + 0.02
  ;[659.25, 783.99, 987.77, 1318.51].forEach((frequency, index) => {
    note(ctx, frequency, now + index * 0.085, 0.9, 0.05, "triangle")
    note(ctx, frequency * 2, now + index * 0.085 + 0.01, 0.5, 0.012, "sine")
  })
}

/** Le sort choisi, rang terminé (choixsort.mp3) ; à défaut, un petit son de validation. */
export function playSpellChosen() {
  playFile("choixsort", validation)
}

function validation(ctx: AudioContext) {
  const now = ctx.currentTime + 0.01
  note(ctx, 523.25, now, 0.35, 0.05, "triangle")
  note(ctx, 783.99, now + 0.07, 0.6, 0.05, "triangle")
}

/** Un objet équipé (equiperitem.mp3) ; à défaut, un petit déclic. */
export function playItemEquipped() {
  playFile("equiperitem", (ctx) => {
    const now = ctx.currentTime + 0.01
    note(ctx, 880, now, 0.12, 0.05, "triangle")
    note(ctx, 1174.66, now + 0.05, 0.18, 0.04, "triangle")
  })
}

/** Un objet déséquipé (desequiperitem.mp3) ; à défaut, un petit déclic descendant. */
export function playItemUnequipped() {
  playFile("desequiperitem", (ctx) => {
    const now = ctx.currentTime + 0.01
    note(ctx, 1174.66, now, 0.12, 0.04, "triangle")
    note(ctx, 783.99, now + 0.05, 0.18, 0.04, "triangle")
  })
}

/** Un objet reçu (notifrecevoirobjet.mp3) ; à défaut, « ploup ploup » : deux bulles qui montent. */
export function playItemReceived() {
  playFile("notifrecevoirobjet", bubbles)
}

function bubbles(ctx: AudioContext) {
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
    oscillator.connect(gain).connect(output(ctx))
    oscillator.start(now + offset)
    oscillator.stop(now + offset + 0.2)
  })
}
