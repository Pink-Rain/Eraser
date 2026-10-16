"use client"

/**
 * Le bloc « Boutons » d'une carte (Modifier › Cartes › Blocs) et le petit groupe « Survol et
 * clic » de la page Carte. Un bouton, c'est d'abord ce qu'il fait (une action choisie dans une
 * liste rangée par familles, avec ses réglages), puis son allure (libellé, icône, plein ou au
 * contour, couleur) et qui le voit (plusieurs rôles). Une action peut en enchaîner d'autres
 * (« Puis… ») : le même moteur que la colonne Boutons (lib/index-actions.ts).
 */
import { useState } from "react"
import { ArrowDown, ArrowUp, Copy, MousePointerClick, Plus, Trash2, X } from "lucide-react"

import { ColorSwatches, fieldLabel, hintText, HoverChoice, IconPick, Segmented, SettingsRow, Toggle } from "@/components/eraser/editor-controls"
import { RolesPicker } from "@/components/eraser/view-roles"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { actionStepCatalog, describeStep, newStep, stepInfo, type ActionStepType } from "@/lib/index-actions"
import { cardClicks, cardId, type CardBlock, type CardButton, type CardColumn, type CardTemplate } from "@/lib/index-cards"
import { normalizeSpec, parseGlyphValue, type ActionStep } from "@/lib/index-columns"
import type { RelationTarget } from "@/lib/index-schema-shared"
import { cn } from "@/lib/utils"

/** Ce que l'éditeur de cartes sait de l'onglet pour régler les boutons et le clic : ses formulaires, ses cartes, ses survols, les index. */
export type CardEditorExtras = {
  /** Les survols de l'onglet (« principal » : l'étoilé) ; absent : ni survol ni clic à régler (l'élément propre d'une vue). */
  hovers?: Array<{ id: string; name: string }>
  forms?: Array<{ id: string; name: string }>
  cards?: Array<{ id: string; name: string }>
  /** Les index d'Eraser et leurs onglets (une ligne d'un autre index, une ligne au hasard). */
  indexes?: RelationTarget[]
  /** Les onglets de cet index. */
  tabs?: string[]
  /** L'index des objets n'a pas les mêmes actions que ceux du monde. */
  family?: "world" | "objects"
}

/** Les actions proposées d'un clic, avec leurs réglages de départ : ce qu'on veut faire le plus souvent. */
const quickButtons: Array<{ key: string; label: string; hint: string; icon: string; button: Omit<CardButton, "id">; only?: "world" | "objects" }> = [
  { key: "form", label: "Ouvrir un formulaire, ici", hint: "La fiche courte, la fiche de combat… dans une fenêtre, sans quitter la page.", icon: "file-text", button: { label: "Ouvrir", icon: "file-text", steps: [{ type: "open-form" }] }, only: "world" },
  { key: "page", label: "Ouvrir la page de la ligne", hint: "Celle d’un personnage, d’une campagne ; sinon sa fiche.", icon: "external-link", button: { label: "Page", icon: "external-link", look: "outline", steps: [{ type: "open-page" }] }, only: "world" },
  { key: "row", label: "Une ligne d’un autre index", hint: "Le lieu de ce PNJ, la religion de ce peuple : sa fiche, par son nom.", icon: "link", button: { label: "Voir", icon: "link", look: "outline", steps: [{ type: "open-row", index: "", row: "" }] }, only: "world" },
  { key: "eraser", label: "Une page d’Eraser", hint: "Un index, une page créée, le tabletop…", icon: "compass", button: { label: "Aller", icon: "compass", look: "outline", steps: [{ type: "open-eraser", href: "" }] } },
  { key: "web", label: "Une page web", hint: "Une adresse, qui peut prendre une colonne : https://…/{Nom}.", icon: "globe", button: { label: "Web", icon: "globe", look: "outline", steps: [{ type: "open-url", url: "" }] } },
  { key: "card", label: "Montrer une carte", hint: "La ligne dessinée avec une autre carte de l’onglet, dans une fenêtre.", icon: "id-card", button: { label: "Carte", icon: "id-card", look: "outline", steps: [{ type: "show-card", card: "" }] }, only: "world" },
  { key: "random", label: "Une ligne au hasard", hint: "Une rencontre, un trésor : tirée dans cet onglet ou un autre index.", icon: "shuffle", button: { label: "Au hasard", icon: "shuffle", steps: [{ type: "random-row" }] }, only: "world" },
  { key: "dice", label: "Lancer des dés", hint: "Un message avec le résultat : Dégâts : =DES(\"2d6\").", icon: "dices", button: { label: "Lancer", icon: "dices", steps: [{ type: "notify", message: "Résultat : =DES(\"1d20\")" }] } },
  { key: "plus", label: "+1 / −1 sur une colonne", hint: "Une charge, des PV, un compteur.", icon: "plus", button: { label: "+1", icon: "plus", look: "outline", steps: [{ type: "increment", column: "", amount: "1" }] } },
  { key: "set", label: "Mettre une valeur", hint: "« Mort », un état, une case cochée.", icon: "pencil", button: { label: "Marquer", icon: "pencil", look: "outline", steps: [{ type: "set", column: "", value: "" }] } },
  { key: "duplicate", label: "Dupliquer la ligne", hint: "Une copie juste en dessous.", icon: "copy", button: { label: "Dupliquer", icon: "copy", look: "ghost", steps: [{ type: "duplicate" }] } },
  { key: "delete", label: "Supprimer la ligne", hint: "Avec une confirmation.", icon: "trash-2", button: { label: "Supprimer", icon: "trash-2", look: "ghost", color: "#b3261e", confirm: "Supprimer « {Nom} » ?", steps: [{ type: "delete" }] } },
  { key: "chat", label: "Envoyer dans le chat", hint: "Un message dans le chat d’une campagne.", icon: "message-circle", button: { label: "Chat", icon: "message-circle", look: "outline", steps: [{ type: "chat", message: "{Nom}", audience: "public" }] } },
]

