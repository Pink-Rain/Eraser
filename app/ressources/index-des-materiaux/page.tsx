import { redirect } from "next/navigation"

// Runes, attributs et matériaux sont réunis dans « Armes - Modificateurs » : l'ancienne
// adresse (favoris, liens écrits dans un texte) mène à la nouvelle page.
export default function Page() {
  redirect("/ressources/armes-modificateurs")
}
