"use client"

import { useState, useSyncExternalStore } from "react"
import { ExternalLink, X } from "lucide-react"

import { Button } from "@/components/ui/button"

const DISMISSED_KEY = "eraser:open-in-app-dismissed"

/**
 * Eraser ouvert dans un navigateur (un ancien lien copié, « Continuer dans le navigateur ») :
 * une petite bulle propose de passer dans l'application, comme Discord ou Spotify. Rien ne
 * s'ouvre tout seul, et « Rester ici » la fait taire jusqu'à la fermeture de l'onglet.
 */
function inBrowser() {
  if (window.eraserDesktop) return false
  // Le retour de la connexion Google se fait dans le navigateur : ne pas le déranger.
  if (window.location.pathname.startsWith("/api/")) return false
  try { return !window.sessionStorage.getItem(DISMISSED_KEY) } catch { return true }
}

const noSubscription = () => () => undefined

export function OpenInAppPrompt() {
  const eligible = useSyncExternalStore(noSubscription, inBrowser, () => false)
  const [dismissed, setDismissed] = useState(false)

  if (!eligible || dismissed) return null

  function stay() {
    try { window.sessionStorage.setItem(DISMISSED_KEY, "1") } catch { /* rien à retenir */ }
    setDismissed(true)
  }

  function openInApp() {
    // La page ouverte à cet instant, navigation dans l'onglet comprise.
    window.location.href = `eraser://open${window.location.pathname}${window.location.search}${window.location.hash}`
    stay()
  }

  return <div role="dialog" aria-label="Ouvrir dans l’application" className="fixed bottom-4 right-4 z-[1500] flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border bg-card/95 p-3.5 shadow-xl backdrop-blur-sm">
    {/* eslint-disable-next-line @next/next/no-img-element -- le logo local, sans optimisation */}
    <img src="/favicon.png" alt="" className="size-10 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="font-display text-base font-semibold leading-tight">Eraser est installé ?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Cette page s’ouvre aussi dans l’application.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={openInApp}><ExternalLink />Ouvrir dans l’app</Button>
        <Button type="button" size="sm" variant="ghost" onClick={stay}>Rester ici</Button>
      </div>
    </div>
    <button type="button" onClick={stay} className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fermer"><X className="size-4" /></button>
  </div>
}
