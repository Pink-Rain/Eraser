"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Un champ en cours de modification s'enregistre dès qu'on le quitte, sans Entrée :
 * clic ailleurs (perte du focus) ou disparition du champ — un survol qui se referme
 * retire le champ de la page sans que le navigateur signale la perte du focus. Échap
 * annule : rien n'est alors enregistré.
 *
 * `save` renvoie `false` quand rien n'a été fait (annulé, ou un enregistrement est déjà
 * en cours) ; l'appelant referme son champ dans les autres cas.
 */
export function useCommitOnLeave(editing: boolean, draft: string, value: string, commit: (draft: string) => Promise<unknown> | void) {
  const state = useRef({ editing, draft, value, commit, busy: false, cancelled: false })

  useEffect(() => {
    const current = state.current
    // Un nouvel accès au champ repart sans annulation en attente.
    if (editing && !current.editing) current.cancelled = false
    current.editing = editing
    current.draft = draft
    current.value = value
    current.commit = commit
  })

  useEffect(() => () => {
    const current = state.current
    if (current.editing && !current.cancelled && !current.busy && current.draft !== current.value) void current.commit(current.draft)
  }, [])

  const save = useCallback(async () => {
    const current = state.current
    if (current.busy || current.cancelled) return false
    if (current.draft === current.value) return true
    current.busy = true
    try {
      await current.commit(current.draft)
    } finally {
      current.busy = false
    }
    return true
  }, [])

  const cancel = useCallback(() => { state.current.cancelled = true }, [])

  return { save, cancel }
}
