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
import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from "react"

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

/** L'élément peut-il encore défiler dans ce sens (il garde alors la molette) ? */
function canScroll(element: HTMLElement, dx: number, dy: number) {
  const style = window.getComputedStyle(element)
  if (dy !== 0 && /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
    if (dy < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1) return true
  }
  if (dx !== 0 && /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
    if (dx < 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1) return true
  }
  return false
}

/**
 * La molette dans une fenêtre qui ne bloque pas la page (l'éditeur posé dans le dock) : elle fait
 * défiler la fenêtre, jamais le tableau caché dessous. Une zone de la fenêtre qui défile garde la
 * molette jusqu'à son bord ; au-delà, ou sur une partie qui ne défile pas (en-tête, pied), le
 * défilement s'arrête là au lieu de passer à la page derrière.
 */
export function useContainedWheel(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = ref.current
    if (!active || !root) return
    const onWheel = (event: WheelEvent) => {
      // Ctrl + molette : le zoom d'Eraser, laissé tel quel.
      if (event.ctrlKey) return
      for (let node = event.target instanceof Element ? event.target : null; node; node = node.parentElement) {
        if (node instanceof HTMLElement && canScroll(node, event.deltaX, event.deltaY)) return
        if (node === root) break
      }
      event.preventDefault()
    }
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => root.removeEventListener("wheel", onWheel)
  }, [ref, active])
}
