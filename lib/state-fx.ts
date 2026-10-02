/**
 * Les FX des états : des effets visuels codés une fois, qu'on pose sur n'importe quel
 * effet (colonne « FX » de l'onglet Effets). Ils se colorent de la couleur de l'effet
 * quand il en a une. Ajouter un FX ici le rend disponible partout ; ceux d'une feuille
 * qui ne sont pas dans cette liste sont simplement ignorés.
 *
 * Ce fichier ne dépend de rien.
 */
export const stateFxList = [
  { value: "Pulsation", hint: "Une lueur qui bat sur place, depuis les bords" },
  { value: "Flammes", hint: "Des flammes qui montent du bas, des braises qui s'envolent" },
  { value: "Givre", hint: "Du givre et des éclats sur les bords" },
  { value: "Dégoulinant", hint: "Un liquide épais qui coule du haut et tombe en gouttes" },
  { value: "Suintement", hint: "Des pustules qui gonflent, pullulent et crèvent sur les bords (maladie)" },
  { value: "Tremblement", hint: "Ça tremble" },
  { value: "Flou", hint: "Ça devient flou (léger sur la page entière)" },
  { value: "Transparence", hint: "Ça s'estompe et scintille" },
  { value: "Désaturé", hint: "Ça passe en gris" },
  { value: "Spirale", hint: "Une spirale qui s'enroule et tourne" },
  { value: "Rayons", hint: "Des rayons qui tournent lentement" },
  { value: "Brume", hint: "Des nappes de brume qui dérivent" },
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
