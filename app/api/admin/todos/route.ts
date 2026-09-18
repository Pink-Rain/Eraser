import { NextResponse } from "next/server"

import { createAdminTodo, listAdminTodos, softDeleteItem, updateAdminTodo } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ todos: await listAdminTodos({ creatorUid: admin.uid, creatorName: admin.displayName || admin.email }) })
}

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, string>
    const todo = await createAdminTodo({
      creatorUid: admin.uid, creatorName: admin.displayName || admin.email,
      name: body.name || "", content: body.content || "",
      priority: body.priority === "haute" || body.priority === "basse" ? body.priority : "moyenne",
      label: body.label || "", labelColor: body.labelColor || "#927640",
    })
    return NextResponse.json({ todo })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "INVALID_TODO_CONTENT" ? "Le contenu est obligatoire." : "La to-do n’a pas pu être créée." }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { id?: string; patch?: Record<string, string> }
    if (!body.id || !body.patch) throw new Error("INVALID_TODO")
    const todo = await updateAdminTodo(body.id, body.patch)
    return NextResponse.json({ todo })
  } catch {
    return NextResponse.json({ error: "La to-do n’a pas pu être modifiée." }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "To-do introuvable." }, { status: 400 })
  await softDeleteItem("todo", id)
  return NextResponse.json({ ok: true })
}
