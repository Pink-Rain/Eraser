"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Check, ImagePlus, KeyRound, Link2, LoaderCircle, LogOut, Mail, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type AccountDialogUser = { uid: string; email: string; displayName: string }

/** L’avatar d’un compte ; ses initiales tant qu’aucune image n’est enregistrée. */
export function AccountAvatar({ user, version, className }: { user: AccountDialogUser; version: number; className?: string }) {
  const src = `/api/account/avatar/${encodeURIComponent(user.uid)}${version ? `?v=${version}` : ""}`
  const [failedSrc, setFailedSrc] = useState("")
  const [loadedSrc, setLoadedSrc] = useState("")
  const initials = (user.displayName || user.email).slice(0, 2)
  // L’image reste invisible tant qu’elle n’est pas chargée : un compte sans avatar
  // (réponse 404 arrivée avant que la page soit interactive) garde ses initiales.
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent text-xs font-semibold uppercase text-[#d7b77f]", className)}>
      {initials}
      {failedSrc !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={(node) => { if (node?.complete) { if (node.naturalWidth) setLoadedSrc(src); else setFailedSrc(src) } }}
          src={src}
          alt=""
          decoding="async"
          className={cn("absolute inset-0 size-full object-cover", loadedSrc === src ? "opacity-100" : "opacity-0")}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      )}
    </div>
  )
}

type Feedback = { tone: "ok" | "error"; text: string } | null

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return <p className={cn("text-xs", feedback.tone === "ok" ? "text-[#4f6b5c]" : "text-destructive")} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.tone === "ok" && <Check className="mr-1 inline size-3.5" />}{feedback.text}</p>
}

function Section({ icon: Icon, title, children }: { icon: typeof Mail; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-background/50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" />{title}</h3>
      {children}
    </section>
  )
}

