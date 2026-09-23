"use client"

import { Input } from "@/components/ui/input"
import { characteristicColor, characteristicOrder, characteristicShort, type CharacteristicName } from "@/lib/characteristics"

export function CharacteristicInputs({ values, onChange }: { values: Record<string, string>; onChange: (name: CharacteristicName, value: string) => void }) {
  return <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
    {characteristicOrder.map((name) => {
      const color = characteristicColor(name)
      return <label key={name} className="grid gap-1 rounded-xl border p-2 text-center text-[11px] font-semibold" style={{ backgroundColor: `${color}14`, borderColor: `${color}55`, borderTopWidth: 2, borderTopColor: color }}>
        <span style={{ color }}>{name}</span>
        <Input value={values[name] ?? ""} onChange={(event) => onChange(name, event.target.value)} inputMode="numeric" className="h-9 bg-background/70 text-center text-base font-semibold" />
      </label>
    })}
  </div>
}

export function CharacteristicBadges({ values, className = "" }: { values: Record<string, string | number>; className?: string }) {
  return <div className={`grid grid-cols-4 gap-1.5 sm:grid-cols-7 ${className}`}>
    {characteristicOrder.map((name) => {
      const color = characteristicColor(name)
      return <div key={name} title={name} className="rounded-lg border px-1 py-1.5 text-center" style={{ backgroundColor: `${color}14`, borderColor: `${color}55` }}>
        <span className="block text-[9px] font-bold tracking-wider" style={{ color }}>{characteristicShort[name]}</span>
        <span className="text-sm font-semibold tabular-nums">{values[name] ?? 0}</span>
      </div>
    })}
  </div>
}
