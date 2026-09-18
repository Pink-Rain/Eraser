import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function AdministrationPage() {
  redirect("/administration/comptes-et-roles")
}
