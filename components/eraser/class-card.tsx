import Link from "next/link"
import { BookOpenCheck, CircleHelp, Crown, Feather, Flame, Gauge } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ClassImage } from "@/components/eraser/class-image"
import { classImageUrl } from "@/lib/class-images"
import type { ClassDifficulty, ClassRecord } from "@/lib/google-sheets"

const difficultyIcons: Record<ClassDifficulty, typeof Gauge> = {
  Facile: Feather,
  Intermédiaire: Gauge,
  Difficile: Flame,
  Expert: Crown,
  X: CircleHelp,
}

export function ClassCard({ characterClass }: { characterClass: ClassRecord }) {
  const imageUrl = classImageUrl(characterClass.image)
  const keywords = characterClass.keywords.filter(Boolean)
  const DifficultyIcon = difficultyIcons[characterClass.difficulty]

  return (
    <Link
      href={`/regles/classes/${encodeURIComponent(characterClass.id)}`}
      className="group flex min-h-full flex-col overflow-hidden rounded-[1.35rem] border bg-card/90 shadow-[0_12px_35px_rgb(67_50_31/0.07)] transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgb(67_50_31/0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ borderColor: `${characterClass.accentDark}55`, boxShadow: `0 12px 35px ${characterClass.accentDark}16` }}
    >
      <div className="flex min-h-20 items-center justify-center px-4 py-4 text-center">
        <h3 className="font-display text-xl font-semibold leading-tight tracking-[-0.01em]" style={{ color: characterClass.accentDark }}>
          {characterClass.name}
        </h3>
      </div>

      <div className="relative aspect-square overflow-hidden px-5">
        <ClassImage src={imageUrl} alt={`Illustration de la classe ${characterClass.name}`} className="size-full object-contain transition duration-500 group-hover:scale-[1.035]" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex min-h-20 flex-col items-center justify-start gap-1.5 text-center text-sm leading-5">
          {keywords.length ? keywords.map((keyword) => (
            <Badge
              key={keyword}
              variant="secondary"
              className="max-w-full justify-center whitespace-normal px-2.5 py-1 text-center font-normal"
              style={{ backgroundColor: `${characterClass.accentLight}28`, color: characterClass.accentDark, borderColor: `${characterClass.accentDark}33` }}
            >
              {keyword}
            </Badge>
          )) : (
            <span className="text-xs text-muted-foreground">Mots-clés à venir</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <DifficultyIcon className="size-3.5" style={{ color: characterClass.accentDark }} />
            Difficulté
          </span>
          <span className="font-semibold">
            {characterClass.difficulty === "X" ? "À définir" : characterClass.difficulty}
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpenCheck className="size-3.5" style={{ color: characterClass.accentDark }} />
              Finition
            </span>
            <span className="font-semibold">{characterClass.completion}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${characterClass.accentLight}45` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${characterClass.completion}%`, backgroundColor: characterClass.accentDark }} /></div>
        </div>
      </div>
    </Link>
  )
}
