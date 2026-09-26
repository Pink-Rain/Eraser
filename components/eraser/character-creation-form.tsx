"use client"

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleUserRound, ImagePlus, Link2, LoaderCircle, Search, Sparkles, Upload, WandSparkles, X } from "lucide-react"

import { ClassImage } from "@/components/eraser/class-image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { characterNarrativeStart, characterValueHeaders } from "@/lib/character-sheet-schema"

export type CreationClassOption = { id: string; name: string; type: string; imageUrl: string | null; accent: string }

type AvatarMode = "import" | "url"

const portraitIndex = characterNarrativeStart + 1
const maxPortraitSize = 10 * 1024 * 1024

function normalized(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
}

export function CharacterCreationForm({ classes, peoples }: { classes: CreationClassOption[]; peoples: string[] }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [people, setPeople] = useState("")
  const [className, setClassName] = useState("")
  const [classQuery, setClassQuery] = useState("")
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("import")
  const [portraitFile, setPortraitFile] = useState<File | null>(null)
  const [portraitUrl, setPortraitUrl] = useState("")
  const [dragging, setDragging] = useState(false)
  const [failedPreview, setFailedPreview] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  // L’aperçu d’un fichier importé est une URL locale à libérer quand il change.
  const filePreview = useMemo(() => portraitFile ? URL.createObjectURL(portraitFile) : "", [portraitFile])
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview])

  const preview = avatarMode === "import" ? filePreview : /^https?:\/\//i.test(portraitUrl.trim()) ? portraitUrl.trim() : ""
  const previewFailed = Boolean(preview) && failedPreview === preview

  const sortedClasses = useMemo(() => [...classes].sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" })), [classes])
  const visibleClasses = useMemo(() => {
    const query = normalized(classQuery)
    return query ? sortedClasses.filter((item) => normalized(`${item.name} ${item.type}`).includes(query)) : sortedClasses
  }, [classQuery, sortedClasses])
  const selectedClass = classes.find((item) => item.name === className)
  const accent = selectedClass?.accent || "var(--primary)"

  function pickFile(file: File | undefined) {
    setError("")
    if (!file) return
    if (!file.type.startsWith("image/")) return setError("Ce fichier n’est pas une image.")
    if (file.size > maxPortraitSize) return setError("Choisis une image de moins de 10 Mo.")
    setPortraitFile(file)
    setAvatarMode("import")
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    pickFile(event.dataTransfer.files?.[0])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return setError("Le nom du personnage est obligatoire.")
    setPending(true)
    setError("")
    const values = Array<string>(characterValueHeaders.length).fill("")
    values[0] = name.trim()
    values[1] = people.trim()
    values[2] = className
    if (avatarMode === "url" && preview) values[portraitIndex] = preview
    try {
      let response: Response
      if (avatarMode === "import" && portraitFile) {
        const form = new FormData()
        form.append("values", JSON.stringify(values))
        form.append("portrait", portraitFile)
        response = await fetch("/api/characters", { method: "POST", body: form })
      } else {
        response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values }) })
      }
      const payload = (await response.json()) as { error?: string; character?: { id: string } }
      if (!response.ok || !payload.character) {
        setPending(false)
        return setError(payload.error || "Le personnage n’a pas pu être créé.")
      }
      // La fiche s’ouvre dès l’enregistrement ; le bouton reste en attente jusque-là.
      router.push(`/personnage/${encodeURIComponent(payload.character.id)}`)
    } catch {
      setPending(false)
      setError("Le personnage n’a pas pu être créé.")
    }
  }

  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
        <span className="h-px w-7 bg-primary/50" />Personnage
      </div>
      <div className="flex items-start gap-4">
        <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary"><WandSparkles className="size-5" /></div>
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Créer un personnage</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Un visage, un nom, un peuple et une classe : le reste de la fiche se complète ensuite.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-10">
        <section className="relative overflow-hidden rounded-[1.75rem] border bg-card/85 p-5 shadow-xl shadow-black/10 sm:p-7" style={{ borderColor: selectedClass?.accent ? `${selectedClass.accent}55` : undefined }}>
          <div className="absolute inset-x-0 top-0 h-1 transition-colors" style={{ background: selectedClass?.accent ? `linear-gradient(90deg, ${selectedClass.accent}, ${selectedClass.accent}66 58%, transparent)` : "linear-gradient(90deg, var(--primary), transparent)" }} />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            {/* Portrait */}
            <div className="mx-auto w-full max-w-64 lg:max-w-none">
              <label
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={drop}
                className={`group relative flex aspect-[3/4] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/60 text-muted-foreground shadow-inner transition ${dragging ? "border-primary bg-primary/10" : "border-transparent hover:border-primary/40"}`}
              >
                {preview && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Aperçu du portrait" className="size-full object-cover" onError={() => setFailedPreview(preview)} />
                ) : (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <CircleUserRound className="size-16 opacity-30" />
                    <span className="text-xs leading-5">{previewFailed ? "Cette image ne s’affiche pas." : avatarMode === "import" ? "Glisse une image ici ou clique pour la choisir" : "Colle le lien d’une image"}</span>
                  </div>
                )}
                {avatarMode === "import" && (
                  <>
                    <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImagePlus className="size-4" />{portraitFile ? "Changer" : "Choisir une image"}</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = "" }} />
                  </>
                )}
              </label>

              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border bg-background/50 p-1" role="tablist" aria-label="Source du portrait">
                {([["import", "Importer", Upload], ["url", "Lien", Link2]] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={avatarMode === mode}
                    onClick={() => setAvatarMode(mode)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${avatarMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="size-3.5" />{label}
                  </button>
                ))}
              </div>
              {avatarMode === "url" ? (
                <Input className="mt-2" type="url" inputMode="url" value={portraitUrl} onChange={(event) => setPortraitUrl(event.target.value)} placeholder="https://…" aria-label="Lien du portrait" />
              ) : portraitFile ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{portraitFile.name}</span>
                  <button type="button" onClick={() => setPortraitFile(null)} className="flex size-5 items-center justify-center rounded hover:bg-muted" aria-label="Retirer l’image"><X className="size-3.5" /></button>
                </div>
              ) : null}
            </div>

            {/* Identité */}
            <div className="min-w-0 space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="character-name">Nom</Label>
                <Input id="character-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Comment s’appelle ton personnage ?" className="h-12 font-display text-xl sm:text-2xl" autoFocus />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="character-people">Peuple</Label>
                <Input id="character-people" list="character-people-options" value={people} onChange={(event) => setPeople(event.target.value)} placeholder={peoples.length ? "Choisis ou écris un peuple" : "Peuple du personnage"} />
                <datalist id="character-people-options">{peoples.map((item) => <option key={item} value={item} />)}</datalist>
                {peoples.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {peoples.slice(0, 18).map((item) => {
                      const active = normalized(item) === normalized(people)
                      return <button key={item} type="button" onClick={() => setPeople(active ? "" : item)} className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>{item}</button>
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <Label>Classe{selectedClass && <span className="ml-2 font-display text-base" style={{ color: accent }}>{selectedClass.name}</span>}</Label>
                  {classes.length > 8 && (
                    <div className="relative w-full sm:w-56">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input value={classQuery} onChange={(event) => setClassQuery(event.target.value)} placeholder="Chercher une classe" className="h-8 pl-8 text-xs" aria-label="Chercher une classe" />
                    </div>
                  )}
                </div>
                {/* Toutes les classes restent visibles, en petites cartes de même hauteur :
                    une grille à hauteur limitée écrasait les lignes après la première. */}
                <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
                  <button type="button" onClick={() => setClassName("")} aria-pressed={!className} className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 py-3 text-center text-[11px] leading-4 transition ${!className ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-primary/40"}`}>
                    <Sparkles className="size-5 opacity-70" />À choisir plus tard
                  </button>
                  {visibleClasses.map((item) => {
                    const active = item.name === className
                    const color = item.accent || "var(--primary)"
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setClassName(active ? "" : item.name)}
                        aria-pressed={active}
                        title={item.name}
                        className="group relative flex flex-col items-center rounded-xl border bg-background/40 px-1.5 pb-2 pt-2.5 text-center transition hover:-translate-y-0.5 hover:shadow-md"
                        style={{ borderColor: active ? color : undefined, boxShadow: active ? `0 0 0 2px ${item.accent ? `${item.accent}55` : "var(--ring)"}` : undefined, backgroundColor: active && item.accent ? `${item.accent}10` : undefined }}
                      >
                        <div className="size-12 shrink-0">
                          <ClassImage src={item.imageUrl} alt="" className="size-full object-contain transition duration-500 group-hover:scale-[1.06]" fallbackClassName="rounded-full bg-muted/60 [&_span]:hidden [&_svg]:size-4" />
                        </div>
                        {active && <span className="absolute right-1.5 top-1.5 flex size-4.5 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}><Check className="size-3" /></span>}
                        <p className="mt-1.5 line-clamp-2 font-display text-xs font-semibold leading-[1.15rem]" style={{ color: item.accent || undefined }}>{item.name}</p>
                        {item.type && <p className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-muted-foreground">{item.type}</p>}
                      </button>
                    )
                  })}
                  {!visibleClasses.length && classes.length > 0 && <p className="col-span-full py-6 text-center text-xs text-muted-foreground">Aucune classe ne correspond.</p>}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">Réussite critique à 5 et échec critique à 96 par défaut, modifiables ensuite sur la fiche.</p>
            </div>
          </div>
        </section>

        {error && <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
        <div className="sticky bottom-4 mt-6 flex justify-end rounded-2xl border bg-background/90 p-3 shadow-lg backdrop-blur">
          <Button type="submit" size="lg" disabled={pending || !name.trim()}>
            {pending ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
            Créer le personnage
          </Button>
        </div>
      </form>
    </div>
  )
}
