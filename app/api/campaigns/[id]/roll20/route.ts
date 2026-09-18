import { NextResponse } from "next/server"

import { deleteRoll20Link, getRoll20LinkForManager, rotateRoll20Link } from "@/lib/roll20-bridge"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  const link = await getRoll20LinkForManager(account, id)
  return NextResponse.json({ link })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  try {
    return NextResponse.json(await rotateRoll20Link(account, id))
  } catch {
    return NextResponse.json({ error: "La liaison Roll20 n’a pas pu être créée." }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  try {
    await deleteRoll20Link(account, id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "La liaison Roll20 n’a pas pu être supprimée." }, { status: 400 })
  }
}
