import { NextResponse } from "next/server"

import { listClassSpells } from "@/lib/class-content"
import { googleFailureMessage } from "@/lib/google-failures"
import { listClasses } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { withTimeBudget } from "@/lib/time-budget"

const codeOf = (error: unknown) => error instanceof Error ? error.message : "UNKNOWN_ERROR"

export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  // `?only=classes` : la liste des classes seule, sans attendre la lecture (lourde) des sorts ;
  // la fiche s'en sert pour proposer le choix de classe tout de suite.
  if (new URL(request.url).searchParams.get("only") === "classes") {
    try {
      return NextResponse.json({ classes: await withTimeBudget(listClasses(), 25_000, "CLASSES_READ_TIMEOUT") })
    } catch (error) {
      console.error("CHARACTER_CLASS_LIST_LOAD_FAILED", codeOf(error))
      return NextResponse.json({ error: googleFailureMessage(codeOf(error)) || `Les classes n’ont pas pu être lues dans Google Sheets (${codeOf(error)}).` }, { status: 503 })
    }
  }
  try {
    const data = await withTimeBudget(listClassSpells(), 25_000, "CLASSES_READ_TIMEOUT")
    // Une fiche retient l'ID des sorts choisis : un sort encore sans ID (désigné par sa
    // place, « LIGNE-n », qui glisse) n'est pas proposé tant qu'il n'en a pas reçu un.
    return NextResponse.json({ classes: data.classes, spells: data.spells.filter((spell) => !spell.id.startsWith("LIGNE-")) })
  } catch (error) {
    console.error("CHARACTER_CLASS_CATALOG_LOAD_FAILED", codeOf(error))
    // Les sorts sont illisibles : la fiche peut tout de même choisir une classe.
    try {
      const classes = await withTimeBudget(listClasses(), 15_000, "CLASSES_READ_TIMEOUT")
      if (classes.length) return NextResponse.json({ classes, spells: [], warning: "Les sorts de classe sont momentanément indisponibles." })
    } catch (fallback) {
      console.error("CHARACTER_CLASS_LIST_FALLBACK_FAILED", codeOf(fallback))
    }
    const reason = googleFailureMessage(codeOf(error))
    return NextResponse.json({ error: reason || `Les classes et leurs sorts n’ont pas pu être lus dans Google Sheets (${codeOf(error)}).` }, { status: 503 })
  }
}
