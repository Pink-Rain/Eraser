"use client"

import { useEffect } from "react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("ROOT_LAYOUT_CLIENT_ERROR", error) }, [error])
  return (
    <html lang="fr">
      <body className="antialiased">
        <main style={{ display: "grid", minHeight: "70svh", placeItems: "center", padding: "0 20px" }}>
          <div style={{ maxWidth: "32rem", borderRadius: "1rem", border: "1px solid #dc262633", background: "#fff", padding: "1.75rem", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Eraser n’a pas pu démarrer cette page</h1>
            <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#6b7280" }}>
              Tes données sont conservées. Réessaie ; si le problème persiste, redémarre l’application.
            </p>
            <button type="button" onClick={reset} style={{ marginTop: "1.25rem", borderRadius: "0.5rem", background: "#111827", color: "#fff", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
              Réessayer
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
