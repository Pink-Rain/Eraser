/**
 * Les FX des états : des effets visuels codés une fois, qu'on pose sur n'importe quel
 * effet (colonne « FX » de l'onglet Effets). Ils se colorent de la couleur de l'effet
 * quand il en a une. Ajouter un FX ici le rend disponible partout ; ceux d'une feuille
 * qui ne sont pas dans cette liste sont simplement ignorés.
 *
 * Ce fichier ne dépend de rien.
 */
export const stateFxList = [
  { value: "Pulsation", hint: "Un halo qui bat autour du portrait" },
  { value: "Aura", hint: "Une lueur douce autour du portrait" },
  { value: "Flammes", hint: "Des flammes qui montent du bas" },
  { value: "Givre", hint: "Du givre sur les bords" },
  { value: "Suintement", hint: "Des coulures qui descendent" },
  { value: "Tremblement", hint: "Le portrait tremble" },
  { value: "Flou", hint: "Le portrait devient flou" },
  { value: "Transparence", hint: "Le portrait s'estompe et scintille" },
  { value: "Désaturé", hint: "Le portrait passe en gris" },
  { value: "Spirale", hint: "Un tourbillon lent sur le portrait" },
  { value: "Brume", hint: "Une brume qui passe" },
  { value: "Coma", hint: "Tout passe en gris (l'apparence de la fiche à 0 PV)" },
  { value: "Mort", hint: "Tout passe en rouge sang (l'apparence de la fiche morte)" },
] as const

export type StateFx = (typeof stateFxList)[number]["value"]

const known = new Map(stateFxList.map((fx) => [fx.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), fx.value]))

/** Les FX d'une case (« Flammes, Pulsation »), réduits à ceux qu'Eraser sait dessiner. */
export function parseStateFx(value: string): StateFx[] {
  return [...new Set(value.split(/[,;\n]+/).flatMap((part) => {
    const fx = known.get(part.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
    return fx ? [fx] : []
  }))]
}
