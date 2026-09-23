"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PendingUpdate } from "@/lib/desktop-bridge"

/**
 * L'annonce d'une mise à jour téléchargée, dans l'application plutôt que dans une boîte
 * de dialogue Windows : le logo tourne, et « Oui » garde la version actuelle jusqu'à la
 * prochaine ouverture, « Non » applique la nouvelle tout de suite.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<PendingUpdate | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    const bridge = window.eraserDesktop
    if (!bridge?.onUpdateReady || !bridge.getPendingUpdate) return
    let alive = true
    void bridge.getPendingUpdate().then((pending) => { if (alive && pending) setUpdate(pending) }).catch(() => undefined)
    const unsubscribe = bridge.onUpdateReady((next) => { setUpdate(next); setApplying(false) })
    return () => { alive = false; unsubscribe() }
  }, [])

  if (!update) return null

  function stay() {
    void window.eraserDesktop?.dismissUpdate?.()
    setUpdate(null)
  }

  function change() {
    setApplying(true)
    // Une mise à jour sans réinstallation recharge la page ; une installation relance Eraser.
    void window.eraserDesktop?.applyUpdate?.()
  }

  return <div role="alertdialog" aria-modal="true" aria-labelledby="eraser-update-title" className="fixed inset-0 z-[2000] grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
    <div className="grid max-w-sm justify-items-center gap-5 rounded-3xl border bg-card/95 px-8 py-9 text-center shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.png" alt="" className="size-20 animate-spin object-contain [animation-duration:2.4s]" />
      <div className="grid gap-1.5">
        <p id="eraser-update-title" className="font-display text-2xl font-semibold">Eraser est en changement.</p>
        <p className="text-muted-foreground">{applying ? "Le changement s’opère…" : "Souhaitez-vous rester dans le passé ?"}</p>
      </div>
      {!applying && <div className="flex gap-3">
        <Button type="button" variant="outline" className="min-w-24" onClick={stay}>Oui</Button>
        <Button type="button" className="min-w-24" onClick={change} autoFocus>Non</Button>
      </div>}
    </div>
  </div>
}
