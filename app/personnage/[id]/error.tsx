"use client"

import { PageError } from "@/components/eraser/page-error"

export default function CharacterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError error={error} reset={reset} title="Impossible d’afficher la fiche" label="CHARACTER_PAGE_CLIENT_ERROR" />
}
