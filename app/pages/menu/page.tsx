import { redirect } from "next/navigation"

import { MENU_EDITOR_HREF } from "@/lib/app-menu"

export const dynamic = "force-dynamic"

/** L'ancienne adresse de l'éditeur du menu : il vit dans l'extension Eraser Page. */
export default function MenuEditorMovedPage() {
  redirect(MENU_EDITOR_HREF)
}
