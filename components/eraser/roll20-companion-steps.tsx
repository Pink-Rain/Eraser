"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, ClipboardCopy, Download, ExternalLink, FolderOpen, FolderSearch, LoaderCircle, Pencil, RefreshCw, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { companionManifest } from "@/lib/roll20-companion-version"
import { cn } from "@/lib/utils"

type CompanionState = { available: boolean; version: string; folder: string; folderVersion: string; defaultFolder: string; cancelled?: boolean }
type Browser = "chrome" | "opera"

const browserLabels: Record<Browser, string> = { chrome: "Chrome", opera: "Opera" }
const extensionsPages: Record<Browser, string> = { chrome: "chrome://extensions", opera: "opera://extensions" }

async function companionRequest(body?: Record<string, string>) {
  const response = await fetch("/api/roll20/companion", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as CompanionState & { opened?: boolean; error?: string }
  if (!response.ok) throw new Error(payload.error || "Le compagnon n’a pas répondu.")
  return payload
}

/** Un bouton qui copie un texte, et le dit. */
function CopyButton({ text, label, variant = "outline", size = "sm" }: { text: string | (() => Promise<string>); label: string; variant?: "outline" | "default" | "ghost"; size?: "sm" | "lg" | "default" }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle")
  async function copy() {
    setState("busy")
    try {
      await navigator.clipboard.writeText(typeof text === "string" ? text : await text())
      setState("done")
      window.setTimeout(() => setState("idle"), 2500)
    } catch { setState("failed") }
  }
  return <Button type="button" variant={variant} size={size} onClick={() => void copy()} disabled={state === "busy"}>
    {state === "busy" ? <LoaderCircle className="animate-spin" /> : state === "done" ? <Check /> : <ClipboardCopy />}
    {state === "done" ? "Copié !" : state === "failed" ? "Copie impossible, réessaie" : label}
  </Button>
}

function Step({ number, title, state, children, onRedo }: { number: number; title: string; state: "todo" | "active" | "done"; children: ReactNode; onRedo: () => void }) {
  return <li className={cn("rounded-2xl border p-4 transition-colors sm:p-5", state === "active" ? "border-primary/45 bg-primary/[0.04] shadow-sm" : "bg-card/60", state === "todo" && "opacity-55")} aria-current={state === "active" ? "step" : undefined}>
    <div className="flex items-center gap-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border font-display text-lg font-bold", state === "done" ? "border-emerald-600 bg-emerald-600 text-white" : state === "active" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{state === "done" ? <Check className="size-5" /> : number}</span>
      <h3 className="min-w-0 flex-1 font-display text-xl font-semibold">Étape {number} — {title}</h3>
      {state === "done" && <Button type="button" variant="ghost" size="sm" onClick={onRedo}><RotateCcw />Refaire</Button>}
    </div>
    {state === "active" && <div className="mt-4 space-y-3 pl-0 sm:pl-12">{children}</div>}
  </li>
}

/**
 * La mise à jour du compagnon Roll20 en trois étapes, un bouton chacune : Eraser range le
 * compagnon dans son dossier sur ce PC, ouvre la page des extensions de Chrome ou d'Opera, puis
 * copie le script Mod et ouvre la page des scripts de la partie Roll20.
 * `scriptsUrl` : la page des scripts gardée pour la campagne ; `suggestedScriptsUrl` : celle
 * déduite du lien de la partie.
 */
export function Roll20CompanionSteps({ campaignId, scriptsUrl: initialScriptsUrl, suggestedScriptsUrl }: { campaignId: string; scriptsUrl: string; suggestedScriptsUrl: string }) {
  const version = companionManifest.version
  const [companion, setCompanion] = useState<CompanionState | null>(null)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [missingBrowser, setMissingBrowser] = useState<Browser | null>(null)
  const [scriptsUrl, setScriptsUrl] = useState(initialScriptsUrl)
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState(initialScriptsUrl || suggestedScriptsUrl)
  const link = scriptsUrl || suggestedScriptsUrl

  useEffect(() => {
    let alive = true
    companionRequest()
      .then((state) => {
        if (!alive) return
        setCompanion(state)
        // Les fichiers déjà à jour sur ce PC : on reprend à l'étape 2.
        if (state.available && state.folderVersion === state.version) setStep(2)
      })
      .catch((caught) => { if (alive) setError(caught instanceof Error ? caught.message : "Le compagnon n’a pas répondu.") })
    return () => { alive = false }
  }, [])

  async function act(name: string, body: Record<string, string>, after?: (state: CompanionState & { opened?: boolean }) => void) {
    setBusy(name); setError("")
    try {
      const result = await companionRequest(body)
      if (!("opened" in result)) setCompanion(result)
      after?.(result)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le compagnon n’a pas pu être mis à jour.") }
    setBusy("")
  }

  function openBrowser(browser: Browser) {
    setMissingBrowser(null)
    void act(`browser-${browser}`, { action: "open-browser", browser }, (result) => {
      if (result.opened) setStep(3)
      else setMissingBrowser(browser)
    })
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

  return <section aria-labelledby="roll20-mise-a-jour" className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="roll20-mise-a-jour" className="font-display text-2xl font-semibold">Mettre à jour le compagnon</h2>
      <p className="text-sm text-muted-foreground">Version {version} · trois clics, dans l’ordre</p>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

    <ol className="space-y-3">
      <Step number={1} title="Mettre à jour les fichiers sur ce PC" state={stepState(1)} onRedo={() => setStep(1)}>
        {!companion ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Recherche du compagnon sur ce PC…</p>
          : companion.available ? <>
            {folder
              ? <p className="text-sm">Dossier du compagnon : <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{folder}</code> <span className="text-muted-foreground">({companion.folderVersion ? `version ${companion.folderVersion} dessus` : "encore vide"})</span></p>
              : <p className="text-sm text-muted-foreground">Le compagnon est déjà sur ce PC ? Choisis son dossier une fois pour toutes. Sinon, clique simplement sur le gros bouton : il sera rangé dans <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{companion.defaultFolder}</code>.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void act("choose", { action: "choose-folder" })}>{busy === "choose" ? <LoaderCircle className="animate-spin" /> : <FolderSearch />}{folder ? "Changer de dossier…" : "Choisir son dossier…"}</Button>
              {folder && companion.folderVersion && <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void act("open-folder", { action: "open-folder" })}><FolderOpen />Ouvrir le dossier</Button>}
            </div>
            {busy === "choose" && <p className="text-xs text-muted-foreground">Une fenêtre Windows s’est ouverte pour choisir le dossier (regarde dans la barre des tâches si elle est cachée).</p>}
            <Button type="button" size="lg" className="w-full sm:w-auto" disabled={Boolean(busy)} onClick={() => void act("install", { action: "install" }, () => setStep(2))}>
              {busy === "install" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Cliquer ici : mettre à jour le compagnon ({version})
            </Button>
          </> : <>
            <p className="text-sm text-muted-foreground">Hors de l’application Windows, Eraser ne peut pas écrire sur le PC : télécharge le compagnon, puis remplace le contenu de son dossier par celui du ZIP.</p>
            <Button asChild size="lg"><a href="/roll20/eraser-roll20-companion.zip" download><Download />Télécharger le compagnon ({version})</a></Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>C’est fait, étape suivante</Button>
          </>}
      </Step>

      <Step number={2} title="Recharger le compagnon dans le navigateur" state={stepState(2)} onRedo={() => setStep(2)}>
        <p className="text-sm">Choisis ton navigateur. Dans la page qui s’ouvre, trouve <strong>« Eraser — Compagnon Roll20 »</strong> et clique sur sa flèche ronde <strong>↻</strong> (Actualiser).</p>
        <div className="flex flex-wrap gap-2">
          {(["chrome", "opera"] as const).map((browser) => <Button key={browser} type="button" size="lg" variant={browser === "chrome" ? "default" : "secondary"} disabled={Boolean(busy)} onClick={() => openBrowser(browser)}>
            {busy === `browser-${browser}` ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}Ouvrir dans {browserLabels[browser]}
          </Button>)}
        </div>
        {missingBrowser && <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p>{browserLabels[missingBrowser]} n’a pas été trouvé sur ce PC. Ouvre-le toi-même, colle cette adresse dans sa barre d’adresse et valide :</p>
          <div className="flex flex-wrap items-center gap-2"><code className="rounded bg-muted px-2 py-1">{extensionsPages[missingBrowser]}</code><CopyButton text={extensionsPages[missingBrowser]} label="Copier l’adresse" /></div>
        </div>}
        <details className="rounded-xl border bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Première fois sur ce PC (le compagnon n’est pas dans la liste) ?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>En haut à droite de la page des extensions, active le <strong>Mode développeur</strong>.</li>
            <li>Clique sur <strong>« Charger l’extension non empaquetée »</strong>.</li>
            <li>Choisis le dossier du compagnon{folder ? <> : <code className="break-all rounded bg-muted px-1 text-xs">{folder}</code></> : " (celui de l’étape 1)"}.</li>
          </ol>
          {folder && <div className="mt-2"><CopyButton text={folder} label="Copier le chemin du dossier" variant="ghost" /></div>}
        </details>
        <p className="text-xs text-muted-foreground">À partir de cette version, le compagnon se recharge aussi tout seul en ouvrant Roll20 quand Eraser a mis son dossier à jour.</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep(3)}>C’est fait, étape suivante</Button>
      </Step>

      <Step number={3} title="Mettre à jour le script Mod de la partie" state={stepState(3)} onRedo={() => setStep(3)}>
        <div className="flex flex-wrap gap-2">
          <CopyButton size="lg" variant="default" label="1. Copier le script" text={async () => {
            const response = await fetch("/roll20/eraser-bridge.mod.js", { cache: "no-store" })
            if (!response.ok) throw new Error("SCRIPT_MISSING")
            return response.text()
          }} />
          {link
            ? <Button asChild size="lg" variant="secondary"><a href={link} target="_blank" rel="noreferrer"><ExternalLink />2. Ouvrir la page des scripts Roll20</a></Button>
            : <Button type="button" size="lg" variant="secondary" onClick={() => setEditingLink(true)}><Pencil />2. Ajouter le lien de la page des scripts</Button>}
        </div>
        <p className="text-sm">Sur la page Roll20, ouvre l’onglet du script <strong>Eraser Bridge</strong> (la première fois : « New Script »), clique dans le texte, fais <kbd>Ctrl</kbd> + <kbd>A</kbd> puis <kbd>Ctrl</kbd> + <kbd>V</kbd>, et clique sur <strong>« Save Script »</strong>.</p>
        {editingLink || !link
          ? <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void saveLink() }}>
            <Input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://app.roll20.net/campaigns/scripts/…" aria-label="Lien de la page des scripts Mod" type="url" />
            <Button type="submit" disabled={busy === "link"}>{busy === "link" ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer le lien</Button>
          </form>
          : <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setEditingLink(true)}>{scriptsUrl ? "Modifier le lien de la page des scripts" : "Lien déduit de celui de la partie : le remplacer"}</button>}
        <Button type="button" onClick={() => setStep(4)}><Check />J’ai collé et enregistré le script</Button>
      </Step>
    </ol>

    {step > 3 && <p className="flex items-start gap-2 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 px-4 py-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-emerald-700" /><span><strong>Tout est à jour.</strong> Recharge la page de la partie Roll20 : la console Mod doit afficher « Eraser Bridge {version} prêt », puis clique sur le bouton Eraser.</span></p>}
  </section>
}
