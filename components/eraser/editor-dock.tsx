"use client"

/**
 * Le dock de l'éditeur « Modifier » : l'éditeur d'un index est dessiné ici, dans la coque de
 * l'application, et non dans la page de l'index. Changer de page le laisse donc ouvert, avec ses
 * modifications en attente ; revenir à l'index le retrouve tel quel.
 *
 * La page qui l'ouvre y pose son éditeur à chaque rendu (`show`), avec ce qu'il lui faut (son
 * modèle, à reprendre au retour) ; elle le retire en le fermant (`hide`). Quitter la page ne le
 * retire pas. Un seul éditeur à la fois : en ouvrir un autre remplace le premier.
 *
 * La fenêtre du dock ne couvre que la zone des pages (`area`) et ne bloque rien autour : les onglets,
 * la navigation et l'en-tête restent cliquables pendant qu'elle est ouverte.
 */
import { createContext, Fragment, useContext, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from "react"

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

/** La place de la zone des pages à l'écran, donnée au seul éditeur docké. */
export type DockArea = { top: number; left: number; width: number; height: number }

const AreaContext = createContext<{ area: DockArea | null } | null>(null)

/** La place de la zone des pages, suivie quand la fenêtre ou la navigation change de taille. */
function useArea(ref: RefObject<HTMLElement | null> | undefined, active: boolean) {
  const [area, setArea] = useState<DockArea | null>(null)
  // Avant l'affichage : la fenêtre s'ouvre directement à sa place.
  useLayoutEffect(() => {
    const element = ref?.current
    if (!active || !element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      setArea((current) => current && current.top === box.top && current.left === box.left && current.width === box.width && current.height === box.height ? current : { top: box.top, left: box.left, width: box.width, height: box.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener("resize", measure)
    return () => { observer.disconnect(); window.removeEventListener("resize", measure) }
  }, [ref, active])
  return active ? area : null
}

export function EditorDockProvider({ children, areaRef }: { children: ReactNode; areaRef?: RefObject<HTMLElement | null> }) {
  const [docked, setDocked] = useState<Docked | null>(null)
  const area = useArea(areaRef, Boolean(docked))
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
    {docked && <AreaContext.Provider value={{ area }}><Fragment key={docked.key}>{docked.node}</Fragment></AreaContext.Provider>}
  </DockContext.Provider>
}

/** Le dock de la coque ; `null` hors de l'application (l'atelier, les tests) : la page dessine son éditeur elle-même. */
export function useEditorDock() {
  return useContext(DockContext)
}

/** Pour l'éditeur posé dans le dock : la zone des pages (`area`, `null` le temps de la mesurer) ; `null` ailleurs (il garde sa fenêtre centrée et modale). */
export function useDockArea() {
  return useContext(AreaContext)
}
