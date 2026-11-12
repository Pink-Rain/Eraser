/**
 * Ce qu'Eraser offre aux extensions, version `EXTENSION_API_VERSION` (lib/extensions.ts) : la
 * boîte à outils qu'une extension reçoit, la même partout (son module de démarrage `boot`, ses
 * pages, ses composants posés dans un emplacement). Types seulement : une extension les importe
 * (`import type { Eraser } from "@/lib/extension-api"`) sans rien embarquer.
 *
 * C'est le contrat stable : on y ajoute, on n'y retire et on n'y renomme jamais rien, et on ne
 * change jamais le sens de ce qui existe. Les modules prêtés par `require`
 * (components/eraser/extension-modules.ts) sont autre chose : des pièces d'Eraser telles qu'elles
 * sont dans cette version, que seules les extensions construites avec lui (atelier des pages,
 * documents) utilisent.
 *
 * Une extension qui veut agir sur toute l'application déclare `boot` dans son manifeste. Ce
 * module exporte `activate(eraser)`, appelé une fois sur chaque ordinateur, au premier moment
 * libre après l'ouverture d'Eraser :
 *
 *   export function activate(eraser) {
 *     eraser.slots.add("page.en-tete", Bouton)
 *     eraser.on("page", ({ pathname }) => { … })
 *     return () => { … }  // facultatif : défait ce que l'extension a fait elle-même
 *   }
 *
 * Tout ce qui passe par `eraser` (emplacements, fenêtres, styles, écoutes) est défait par Eraser
 * quand l'extension change de version : `activate` n'a à défaire que ce qu'elle a fait seule.
 */
import type { ComponentType, ReactNode } from "react"

import type { SiteRole } from "@/lib/auth-types"
import type { ExtensionSlotName } from "@/lib/extensions"

export type { ExtensionSlotName } from "@/lib/extensions"

export type ExtensionAccount = { uid: string; displayName: string; role: SiteRole }

/** La page affichée : son adresse et le rôle sous lequel on la regarde (« Voir en tant que »). */
export type ExtensionPageState = { pathname: string; viewRole: SiteRole }

/** Ce que reçoit un composant posé dans un emplacement. `context` : voir `extensionSlots` (lib/extensions.ts). */
export type ExtensionSlotProps = { eraser: Eraser; context: Record<string, unknown> }

/** Ce que reçoit un composant ouvert dans une fenêtre (`eraser.ui.dialog`). */
export type ExtensionDialogProps<P = Record<string, unknown>> = P & { eraser: Eraser; close: () => void }

export type ExtensionEvents = {
  /** La page affichée a changé (adresse ou rôle de vue). Appelé aussi tout de suite avec la page actuelle. */
  page: ExtensionPageState
}

/** Défait ce qui vient d'être posé. */
export type Dispose = () => void

export type Eraser = {
  /** La version de ce contrat qu'offre l'Eraser qui tourne. */
  api: number
  /** Cette extension : identifiant, version, adresse de ses pages (`/extension/<id>`). */
  extension: { id: string; version: string; base: string }
  /** Le compte connecté (son vrai rôle ; les droits, eux, sont vérifiés par les API d'Eraser). */
  account: ExtensionAccount
  /** Un module prêté par Eraser (React, `@/components/ui/…`, pièces d'Eraser). */
  require: (id: string) => unknown
  /** L'adresse d'un fichier de l'extension (images, polices, modules chargés à la demande). */
  file: (path: string) => string
  /** La page affichée maintenant. */
  page: () => ExtensionPageState
  /** Ouvre une adresse d'Eraser (« /campagne/3 ») ou, sans « / » au début, une page de l'extension. */
  go: (href: string) => void
  /** Appelle la partie serveur de l'extension (`/api/extensions/<id>/serveur/<chemin>`). */
  server: (path: string, init?: RequestInit) => Promise<Response>
  /** Appelle une API d'Eraser (« /api/… »), avec le compte connecté : elle vérifie les droits. */
  eraser: (path: string, init?: RequestInit) => Promise<Response>
  /** Pose un composant dans un emplacement d'Eraser ; `order` range les ajouts d'un même emplacement (0 d'office). */
  slots: { add: (slot: ExtensionSlotName, component: ComponentType<ExtensionSlotProps>, options?: { order?: number }) => Dispose }
  ui: {
    /** Ouvre une fenêtre (le cadre de fenêtre d'Eraser) ; rend de quoi la fermer. */
    dialog: <P extends Record<string, unknown>>(component: ComponentType<ExtensionDialogProps<P>>, options?: { title?: string; description?: string; props?: P; wide?: boolean }) => Dispose
    /** Un petit message en bas de l'écran (5 s d'office ; `duration: 0` : jusqu'à ce qu'on le ferme). */
    toast: (message: ReactNode, options?: { duration?: number; tone?: "info" | "erreur" }) => Dispose
    /** Demande une confirmation : vrai si on accepte. */
    confirm: (message: string, options?: { title?: string; confirm?: string; cancel?: string; destructive?: boolean }) => Promise<boolean>
  }
  /**
   * Ajoute du style à toute l'application : une adresse (`eraser.file("x.css")`) ou du CSS. Pas de
   * `:has()` sur `body` ni sur un grand conteneur (AGENTS.md, Fluidité). Pour qu'il soit là avant
   * l'affichage, le déclarer plutôt dans `globalStyles` du manifeste.
   */
  styles: { add: (css: string, options?: { href?: boolean }) => Dispose }
  /**
   * L'inventaire (API 4). `changed(id)` : l'extension vient de modifier l'inventaire de ce
   * personnage (ou de ce PNJ, ou `CAMPAGNE:<id>`) par une API d'Eraser ; la page qui l'affiche le
   * relit, comme pour un item reçu (le nouvel item reçoit sa pastille).
   */
  inventory: {
    changed: (ownerId: string) => void
    /** API 5 : l'effet de cet exemplaire (case d'inventaire) est-il montré par l'œil de l'inventaire ? Caché d'office. */
    effectShown: (slotId: string) => boolean
    /** API 5 : montre ou cache l'effet de ces exemplaires, comme l'œil de l'inventaire (le même état, sur cet ordinateur). */
    showEffects: (slotIds: string[], shown: boolean) => void
  }
  /** Écoute un événement d'Eraser. */
  on: <K extends keyof ExtensionEvents>(event: K, listener: (value: ExtensionEvents[K]) => void) => Dispose
}

/** Ce qu'exporte le module de démarrage (`boot`) d'une extension. */
export type ExtensionBootModule = {
  activate?: (eraser: Eraser) => void | Dispose | Promise<void | Dispose>
}
