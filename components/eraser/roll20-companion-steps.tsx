"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, ClipboardCopy, Download, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { companionManifest } from "@/lib/roll20-companion-version"
import { cn } from "@/lib/utils"

type CompanionState = {
  available: boolean; version: string; folder: string; folderVersion: string; defaultFolder: string; cancelled?: boolean
  /** Ce que le compagnon a signalé : la version qui tourne dans le navigateur, celle du script Mod. */
  browserVersion: string; modVersion: string
}

async function companionRequest(body?: Record<string, string>) {
  const response = await fetch("/api/roll20/companion", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as CompanionState & { error?: string }
  if (!response.ok) throw new Error(payload.error || "Le compagnon n’a pas répondu.")
  return payload
}

/** Les deux premiers nombres : le compagnon et le script Mod s'entendent tant qu'ils sont les mêmes. */
const family = (version: string) => version.split(".").slice(0, 2).join(".")

function CopyButton({ text, label, size = "sm", variant = "outline" }: { text: string | (() => Promise<string>); label: string; size?: "sm" | "lg"; variant?: "outline" | "default" }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle")
  async function copy() {
    setState("busy")
    try {
      await navigator.clipboard.writeText(typeof text === "string" ? text : await text())
      setState("done")
      window.setTimeout(() => setState("idle"), 2500)
    } catch { setState("failed") }
  }
  return <Button type="button" size={size} variant={variant} onClick={() => void copy()} disabled={state === "busy"}>
    {state === "busy" ? <LoaderCircle className="animate-spin" /> : state === "done" ? <Check /> : <ClipboardCopy />}
    {state === "done" ? "Copié" : state === "failed" ? "Réessaie" : label}
  </Button>
}

function Step({ number, title, state, children }: { number: number; title: string; state: "todo" | "active" | "done"; children: ReactNode }) {
  return <li className={cn("rounded-2xl border p-4", state === "active" ? "border-primary/50 bg-primary/[0.04]" : "bg-card/60", state === "todo" && "opacity-50")} aria-current={state === "active" ? "step" : undefined}>
    <div className="flex items-center gap-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border font-display text-lg font-bold", state === "done" ? "border-emerald-600 bg-emerald-600 text-white" : state === "active" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{state === "done" ? <Check className="size-5" /> : number}</span>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
    </div>
    {state === "active" && <div className="mt-3 space-y-3 sm:pl-12">{children}</div>}
  </li>
}

/** Une ligne de l'étape 2 : le navigateur, son adresse à copier, le bouton à cliquer. */
function BrowserLine({ name, address }: { name: string; address: string }) {
  return <p className="flex flex-wrap items-center gap-2 text-base">
    <strong className="w-16">{name}</strong>
    <code className="rounded bg-muted px-2 py-1">{address}</code>
    <CopyButton text={address} label="Copier" />
    <span>→ <strong className="text-lg">↻</strong> sur <strong>Eraser</strong></span>
  </p>
}

/**
 * La mise à jour du compagnon Roll20, trois étapes courtes. Une étape se coche seule quand le
 * compagnon le confirme : il signale à Eraser sa version (dès qu'il est rechargé) et celle du
 * script Mod. `scriptsUrl` / `suggestedScriptsUrl` : la page des scripts Mod de la partie.
 */
export function Roll20CompanionSteps({ campaignId, scriptsUrl: initialScriptsUrl, suggestedScriptsUrl }: { campaignId: string; scriptsUrl: string; suggestedScriptsUrl: string }) {
  const version = companionManifest.version
  const [companion, setCompanion] = useState<CompanionState | null>(null)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [scriptsUrl, setScriptsUrl] = useState(initialScriptsUrl)
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState(initialScriptsUrl || suggestedScriptsUrl)
  const link = scriptsUrl || suggestedScriptsUrl

  /** La première étape qui reste à faire, d'après ce que le compagnon a signalé. */
  const firstToDo = (state: CompanionState) => state.available && state.folderVersion !== state.version ? 1 : state.browserVersion !== state.version ? 2 : family(state.modVersion) !== family(state.version) ? 3 : 4

  useEffect(() => {
    let alive = true
    companionRequest()
      .then((state) => { if (alive) { setCompanion(state); setStep(firstToDo(state)) } })
      .catch((caught) => { if (alive) setError(caught instanceof Error ? caught.message : "Le compagnon n’a pas répondu.") })
    return () => { alive = false }
  }, [])

  // Étape 2 : dès que le compagnon rechargé se signale, elle se coche seule.
  useEffect(() => {
    if (step !== 2) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void companionRequest().then((state) => {
        setCompanion(state)
        if (state.browserVersion === state.version) setStep(family(state.modVersion) === family(state.version) ? 4 : 3)
      }).catch(() => {})
    }, 2500)
    return () => window.clearInterval(timer)
  }, [step])

  async function act(name: string, body: Record<string, string>, after?: () => void) {
    setBusy(name); setError("")
    try {
      setCompanion(await companionRequest(body))
      after?.()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le compagnon n’a pas pu être mis à jour.") }
    setBusy("")
  }

  async function saveLink() {
    setBusy("link"); setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ roll20ScriptsUrl: linkDraft }) })
      const payload = (await response.json().catch(() => ({}))) as { roll20ScriptsUrl?: string; error?: string }
      if (!response.ok || typeof payload.roll20ScriptsUrl !== "string") throw new Error(payload.error || "Le lien n’a pas pu être enregistré.")
      setScriptsUrl(payload.roll20ScriptsUrl)
      setLinkDraft(payload.roll20ScriptsUrl || suggestedScriptsUrl)
      setEditingLink(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le lien n’a pas pu être enregistré.") }
    setBusy("")
  }

  const stepState = (number: number) => step > number ? "done" as const : step === number ? "active" as const : "todo" as const
  const folder = companion?.folder || ""

  return <section aria-labelledby="roll20-mise-a-jour" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="roll20-mise-a-jour" className="font-display text-2xl font-semibold">Mettre à jour le compagnon</h2>
      <span className="text-sm text-muted-foreground">Version {version}{step > 1 && <> · <button type="button" className="underline-offset-2 hover:underline" onClick={() => setStep(1)}>recommencer</button></>}</span>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

    <ol className="space-y-2.5">
      <Step number={1} title="Mettre à jour les fichiers" state={stepState(1)}>
        {!companion ? <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          : companion.available ? <>
            <Button type="button" size="lg" disabled={Boolean(busy)} onClick={() => void act("install", { action: "install" }, () => setStep(companion.browserVersion === version ? 3 : 2))}>
              {busy === "install" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Mettre à jour le compagnon
            </Button>
            <p className="text-xs text-muted-foreground">
              {folder ? <>Dossier : <code className="break-all">{folder}</code></> : <>Déjà installé ?</>}{" "}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" disabled={Boolean(busy)} onClick={() => void act("choose", { action: "choose-folder" })}>{busy === "choose" ? "choix en cours…" : folder ? "changer" : "choisir son dossier"}</button>
            </p>
          </> : <Button asChild size="lg"><a href="/roll20/eraser-roll20-companion.zip" download><Download />Télécharger le compagnon</a></Button>}
      </Step>

      <Step number={2} title="Recharger dans le navigateur" state={stepState(2)}>
        <BrowserLine name="Chrome" address="chrome://extensions" />
        <BrowserLine name="Opera" address="opera://extensions" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Se coche tout seul. <button type="button" className="underline-offset-2 hover:underline" onClick={() => setStep(3)}>passer</button></p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Pas de carte <strong>Eraser</strong> ?</summary>
          <p className="mt-1 flex flex-wrap items-center gap-2"><strong>Mode développeur</strong> → <strong>Charger l’extension non empaquetée</strong> → {folder ? <><code className="break-all">{folder}</code><CopyButton text={folder} label="Copier" /></> : "le dossier de l’étape 1"}</p>
        </details>
      </Step>

      <Step number={3} title="Mettre à jour le script Mod" state={stepState(3)}>
        <div className="flex flex-wrap gap-2">
          <CopyButton size="lg" variant="default" label="1. Copier le script" text={async () => {
            const response = await fetch("/roll20/eraser-bridge.mod.js", { cache: "no-store" })
            if (!response.ok) throw new Error("SCRIPT_MISSING")
            return response.text()
          }} />
          {link && !editingLink && <Button asChild size="lg" variant="secondary"><a href={link} target="_blank" rel="noreferrer"><ExternalLink />2. Ouvrir les scripts Roll20</a></Button>}
          {link && !editingLink && <button type="button" className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setEditingLink(true)}>changer le lien</button>}
        </div>
        <p className="text-base">Dans Roll20 : <kbd>Ctrl</kbd>+<kbd>A</kbd> → <kbd>Ctrl</kbd>+<kbd>V</kbd> → <strong>Save Script</strong></p>
        {(editingLink || !link) && <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void saveLink() }}>
            <Input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="Lien de la page des scripts Roll20" aria-label="Lien de la page des scripts Mod" type="url" />
            <Button type="submit" disabled={busy === "link"}>{busy === "link" ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
          </form>}
        <div><Button type="button" variant="outline" onClick={() => setStep(4)}><Check />Fait</Button></div>
      </Step>
    </ol>

    {step > 3 && <p className="flex items-center gap-2 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 px-4 py-3 font-medium"><Check className="size-5 text-emerald-700" />Tout est à jour.</p>}
  </section>
}
