"use client"

import { PageError } from "@/components/eraser/page-error"

export default function RootPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError error={error} reset={reset} title="Impossible d’afficher cette page" label="PAGE_CLIENT_ERROR" />
}
