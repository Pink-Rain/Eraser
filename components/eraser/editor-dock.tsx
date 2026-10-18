"use client"

/**
 * Le dock de l'éditeur « Modifier » : l'éditeur d'un index est dessiné ici, dans la coque de
 * l'application, et non dans la page de l'index. Changer de page le garde donc ouvert (réduit,
 * avec « Reprendre ») et ses modifications en attente ; revenir à l'index le reprend tel quel.
 *
 * La page qui l'ouvre y pose son éditeur à chaque rendu (`show`), avec ce qu'il lui faut (son
 * modèle, à reprendre au retour) ; elle le retire en le fermant (`hide`). Quitter la page ne le
 * retire pas. Un seul éditeur à la fois : en ouvrir un autre remplace le premier.
 */
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from "react"

type Docked = { key: string; model: unknown; node: ReactNode }

type Dock = {
  /** Le modèle de l'éditeur gardé pour cette clé (une page qui revient le reprend), sinon `undefined`. */
  modelOf: (key: string) => unknown
  show: (key: string, model: unknown, node: ReactNode) => void
  hide: (key: string) => void
}

// Hors d'un rendu : ce que le dock garde, lu par une page qui revient (sans passer par l'état).
const kept = new Map<string, Docked>()

const DockContext = createContext<Dock | null>(null)

export function EditorDockProvider({ children }: { children: ReactNode }) {
  const [docked, setDocked] = useState<Docked | null>(null)
  const dock = useMemo<Dock>(() => ({
    modelOf: (key) => kept.get(key)?.model,
    show: (key, model, node) => {
      for (const other of kept.keys()) if (other !== key) kept.delete(other)
      const entry = { key, model, node }
      kept.set(key, entry)
      setDocked(entry)
    },
    hide: (key) => {
      kept.delete(key)
      setDocked((current) => current?.key === key ? null : current)
    },
  }), [])
  return <DockContext.Provider value={dock}>
    {children}
    {docked && <Fragment key={docked.key}>{docked.node}</Fragment>}
  </DockContext.Provider>
}

/** Le dock de la coque ; `null` hors de l'application (l'atelier, les tests) : la page dessine son éditeur elle-même. */
export function useEditorDock() {
  return useContext(DockContext)
}
