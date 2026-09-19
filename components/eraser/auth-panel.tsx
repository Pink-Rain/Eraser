"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
type AuthMode = "login" | "register"

export function AuthPanel({ initialError }: { initialError?: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(initialError ?? null)
  const [isError, setIsError] = useState(Boolean(initialError))
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.setAttribute("data-eraser-auth-ready", "true")
  }, [])

  async function submit(mode: AuthMode, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setIsError(false)

    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          displayName: String(form.get("displayName") ?? "").trim(),
          adminCode: String(form.get("adminCode") ?? "").trim(),
        }),
      })
      const result = (await response.json()) as {
        ok?: boolean
        message?: string
        error?: string
      }
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? (mode === "register" ? "La création du compte a échoué." : "La connexion a échoué."))
      }
      setMessage(result.message ?? "Connexion réussie.")
      window.setTimeout(() => {
        window.location.href = "/"
      }, 500)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={panelRef}
      className="rounded-3xl border bg-card/95 p-5 shadow-[0_24px_80px_rgb(65_44_24/0.12)] sm:p-7"
      data-eraser-auth-ready="false"
    >
      <section>
        <h2 className="font-display text-2xl font-semibold">Se connecter</h2>
        <p className="mt-1 text-sm text-muted-foreground">Utilise l’adresse et le mot de passe de ton profil.</p>
        <AuthForm mode="login" busy={busy} onSubmit={(event) => submit("login", event)} />
      </section>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <details className="group rounded-2xl border bg-background/55 p-4">
        <summary className="cursor-pointer list-none font-medium marker:hidden">
          Créer un nouveau compte
          <span className="ml-2 text-sm font-normal text-muted-foreground group-open:hidden">Afficher le formulaire</span>
        </summary>
        <div className="pt-4">
          <AuthForm mode="register" busy={busy} onSubmit={(event) => submit("register", event)} />
        </div>
      </details>

      {message && (
        <Alert
          className={`mt-5 ${
            isError
              ? "border-destructive/35 bg-destructive/5 text-destructive"
              : "border-[#52665c]/30 bg-[#52665c]/6 text-[#34493f]"
          }`}
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
        Le compte appartient uniquement à Eraser. Aucune connexion ChatGPT
        n’est utilisée et les mots de passe ne sont jamais enregistrés dans Google Sheets.
      </p>
    </div>
  )
}

function AuthForm({
  mode,
  busy,
  onSubmit,
}: {
  mode: AuthMode
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      action={`/api/auth/${mode}`}
      className="mt-4 space-y-4"
      method="post"
      onSubmit={onSubmit}
    >
      {mode === "register" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="displayName">Nom affiché</Label>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="name"
              placeholder="Le nom visible dans l’application"
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminCode">Code administrateur</Label>
            <Input
              id="adminCode"
              name="adminCode"
              autoComplete="off"
              placeholder="Facultatif"
            />
            <p className="text-xs text-muted-foreground">
              Laisse vide sauf si un code de création administrateur t’a été transmis.
            </p>
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${mode}-email`}>Adresse e-mail</Label>
        <Input
          id={`${mode}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nom@exemple.fr"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${mode}-password`}>Mot de passe</Label>
        <Input
          id={`${mode}-password`}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        {mode === "register" ? "Créer mon compte" : "Me connecter"}
      </Button>
    </form>
  )
}