const available = (family: CardEditorExtras["family"]) => actionStepCatalog.filter((step) => !step.only || (step.only === "objects" ? family === "objects" : family !== "objects"))

/** Les réglages d'une étape : chacun avec le bon choix (un formulaire, une carte, un index, une colonne…). */
function StepSettings({ step, columns, extras, onChange, disabled }: { step: ActionStep; columns: CardColumn[]; extras: CardEditorExtras; onChange: (step: ActionStep) => void; disabled?: boolean }) {
  const info = stepInfo(step.type)
  const values = step as Record<string, unknown>
  // Un réglage facultatif laissé vide reste absent (le formulaire à l'étoile, cet index…).
  const set = (key: string, value: unknown) => {
    const next = { ...step, [key]: value } as Record<string, unknown>
    const optional = ["form", "min", "max"].includes(key) || (step.type === "random-row" && (key === "tab" || key === "index"))
    if ((value === "" || value === undefined) && optional) delete next[key]
    onChange(next as ActionStep)
  }
  const select = (key: string, label: string, options: Array<{ value: string; label: string }>, empty: string) => <label key={key} className={fieldLabel}>{label}
    <NativeSelect disabled={disabled} value={String(values[key] ?? "")} onChange={(event) => set(key, event.target.value)} className="h-8 py-0 text-xs">
      <NativeSelectOption value="">{empty}</NativeSelectOption>
      {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
    </NativeSelect>
  </label>
  const pickIndex = step.type === "open-row" || step.type === "random-row" || step.type === "open-index" || step.type === "create" ? extras.indexes?.find((target) => target.index === values.index) : undefined
  if (!info.fields.length) return null
  return <div className="grid gap-2 sm:grid-cols-2">
    {info.fields.map((field) => {
      if (field.kind === "form") return select(field.key, field.label, (extras.forms ?? []).filter((form) => form.id !== "principal").map((form) => ({ value: form.id, label: form.name })), "Le formulaire à l’étoile")
      if (field.kind === "card") return select(field.key, field.label, (extras.cards ?? []).map((card) => ({ value: card.id, label: card.name })), "La carte à l’étoile")
      if (field.kind === "index") return select(field.key, field.label, (extras.indexes ?? []).map((target) => ({ value: target.index, label: target.title })), step.type === "random-row" ? "Cet index" : "— Choisir —")
      if (field.kind === "tab") return select(field.key, field.label, (pickIndex ? pickIndex.tabs.map((tab) => tab.name) : extras.tabs ?? []).map((name) => ({ value: name, label: name })), step.type === "random-row" ? "Celui de la ligne (ou le premier)" : "— Choisir —")
      if (field.kind === "column") {
        const fit = columns.filter((column) => { const kind = normalizeSpec(column.spec).kind; return step.type === "toggle" ? kind === "checkbox" : step.type === "roll" ? kind === "random" : step.type === "open-linked" ? kind === "linked" || kind === "linked-choice" : !["id", "actions"].includes(kind) })
        return select(field.key, field.label, fit.map((column) => ({ value: column.header, label: column.header })), "— Choisir —")
      }
      if (field.kind === "audience") return <label key={field.key} className={fieldLabel}>{field.label}<Segmented ariaLabel={field.label} value={String(values[field.key] ?? "public") as "public" | "gm"} options={[{ value: "public", label: "Tout le monde" }, { value: "gm", label: "Le MJ seulement" }]} onChange={(value) => set(field.key, value)} disabled={disabled} /></label>
      if (field.kind === "boolean") return <span key={field.key} className="self-end pb-1.5"><Toggle checked={Boolean(values[field.key])} onChange={(checked) => set(field.key, checked || undefined)} disabled={disabled}>{field.label}</Toggle></span>
      if (field.kind === "mapping") return <p key={field.key} className={cn(hintText, "sm:col-span-2")}>Les valeurs de la nouvelle ligne se règlent dans la colonne Boutons de l’index (« Modifier › Colonnes »).</p>
      // Une page d'Eraser : quelques pages connues, ou une adresse écrite.
      const suggestions = step.type === "open-eraser" ? ["/", "/ressources/index", "/tabletop", ...(extras.indexes ?? []).map((target) => `/ressources/index/${target.index}`)] : []
      return <label key={field.key} className={cn(fieldLabel, (field.kind === "text" || field.kind === "formula") && "sm:col-span-2")}>{field.label}
        <Input disabled={disabled} value={String(values[field.key] ?? "")} onChange={(event) => set(field.key, event.target.value)} placeholder={field.hint} list={suggestions.length ? `eraser-pages-${field.key}` : undefined} className={cn("h-8 text-xs", field.kind !== "text" && "font-mono")} />
        {suggestions.length > 0 && <datalist id={`eraser-pages-${field.key}`}>{suggestions.map((href) => <option key={href} value={href} />)}</datalist>}
      </label>
    })}
  </div>
}

/** Un bouton : ce qu'il fait (et ce qui suit), son allure, qui le voit. */
function ButtonSettings({ button, columns, extras, onChange, disabled }: { button: CardButton; columns: CardColumn[]; extras: CardEditorExtras; onChange: (button: CardButton) => void; disabled?: boolean }) {
  const [advanced, setAdvanced] = useState(Boolean(button.condition))
  const steps = button.steps.length ? button.steps : [newStep("open-form")]
  const catalog = available(extras.family)
  const groups = [...new Set(catalog.map((step) => step.group))]
  const setStep = (at: number, step: ActionStep) => onChange({ ...button, steps: steps.map((item, index) => index === at ? step : item) })
  const changeType = (at: number, type: ActionStepType) => {
    const step = newStep(type)
    // Une suppression demande toujours confirmation, d'office.
    onChange({ ...button, steps: steps.map((item, index) => index === at ? step : item), ...(type === "delete" && !button.confirm ? { confirm: "Supprimer « {Nom} » ?" } : {}) })
  }
  return <div className="grid gap-3">
    {steps.map((step, at) => <div key={at} className="grid gap-2 rounded-lg border border-dashed bg-background/50 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground">{at === 0 ? "Au clic" : "Puis"}</span>
        <NativeSelect disabled={disabled} value={step.type} onChange={(event) => changeType(at, event.target.value as ActionStepType)} className="h-8 min-w-56 flex-1 py-0 text-xs" aria-label="Ce que fait le bouton">
          {groups.map((group) => <NativeSelectOptGroup key={group} label={group}>{catalog.filter((item) => item.group === group).map((item) => <NativeSelectOption key={item.type} value={item.type}>{item.label}</NativeSelectOption>)}</NativeSelectOptGroup>)}
        </NativeSelect>
        {steps.length > 1 && <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || at === 0} onClick={() => { const next = [...steps]; next.splice(at - 1, 0, next.splice(at, 1)[0]); onChange({ ...button, steps: next }) }} aria-label="Avancer l’étape"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => onChange({ ...button, steps: steps.filter((_, index) => index !== at) })} aria-label="Retirer l’étape"><X /></Button>
        </>}
      </div>
      <p className={hintText}>{stepInfo(step.type).description}</p>
      <StepSettings step={step} columns={columns} extras={extras} onChange={(next) => setStep(at, next)} disabled={disabled} />
    </div>)}
    {steps.length < 8 && !["delete", "move", "move-ask"].includes(steps.at(-1)!.type) && <Button type="button" size="sm" variant="ghost" className="h-7 justify-self-start text-[11px]" disabled={disabled} onClick={() => onChange({ ...button, steps: [...steps, newStep("notify")] })}><Plus />Puis…</Button>}

    <SettingsRow>
      <label className={fieldLabel}>Libellé<Input disabled={disabled} value={button.label} maxLength={60} onChange={(event) => onChange({ ...button, label: event.target.value })} className="h-8 w-40 text-xs" /></label>
      <span className={fieldLabel}>Icône<IconPick value={button.icon} onChange={(icon) => onChange({ ...button, icon })} disabled={disabled} /></span>
      <span className={fieldLabel}>Allure<Segmented ariaLabel="Allure du bouton" value={button.look ?? "solid"} options={[{ value: "solid", label: "Plein" }, { value: "outline", label: "Contour" }, { value: "ghost", label: "Discret" }]} onChange={(look) => onChange({ ...button, look: look === "solid" ? undefined : look })} disabled={disabled} /></span>
      <span className="self-end pb-1.5"><Toggle checked={Boolean(button.iconOnly)} onChange={(iconOnly) => onChange({ ...button, iconOnly: iconOnly || undefined })} disabled={disabled || !button.icon} title={button.icon ? "Le libellé au survol" : "Choisis d’abord une icône"}>Icône seule</Toggle></span>
    </SettingsRow>
    <span className={fieldLabel}>Couleur<ColorSwatches value={button.color} onChange={(color) => onChange({ ...button, color })} disabled={disabled} none="Accent de la carte" ariaLabel="Couleur du bouton" /></span>
    <RolesPicker value={button.roles} onChange={(roles) => onChange({ ...button, roles })} disabled={disabled} />
    <label className={fieldLabel}>Demander confirmation <span className="font-normal">(vide : aucune ; {"{Colonne}"} possible)</span><Input disabled={disabled} value={button.confirm ?? ""} maxLength={200} onChange={(event) => onChange({ ...button, confirm: event.target.value || undefined })} placeholder="Supprimer « {Nom} » ?" className="h-8 text-xs" /></label>
    {advanced
      ? <label className={fieldLabel}>Seulement si <span className="font-normal">(une formule : {"{Charges} > 0"})</span><Input disabled={disabled} value={button.condition ?? ""} maxLength={400} onChange={(event) => onChange({ ...button, condition: event.target.value || undefined })} placeholder="{Charges} > 0" className="h-8 font-mono text-xs" /></label>
      : <Button type="button" size="sm" variant="ghost" className="h-7 justify-self-start text-[11px]" disabled={disabled} onClick={() => setAdvanced(true)}>Afficher seulement si… (formule)</Button>}
  </div>
}

