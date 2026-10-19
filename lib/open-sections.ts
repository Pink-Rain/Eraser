/**
 * Les parties dépliées d'une page dont le contenu vient du serveur (`FoldSection` avec
 * `serverOpen`) : elles sont dans l'adresse (« ?ouvert=diagnostic,fichiers »), pour que le
 * serveur ne calcule que celles-là. Lu des deux côtés, d'où ce module à part.
 */
export const OPEN_SECTIONS_PARAM = "ouvert"

/** Les parties dépliées d'après l'adresse. */
export function openSectionsOf(value: string | string[] | undefined | null) {
  const raw = Array.isArray(value) ? value.join(",") : value ?? ""
  return new Set(raw.split(",").map((part) => part.trim()).filter(Boolean))
}