async function saveProfile(body: Record<string, string>) {
  const response = await fetch("/api/account/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "Le compte n’a pas pu être modifié.")
}

export function AccountDialog({ open, onOpenChange, user, roleLabel, avatarVersion, onAvatarChange, onSignOut }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AccountDialogUser
  roleLabel: string
  avatarVersion: number
  onAvatarChange: () => void
  onSignOut: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState("")
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email)
  const [emailPassword, setEmailPassword] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarLinkOpen, setAvatarLinkOpen] = useState(false)
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})

  function report(key: string, value: Feedback) {
    setFeedback((current) => ({ ...current, [key]: value }))
  }

  async function run(key: string, action: () => Promise<string>) {
    setPending(key)
    report(key, null)
    try {
      report(key, { tone: "ok", text: await action() })
    } catch (error) {
      report(key, { tone: "error", text: error instanceof Error ? error.message : "Une erreur est survenue." })
    } finally {
      setPending("")
    }
  }

  function uploadAvatar(file: File | undefined) {
    if (!file) return
    void run("avatar", async () => {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("Choisis une image de moins de 10 Mo.")
      const form = new FormData()
      form.append("avatar", file)
      const response = await fetch("/api/account/avatar", { method: "POST", body: form })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "L’avatar n’a pas pu être enregistré.")
      onAvatarChange()
      return "Avatar mis à jour."
    })
  }

  function linkAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run("avatar", async () => {
      const response = await fetch("/api/account/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: avatarUrl }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "L’avatar n’a pas pu être enregistré.")
      onAvatarChange()
      setAvatarUrl("")
      setAvatarLinkOpen(false)
      return "Avatar mis à jour."
    })
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run("name", async () => {
      await saveProfile({ displayName })
      router.refresh()
      return "Pseudo enregistré."
    })
  }

  function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run("email", async () => {
      await saveProfile({ email, currentPassword: emailPassword })
      setEmailPassword("")
      router.refresh()
      return "Adresse e-mail enregistrée."
    })
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run("password", async () => {
      if (newPassword !== confirmPassword) throw new Error("Les deux nouveaux mots de passe ne correspondent pas.")
      await saveProfile({ currentPassword, newPassword })
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
      return "Mot de passe modifié. Tes autres sessions ont été fermées."
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <div className="flex items-center gap-4 pr-6">
          <label className="group relative shrink-0 cursor-pointer" title="Changer d’avatar">
            <AccountAvatar user={user} version={avatarVersion} className="size-16 rounded-2xl text-lg" />
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
              {pending === "avatar" ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </span>
            <input type="file" accept="image/*" className="sr-only" disabled={pending === "avatar"} onChange={(event) => { uploadAvatar(event.target.files?.[0]); event.target.value = "" }} />
          </label>
          <div className="min-w-0">
            <DialogTitle className="font-display truncate text-2xl">{user.displayName || user.email}</DialogTitle>
            <DialogDescription className="truncate">{roleLabel} · {user.email}</DialogDescription>
          </div>
        </div>

        <div className="-mt-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/8">
              <ImagePlus className="size-3.5" />Importer une image
              <input type="file" accept="image/*" className="sr-only" disabled={pending === "avatar"} onChange={(event) => { uploadAvatar(event.target.files?.[0]); event.target.value = "" }} />
            </label>
            <button type="button" onClick={() => setAvatarLinkOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/8">
              <Link2 className="size-3.5" />Depuis un lien
            </button>
          </div>
          {avatarLinkOpen && (
            <form onSubmit={linkAvatar} className="flex gap-2">
              <Input type="url" inputMode="url" required value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" aria-label="Lien de l’image" className="h-9" autoFocus />
              <Button type="submit" size="sm" className="h-9" disabled={pending === "avatar"}>{pending === "avatar" ? <LoaderCircle className="animate-spin" /> : "Utiliser"}</Button>
            </form>
          )}
          <FeedbackLine feedback={feedback.avatar ?? null} />
        </div>

        <Section icon={UserRound} title="Pseudo">
          <form onSubmit={saveName} className="flex gap-2">
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required aria-label="Pseudo" className="h-9" />
            <Button type="submit" size="sm" className="h-9" disabled={pending === "name" || displayName.trim() === user.displayName}>{pending === "name" ? <LoaderCircle className="animate-spin" /> : "Enregistrer"}</Button>
          </form>
          <FeedbackLine feedback={feedback.name ?? null} />
        </Section>

        <Section icon={Mail} title="Adresse e-mail">
          <form onSubmit={saveEmail} className="space-y-2">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" aria-label="Nouvelle adresse e-mail" className="h-9" />
            {email.trim().toLowerCase() !== user.email && (
              <div className="flex gap-2">
                <Input type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} required autoComplete="current-password" placeholder="Mot de passe actuel" aria-label="Mot de passe actuel" className="h-9" />
                <Button type="submit" size="sm" className="h-9" disabled={pending === "email"}>{pending === "email" ? <LoaderCircle className="animate-spin" /> : "Enregistrer"}</Button>
              </div>
            )}
          </form>
          <FeedbackLine feedback={feedback.email ?? null} />
        </Section>

        <Section icon={KeyRound} title="Mot de passe">
          <form onSubmit={savePassword} className="space-y-2">
            <Label htmlFor="account-current-password" className="sr-only">Mot de passe actuel</Label>
            <Input id="account-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" placeholder="Mot de passe actuel" className="h-9" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Nouveau (8 caractères min.)" aria-label="Nouveau mot de passe" className="h-9" />
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Confirmer" aria-label="Confirmer le nouveau mot de passe" className="h-9" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending === "password"}>{pending === "password" && <LoaderCircle className="animate-spin" />}Changer le mot de passe</Button>
            </div>
          </form>
          <FeedbackLine feedback={feedback.password ?? null} />
        </Section>

        <Button type="button" variant="outline" onClick={onSignOut} className="w-full text-destructive hover:bg-destructive/8 hover:text-destructive">
          <LogOut />Se déconnecter
        </Button>
      </DialogContent>
    </Dialog>
  )
}
