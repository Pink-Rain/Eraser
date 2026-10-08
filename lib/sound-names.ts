/** Les sons d'Eraser et leur fichier dans le dossier Drive « Sons ». Sans dépendance : la page s'en sert aussi. */
export const soundFileNames = {
  levelup: "levelup.mp3",
  choixsort: "choixsort.mp3",
  equiperitem: "equiperitem.mp3",
  desequiperitem: "desequiperitem.mp3",
  notifrecevoirobjet: "notifrecevoirobjet.mp3",
} as const

export type SoundName = keyof typeof soundFileNames

export function isSoundName(value: string): value is SoundName {
  return Object.hasOwn(soundFileNames, value)
}
