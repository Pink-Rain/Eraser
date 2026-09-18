"use client"

import { useState } from "react"
import { ImageIcon } from "lucide-react"

export function ClassImage({ src, alt, className = "", fallbackClassName = "", eager = false }: { src: string | null; alt: string; className?: string; fallbackClassName?: string; eager?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) return <div className={`flex size-full flex-col items-center justify-center gap-2 text-muted-foreground ${fallbackClassName}`}><ImageIcon className="size-7 opacity-65" /><span className="text-xs">Illustration à venir</span></div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} onError={() => setFailedSrc(src)} className={className} />
}
