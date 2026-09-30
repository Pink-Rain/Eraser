import { Map } from "lucide-react"

export function TabletopDisabled() {
  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center">
        <div>
          <Map className="mx-auto size-9 text-primary/45" />
          <h1 className="font-display mt-3 text-2xl font-semibold">Tabletop éteint</h1>
          <p className="mt-2 text-sm text-muted-foreground">Non prioritaire, utilisation de Roll20</p>
        </div>
      </div>
    </div>
  )
}
