import { Suspense, type ReactNode } from "react"
import { Files } from "lucide-react"

import { customPageLinks } from "@/components/eraser/custom-page-links"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { ClassAccentSampler } from "@/components/eraser/class-accent-sampler"
import { ClassPresentationPanel, ClassSupplementsPanel } from "@/components/eraser/class-detail"
import { classImageUrl } from "@/lib/class-images"
import { listClasses } from "@/lib/google-sheets"
import { HomeAchievementsPanel, HomeCampaigns, HomeCharacters, HomeGreeting, HomeMain, HomeSide, HomeTodos } from "@/components/eraser/home-shell"
import { getClassContent } from "@/lib/class-content"
import { IndexDirectory } from "@/components/eraser/index-directory"
import { MenuLinkPanel } from "@/components/eraser/menu-page"
import { NewIndexButton } from "@/components/eraser/new-index-dialog"
import { VocabularyGlossary } from "@/components/eraser/vocabulary-glossary"
import { canManagePages, type ModuleBlock, type PageSection, type PageView } from "@/lib/custom-pages"
import { listVocabulary, type VocabularyEntry } from "@/lib/vocabulary"
import type { AuthorizedUser } from "@/lib/server-auth"

/**
 * Le rendu des modules d'Eraser (lib/eraser-modules.ts) d'une page du créateur de pages, sur
 * le serveur : chaque bloc Module reçoit son contenu, que la page (client) place à l'endroit
 * du bloc. Seuls les modules réellement posés sont rendus ; chacun lit ses données lui-même,
 * en flux (la page s'affiche sans les attendre).
 */

/** Les pages du créateur rangées dans une section du menu. */
async function SectionPages({ place }: { place: PageSection }) {
  const links = await customPageLinks(place, "", "size-4")
  return links.length ? <MenuLinkPanel title="Pages" icon={Files} links={links} /> : null
}

async function Vocabulary({ canEdit }: { canEdit: boolean }) {
  let entries: VocabularyEntry[] = []
  let loadError = ""
  try {
    entries = await listVocabulary()
  } catch (error) {
    console.error("VOCABULARY_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    loadError = "Le vocabulaire est momentanément indisponible."
  }
  return <VocabularyGlossary initialEntries={entries} canEdit={canEdit} loadError={loadError} inPage />
}

/** Règles › Classes, pour un admin : l'échantillonneur qui tire des images la couleur d'accent des classes qui n'en ont pas encore (rien d'affiché). */
async function ClassAccents() {
  const classes = await listClasses().catch(() => [])
  const imageCounts = new Map<string, number>()
  classes.forEach((characterClass) => imageCounts.set(characterClass.image, (imageCounts.get(characterClass.image) || 0) + 1))
  const targets = classes.flatMap((characterClass) => {
    const imageUrl = classImageUrl(characterClass.image)
    return !characterClass.accentReady && imageUrl && imageCounts.get(characterClass.image) === 1 ? [{ id: characterClass.id, imageUrl }] : []
  })
  return targets.length ? <ClassAccentSampler targets={targets} /> : null
}

/** Un morceau de la page d'une classe : la classe de la page (page qui remplace celle d'une classe). */
async function ClassPart({ classId, part }: { classId: string; part: "presentation" | "supplements" }) {
  const content = await getClassContent(classId).catch((error) => {
    console.error("CLASS_CONTENT_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  if (!content) return null
  return part === "presentation" ? <ClassPresentationPanel content={content} /> : <ClassSupplementsPanel content={content} />
}

function render(block: ModuleBlock, context: ModuleContext): ReactNode {
  const manager = canManagePages(context.account.role)
  switch (block.module) {
    // Hors d'une page qui en remplace une d'Eraser : rien à montrer (l'atelier et l'adresse
    // propre de la page montrent un emplacement).
    case "origine": return context.origin === undefined ? undefined : context.origin ? <div className="eraser-origin">{context.origin}</div> : null
    case "pages-section": return <SectionPages place={block.place} />
    case "vocabulaire": return <Suspense fallback={<DeferredContentLoading label="Chargement du vocabulaire…" />}><Vocabulary canEdit={manager} /></Suspense>
    case "repertoire-index": return manager ? <div className="grid gap-4"><div className="flex justify-end"><NewIndexButton /></div><IndexDirectory /></div> : null
    case "accueil-salutation": return <HomeGreeting />
    case "accueil-principal": return <HomeMain />
    case "accueil-personnages": return <HomeCharacters />
    case "accueil-campagnes": return <HomeCampaigns />
    case "accueil-cote": return <HomeSide />
    case "accueil-succes": return <HomeAchievementsPanel />
    case "accueil-a-faire": return context.account.role === "admin" ? <HomeTodos /> : null
    case "classes-accents": return context.account.role === "admin" ? <Suspense fallback={null}><ClassAccents /></Suspense> : null
    case "classe-presentation":
    case "classe-specificites":
      // Sans classe (atelier, adresse propre de la page) : l'emplacement seulement.
      if (context.row?.index !== "classes") return undefined
      return <Suspense fallback={<DeferredContentLoading label="Chargement de la classe…" />}><ClassPart classId={context.row.id} part={block.module === "classe-presentation" ? "presentation" : "supplements"} /></Suspense>
  }
}

export type ModuleContext = {
  account: Pick<AuthorizedUser, "role">
  /**
   * Le contenu de la page d'Eraser remplacée : `undefined` hors remplacement (emplacement
   * montré), `null` quand il est déjà affiché autour de la page (au-dessus ou en dessous).
   */
  origin?: ReactNode | null
  /** Page d'une ligne (une classe…) : la ligne affichée, pour les modules qui la montrent. */
  row?: { index: string; id: string }
}

/** Le contenu de chaque bloc Module de la page (identifiant du bloc → contenu). */
export function moduleSlots(view: Pick<PageView, "sections">, context: ModuleContext): Record<string, ReactNode> {
  const slots: Record<string, ReactNode> = {}
  for (const section of view.sections) for (const column of section.cols) for (const block of column) {
    if (block.type !== "module") continue
    const content = render(block, context)
    if (content !== undefined) slots[block.id] = content
  }
  return slots
}
