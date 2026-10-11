/**
 * Les portraits des créatures ont leur propre rangement (« creatures/<id>/portrait ») : le
 * token d'une créature est fait à partir de l'image importée là, et en garde l'identifiant.
 * Une colonne Fichier réglée « Rangement : portraits des créatures » importe ici.
 */

/** L'identifiant du portrait d'une créature (celui de son token) ; vide pour une autre image. */
export function creatureTokenId(portrait: string) {
  return portrait.match(/\/api\/resources\/creature-portraits\/([\w-]+)/)?.[1] || ""
}

/** Importe un portrait de créature ; un nouveau portrait garde l'identifiant de l'ancien (et son token). */
export async function uploadCreaturePortrait(file: File, previous: string) {
  const form = new FormData()
  form.set("file", file)
  const id = creatureTokenId(previous)
  if (id) form.set("id", id)
  const response = await fetch("/api/resources/creature-portraits", { method: "POST", body: form })
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !payload.url) throw new Error(payload.error || "Le portrait n’a pas pu être importé.")
  return payload.url
}
