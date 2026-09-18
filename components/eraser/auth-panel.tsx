"use client"

import { FormEvent, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type AuthMode = "login" | "register" | "repair"

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>("login")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setIsError(false)

    const form = new FormData(event.currentTarget)
    try {
      const endpoint = mode === "repair" ? "desktop-reset" : mode
      const response = await fetch(`/api/auth/${endpoint}`, {
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
        throw new Error(result.error ?? (mode === "repair" ? "La réparation a échoué." : "La connexion a échoué."))
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
    <div className="rounded-3xl border bg-card/95 p-5 shadow-[0_24px_80px_rgb(65_44_24/0.12)] sm:p-7">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as AuthMode)
          setMessage(null)
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="login">Se connecter</TabsTrigger>
          <TabsTrigger value="register">Créer un compte</TabsTrigger>
          <TabsTrigger value="repair">Réparer l’accès</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="pt-5">
          <AuthForm mode="login" busy={busy} onSubmit={submit} />
        </TabsContent>
        <TabsContent value="register" className="pt-5">
          <AuthForm mode="register" busy={busy} onSubmit={submit} />
        </TabsContent>
        <TabsContent value="repair" className="pt-5">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Si une ancienne installation a déjà créé ton compte local, saisis son adresse et choisis un nouveau mot de passe.
          </p>
          <AuthForm mode="repair" busy={busy} onSubmit={submit} />
        </TabsContent>
      </Tabs>

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
    <form className="space-y-4" onSubmit={onSubmit}>
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
        {mode !== "login" && (
          <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        {mode === "register" ? "Créer mon compte" : mode === "repair" ? "Enregistrer le nouveau mot de passe" : "Me connecter"}
      </Button>
    </form>
  )
}