/** Une puce comme le bouton sur la carte (allure, couleur, icône). */
function ButtonChip({ button, accent = "#927640" }: { button: CardButton; accent?: string }) {
  const color = button.color ?? accent
  const look = button.look ?? "solid"
  const glyph = button.icon ? parseGlyphValue(button.icon) : null
  return <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold", look === "solid" ? "text-white" : look === "outline" ? "border" : "")} style={look === "solid" ? { backgroundColor: color } : { color, ...(look === "outline" ? { borderColor: color } : {}) }}>
    {glyph && (glyph.icon || glyph.emoji) && <IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-3" filled={Boolean(glyph.emoji)} />}
    {!button.iconOnly && (button.label || "Bouton")}
  </span>
}

/** Le bloc « Boutons » : la liste des boutons (un clic en ouvre les réglages), leur place, et « Ajouter un bouton ». */
export function CardButtonsEditor({ block, columns, extras = {}, onChange, disabled }: { block: CardBlock; columns: CardColumn[]; extras?: CardEditorExtras; onChange: (block: CardBlock) => void; disabled?: boolean }) {
  const buttons = block.buttons ?? []
  const [open, setOpen] = useState<string | null>(buttons[0]?.id ?? null)
  const [adding, setAdding] = useState(false)
  const setButtons = (next: CardButton[]) => onChange({ ...block, buttons: next.length ? next : undefined })
  const add = (preset: (typeof quickButtons)[number]) => {
    const button: CardButton = { ...structuredClone(preset.button), id: cardId("btn") }
    setButtons([...buttons, button])
    setOpen(button.id)
    setAdding(false)
  }
  const quick = quickButtons.filter((preset) => !preset.only || (preset.only === "objects" ? extras.family === "objects" : extras.family !== "objects"))
  return <div className="grid gap-3">
    <SettingsRow>
      <span className={fieldLabel}>Place<Segmented ariaLabel="Place des boutons" value={block.align ?? "left"} options={[{ value: "left", label: "À gauche" }, { value: "center", label: "Centrés" }, { value: "right", label: "À droite" }]} onChange={(align) => onChange({ ...block, align: align === "left" ? undefined : align })} disabled={disabled} /></span>
      <span className="self-end pb-1.5"><Toggle checked={Boolean(block.stretch)} onChange={(stretch) => onChange({ ...block, stretch: stretch || undefined })} disabled={disabled}>Toute la largeur</Toggle></span>
    </SettingsRow>
    <div className="grid gap-1.5">
      {buttons.map((button, index) => {
        const expanded = open === button.id
        return <div key={button.id} className={cn("rounded-lg border bg-background/70", expanded && "border-primary/60")}>
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : button.id)}>
              <ButtonChip button={button} />
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">{button.steps.map(describeStep).join(" → ") || "Ne fait rien"}{button.roles?.length ? ` · ${button.roles.length} rôle${button.roles.length > 1 ? "s" : ""}` : ""}</span>
            </button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => { const next = [...buttons]; next.splice(index - 1, 0, next.splice(index, 1)[0]); setButtons(next) }} aria-label="Avancer le bouton"><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === buttons.length - 1} onClick={() => { const next = [...buttons]; next.splice(index + 1, 0, next.splice(index, 1)[0]); setButtons(next) }} aria-label="Reculer le bouton"><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || buttons.length >= 8} onClick={() => { const copy = { ...structuredClone(button), id: cardId("btn") }; const next = [...buttons]; next.splice(index + 1, 0, copy); setButtons(next); setOpen(copy.id) }} aria-label="Dupliquer le bouton"><Copy /></Button>
            <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => setButtons(buttons.filter((item) => item.id !== button.id))} aria-label="Retirer le bouton"><Trash2 /></Button>
          </div>
          {expanded && <div className="border-t p-2.5"><ButtonSettings button={button} columns={columns} extras={extras} onChange={(next) => setButtons(buttons.map((item) => item.id === next.id ? next : item))} disabled={disabled} /></div>}
        </div>
      })}
    </div>
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="h-8 justify-self-start text-xs" disabled={disabled || buttons.length >= 8}><Plus />Ajouter un bouton</Button></PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70svh] w-80 overflow-y-auto p-1.5">
        {quick.map((preset) => <button key={preset.key} type="button" onClick={() => add(preset)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground"><IndexIconGlyph icon={preset.icon} className="size-3.5" filled={false} /></span>
          <span className="min-w-0"><span className="block text-sm font-medium">{preset.label}</span><span className="block text-[11px] leading-4 text-muted-foreground">{preset.hint}</span></span>
        </button>)}
      </PopoverContent>
    </Popover>
    <p className={hintText}>Chaque bouton fait une action, ou plusieurs à la suite (« Puis… »), comme la colonne Boutons. « Voir comme », dans l’aperçu, montre ce que voit chaque rôle.</p>
  </div>
}

