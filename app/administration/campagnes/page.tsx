import { redirect } from "next/navigation"

// La page a déménagé dans Ressources : les anciens liens y mènent toujours.
export default function MovedPage() {
  redirect("/ressources/index-des-campagnes")
}
