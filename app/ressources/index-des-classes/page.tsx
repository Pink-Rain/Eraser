import { redirect } from "next/navigation"

/** Ancienne adresse de « Sorts des classes » : la page s'appelle désormais « Création de classe ». */
export default function LegacyClassIndexPage() {
  redirect("/creation-de-classe")
}
