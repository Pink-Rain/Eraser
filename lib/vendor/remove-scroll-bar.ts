/**
 * À la place de react-remove-scroll-bar (vite.config.ts) : à chaque fenêtre ou menu Radix, il
 * mesurait le style de <body> puis lui ajoutait marges, variable CSS et `position: relative`, ce
 * qui faisait recalculer le style de toute la page, à l'ouverture comme à la fermeture. Chez
 * Eraser, <body> ne défile jamais (seul le bloc de contenu de la coque défile) : il n'y a pas de
 * barre de défilement à retirer. Le blocage de la molette derrière la fenêtre, lui, reste fait par
 * react-remove-scroll.
 */
export { zeroRightClassName, fullWidthClassName, noScrollbarsClassName, removedBarSizeVariable } from "react-remove-scroll-bar/constants"

export function getGapWidth() {
  return { left: 0, top: 0, right: 0, gap: 0 }
}

export function RemoveScrollBar() {
  return null
}