/**
 * « Survol et clic » (page Carte, sous « Couleur et cadre ») : le survol au passage de la souris
 * et ce que fait un clic. La forme qui contient la carte (une vue, un bloc de page) l'emporte
 * quand elle règle le sien, même pour dire « aucun ».
 */
export function CardHoverClick({ card, extras, onChange, disabled }: { card: CardTemplate; extras: CardEditorExtras; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const click = card.click ?? "sheet"
  const otherForms = (extras.forms ?? []).filter((form) => form.id !== "principal")
  return <div className="grid gap-2 rounded-xl border bg-card/60 p-2.5">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><MousePointerClick className="size-3.5" />Survol et clic</p>
    <HoverChoice value={card.hover} hovers={extras.hovers ?? []} onChange={(hover) => onChange({ ...card, hover })} disabled={disabled} />
    <SettingsRow>
      <label className={fieldLabel}>Au clic sur la carte
        <NativeSelect disabled={disabled} value={click} onChange={(event) => { const value = event.target.value as NonNullable<CardTemplate["click"]>; onChange({ ...card, click: value === "sheet" ? undefined : value, clickForm: value === "form" ? card.clickForm : undefined }) }} className="h-8 py-0 text-xs" title={cardClicks.find((entry) => entry.value === click)?.hint}>
          {cardClicks.map((entry) => <NativeSelectOption key={entry.value} value={entry.value}>{entry.label}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      {click === "form" && <label className={fieldLabel}>Le formulaire
        <NativeSelect disabled={disabled} value={card.clickForm ?? ""} onChange={(event) => onChange({ ...card, clickForm: event.target.value || undefined })} className="h-8 py-0 text-xs">
          <NativeSelectOption value="">Le formulaire à l’étoile</NativeSelectOption>
          {otherForms.map((form) => <NativeSelectOption key={form.id} value={form.id}>{form.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
    </SettingsRow>
    <p className={hintText}>Une vue, un bloc de page ou un tableau de bord qui montre cette carte et règle son propre survol ou son propre clic l’emporte, même pour dire « aucun ». Sinon, c’est celui-ci.</p>
  </div>
}
