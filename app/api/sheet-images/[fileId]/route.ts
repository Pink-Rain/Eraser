import { NextResponse } from "next/server"

import { verifyClassImageSignature } from "@/lib/class-image-signing"
import { downloadDriveFile } from "@/lib/google-drive"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params
  const signature = new URL(request.url).searchParams.get("sig") || ""
  if (
    !/^[A-Za-z0-9_-]+$/.test(fileId) ||
    !signature ||
    !(await verifyClassImageSignature(fileId, signature))
  ) {
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
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Image indisponible." }, { status: 502 })
  }
}
