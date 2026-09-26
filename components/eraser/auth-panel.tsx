"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type AuthMode = "login" | "register"

/**
 * Connexion et création de compte, sans rien d’autre. Les deux formulaires restent
 * dans la page (l’inactif est masqué) : le test de l’installation Windows remplit
 * directement `form[action="/api/auth/register"]` et attend `data-eraser-auth-ready`.
 */
export function AuthPanel({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<AuthMode>("login")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(initialError ?? null)
  const [isError, setIsError] = useState(Boolean(initialError))
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.setAttribute("data-eraser-auth-ready", "true")
  }, [])

  function switchMode(next: AuthMode) {
    setMode(next)
    setMessage(null)
    setIsError(false)
  }

  async function submit(formMode: AuthMode, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setIsError(false)

    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/auth/${formMode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          displayName: String(form.get("displayName") ?? "").trim(),
          adminCode: String(form.get("adminCode") ?? "").trim(),
        }),
      })
      const result = (await response.json()) as { ok?: boolean; message?: string; error?: string }
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? (formMode === "register" ? "La création du compte a échoué." : "La connexion a échoué."))
      }
      setMessage(result.message ?? "Connexion réussie.")
      window.setTimeout(() => { window.location.href = "/" }, 400)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={panelRef} data-eraser-auth-ready="false" className="w-full">
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-background/60 p-1" role="tablist" aria-label="Connexion ou création de compte">
        {([["login", "Se connecter"], ["register", "Créer un compte"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={cn("rounded-lg px-3 py-2 text-sm font-medium transition", mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      <AuthForm mode="login" hidden={mode !== "login"} busy={busy} onSubmit={(event) => submit("login", event)} />
      <AuthForm mode="register" hidden={mode !== "register"} busy={busy} onSubmit={(event) => submit("register", event)} />

      {message && (
        <p className={cn("mt-4 rounded-lg px-3 py-2 text-center text-sm", isError ? "bg-destructive/8 text-destructive" : "bg-[#52665c]/8 text-[#34493f]")} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}
    </div>
  )
}

function AuthForm({ mode, hidden, busy, onSubmit }: { mode: AuthMode; hidden: boolean; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [adminCodeOpen, setAdminCodeOpen] = useState(false)
  return (
    <form action={`/api/auth/${mode}`} method="post" onSubmit={onSubmit} hidden={hidden} className="mt-6 space-y-4">
      {mode === "register" && (
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Pseudo</Label>
          <Input id="displayName" name="displayName" autoComplete="nickname" minLength={2} maxLength={80} required className="h-11" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-email`}>Adresse e-mail</Label>
        <Input id={`${mode}-email`} name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-password`}>Mot de passe</Label>
        <Input
          id={`${mode}-password`}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          placeholder={mode === "register" ? "8 caractères minimum" : undefined}
          required
          className="h-11"
        />
      </div>
      {mode === "register" && (adminCodeOpen ? (
        <div className="space-y-1.5">
          <Label htmlFor="adminCode">Code administrateur</Label>
          <Input id="adminCode" name="adminCode" autoComplete="off" className="h-11" />
        </div>
      ) : (
        <button type="button" onClick={() => setAdminCodeOpen(true)} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          J’ai un code administrateur
        </button>
      ))}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        {mode === "register" ? "Créer mon compte" : "Se connecter"}
      </Button>
    </form>
  )
}
