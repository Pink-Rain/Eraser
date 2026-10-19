"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      {/* Eraser : la coche suit l'état de la case en CSS. L'indicateur de Radix passait par
          Presence, qui lit les styles calculés de chaque case à son apparition : un index de
          centaines de lignes à cases cochées recalculait ses styles des milliers de fois. */}
      <span
        data-slot="checkbox-indicator"
        className="pointer-events-none hidden place-content-center text-current transition-none group-data-[state=checked]/checkbox:grid group-data-[state=indeterminate]/checkbox:grid"
      >
        <CheckIcon className="size-3.5" />
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
