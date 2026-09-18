import { NextResponse } from "next/server"

import { getDb } from "@/db"
import { classIndex } from "@/db/schema"
import { googleDriveFileId } from "@/lib/class-images"
import { downloadDriveFile } from "@/lib/google-drive"
import { authorizedAccount } from "@/lib/server-auth"

let imageAllowlistCache: { expiresAt: number; fileIds: Set<string> } | null = null
let imageAllowlistPromise: Promise<Set<string>> | null = null

async function classImageFileIds() {
  if (imageAllowlistCache && imageAllowlistCache.expiresAt > Date.now()) {
    return imageAllowlistCache.fileIds
  }
  if (!imageAllowlistPromise) {
    imageAllowlistPromise = getDb().select({ image: classIndex.image }).from(classIndex)
      .then((classes) => new Set(classes.map((item) => googleDriveFileId(item.image)).filter(Boolean) as string[]))
      .then((fileIds) => {
        imageAllowlistCache = { fileIds, expiresAt: Date.now() + 60_000 }
        return fileIds
      })
      .finally(() => {
        imageAllowlistPromise = null
      })
  }
  return imageAllowlistPromise
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const { fileId } = await params
  if (!/^[A-Za-z0-9_-]+$/.test(fileId) || !(await classImageFileIds()).has(fileId)) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  }

  try {
    const driveResponse = await downloadDriveFile(fileId)
    const contentType = driveResponse.headers.get("content-type") || ""
    if (!driveResponse.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
    }
    return new NextResponse(driveResponse.body, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Image indisponible." }, { status: 502 })
  }
}
