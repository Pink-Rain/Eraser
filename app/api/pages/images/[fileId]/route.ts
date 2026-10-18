import { NextResponse } from "next/server"

import { canManagePages } from "@/lib/custom-pages"
import { readablePages } from "@/lib/custom-pages-server"
import { downloadDriveFile } from "@/lib/google-drive"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Une image du Drive posée sur une page (bloc Image, adresse de partage du Drive) : lue avec le
 * compte Google d'Eraser, ou, pour un fichier partagé « à tous » d'un autre Drive, par sa
 * vignette publique. Qui crée des pages (MJ, admin) la voit tout de suite, dès qu'il colle son
 * adresse ; un joueur ne voit que les images des pages qu'il peut lire.
 */
const allowed = new Map<string, { expiresAt: number; text: Promise<string> }>()

function readableText(account: NonNullable<Awaited<ReturnType<typeof authorizedAccount>>>) {
  const known = allowed.get(account.uid)
  if (known && known.expiresAt > Date.now()) return known.text
  const text = readablePages(account).then((pages) => pages.map(({ page }) => JSON.stringify(page.published ?? "")).join("\n")).catch(() => "")
  allowed.set(account.uid, { expiresAt: Date.now() + 120_000, text })
  return text
}

const imageHeaders = (contentType: string) => ({
  "content-type": contentType,
  "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
  "x-content-type-options": "nosniff",
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const { fileId } = await params
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  if (!canManagePages(account.role) && !(await readableText(account)).includes(fileId)) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  }

  try {
    const driveResponse = await downloadDriveFile(fileId).catch(() => null)
    const contentType = driveResponse?.headers.get("content-type") || ""
    if (driveResponse?.ok && contentType.startsWith("image/")) return new NextResponse(driveResponse.body, { headers: imageHeaders(contentType) })
    // Un fichier qu'Eraser ne peut pas lire avec son compte : sa vignette publique, s'il est partagé.
    const shared = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`, { redirect: "follow" })
    const sharedType = shared.headers.get("content-type") || ""
    if (shared.ok && sharedType.startsWith("image/")) return new NextResponse(shared.body, { headers: imageHeaders(sharedType) })
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  } catch {
    return NextResponse.json({ error: "Image indisponible." }, { status: 502 })
  }
}
