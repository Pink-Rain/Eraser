"use client"

/**
 * Le lecteur d'une vue et ses rôles pour une ligne (lib/view-roles.ts) : lus dans le cadre
 * d'Eraser (rôle affiché, personnages, campagnes, choix du menu). Dans un aperçu d'éditeur,
 * « Voir comme » impose un rôle imaginé (`ViewAsContext`).
 */
import { createContext, useCallback, useContext, useMemo } from "react"

import { useOptionalShellData } from "@/components/eraser/app-shell"
import { Segmented } from "@/components/eraser/editor-controls"
import { cn } from "@/lib/utils"
import { simulatedRoles, viewerRolesFor, viewRoles, type RoleRow, type Viewer, type ViewRole } from "@/lib/view-roles"

/** Le rôle imaginé d'un aperçu (« Voir comme ») ; `null` : le vrai lecteur. */
export const ViewAsContext = createContext<ViewRole | null>(null)

/** Ce qu'Eraser sait du lecteur ; hors du cadre, un joueur sans personnage. */
export function useViewer(): Viewer {
  const shell = useOptionalShellData()
  return useMemo((): Viewer => {
    if (!shell) return { role: "joueur", characters: [], campaigns: [], context: [] }
    const uid = shell.user.uid
    const characters = shell.characters.filter((character) => !character.ownerUid || character.ownerUid === uid).map((character) => ({ id: character.id, name: character.name, campaigns: character.campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })) }))
    const campaigns = shell.campaigns.filter((campaign) => !campaign.mjUid || campaign.mjUid === uid).map((campaign) => ({ id: campaign.id, name: campaign.name }))
    const selectedCampaign = shell.campaigns.find((campaign) => campaign.id === shell.selectedCampaignId)
    const selectedCharacter = characters.find((character) => character.id === shell.selectedCharacterId)
    const context = shell.viewRole === "mj" ? (selectedCampaign ? [{ id: selectedCampaign.id, name: selectedCampaign.name }] : []) : selectedCharacter?.campaigns ?? []
    return { role: shell.viewRole, characters, campaigns, context }
  }, [shell])
}

/** Les rôles du lecteur pour une ligne (ceux de « Voir comme » dans un aperçu). */
export function useRolesOf() {
  const viewer = useViewer()
  const viewAs = useContext(ViewAsContext)
  return useCallback((row?: RoleRow) => viewAs ? simulatedRoles(viewAs) : viewerRolesFor(viewer, row), [viewAs, viewer])
}

/** « Voir comme » : le rôle imaginé de l'aperçu, un des six. */
export function ViewAsPicker({ value, onChange, disabled }: { value: ViewRole; onChange: (role: ViewRole) => void; disabled?: boolean }) {
  return <Segmented ariaLabel="Voir comme" value={value} options={viewRoles.map((role) => ({ value: role.value, label: role.short, title: `${role.label} — ${role.hint}` }))} onChange={onChange} disabled={disabled} />
}

/**
 * Les rôles qui voient et peuvent se servir d'un bouton (ou qui ont ce clic) : plusieurs à la
 * fois ; aucun coché : tout le monde. « Joueur » comprend ceux de la campagne et le
 * propriétaire, « MJ » celui de la campagne.
 */
export function RolesPicker({ value, onChange, disabled, label = "Qui le voit et peut s’en servir" }: { value: ViewRole[] | undefined; onChange: (roles: ViewRole[] | undefined) => void; disabled?: boolean; label?: string }) {
  const chosen = new Set(value ?? [])
  const toggle = (role: ViewRole) => {
    const next = new Set(chosen)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    const kept = viewRoles.map((entry) => entry.value).filter((entry) => next.has(entry))
    onChange(kept.length ? kept : undefined)
  }
  return <span className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
    <span>{label} <span className="font-normal">{chosen.size ? "" : "— tout le monde"}</span></span>
    <span className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {viewRoles.map((role) => <button key={role.value} type="button" disabled={disabled} aria-pressed={chosen.has(role.value)} title={role.hint} onClick={() => toggle(role.value)} className={cn("h-6 rounded-full border px-2 text-[11px] font-medium transition disabled:opacity-50", chosen.has(role.value) ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>{role.label}</button>)}
    </span>
  </span>
}
