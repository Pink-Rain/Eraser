"use client"

import { useEffect } from "react"

type SampleTarget = { id: string; imageUrl: string }

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`
}

function luminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function accentPair(red: number, green: number, blue: number) {
  const lightness = luminance(red, green, blue)
  const darkFactor = lightness > 115 ? 0.58 : lightness < 55 ? 1.55 : 0.82
  const lightFactor = lightness > 190 ? 0.92 : lightness < 80 ? 2.15 : 1.42
  return {
    dark: rgbToHex(red * darkFactor, green * darkFactor, blue * darkFactor),
    light: rgbToHex(red * lightFactor + 18, green * lightFactor + 18, blue * lightFactor + 18),
  }
}

async function sample(target: SampleTarget) {
  const image = new Image()
  image.decoding = "async"
  image.src = target.imageUrl
  await image.decode()
  const canvas = document.createElement("canvas")
  canvas.width = 48
  canvas.height = 48
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("CANVAS_UNAVAILABLE")
  context.drawImage(image, 0, 0, 48, 48)
  const pixels = context.getImageData(0, 0, 48, 48).data
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number; score: number }>()
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (alpha < 80) continue
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    const saturation = maximum - minimum
    const light = luminance(red, green, blue)
    if (light < 20 || light > 242 || saturation < 16) continue
    const key = `${Math.round(red / 32)}:${Math.round(green / 32)}:${Math.round(blue / 32)}`
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, score: 0 }
    bucket.count += 1
    bucket.red += red
    bucket.green += green
    bucket.blue += blue
    bucket.score += saturation * (light > 45 && light < 220 ? 1.3 : 0.7)
    buckets.set(key, bucket)
  }
  const selected = [...buckets.values()].sort((left, right) => (right.score * Math.sqrt(right.count)) - (left.score * Math.sqrt(left.count)))[0]
  if (!selected) throw new Error("NO_ACCENT_FOUND")
  return { id: target.id, ...accentPair(selected.red / selected.count, selected.green / selected.count, selected.blue / selected.count) }
}

export function ClassAccentSampler({ targets }: { targets: SampleTarget[] }) {
  useEffect(() => {
    if (!targets.length) return
    let cancelled = false
    void (async () => {
      const colors: Array<{ id: string; dark: string; light: string }> = []
      for (let index = 0; index < targets.length; index += 3) {
        const batch = await Promise.allSettled(targets.slice(index, index + 3).map(sample))
        colors.push(...batch.flatMap((result) => result.status === "fulfilled" ? [result.value] : []))
        if (cancelled) return
      }
      if (!colors.length || cancelled) return
      await fetch("/api/classes/accents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors }),
      })
    })()
    return () => { cancelled = true }
  }, [targets])
  return null
}
