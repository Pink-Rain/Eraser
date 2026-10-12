import { CalendarDays, Puzzle, Search, CornerDownLeft, TableProperties, ChartColumn, GalleryHorizontalEnd, Heading, Image, LayoutDashboard, LayoutGrid, LayoutList, Link2, ListTree, LockKeyhole, MessageSquareQuote, Minus, NotebookPen, PanelLeft, ScrollText, SquareKanban, Table2, Text, TextQuote, Waypoints, type LucideIcon } from "lucide-react"

import type { BlockType, ViewBlockKind } from "@/lib/custom-pages"

/** L'icône de chaque bloc du créateur de pages, et de chaque vue d'index. */
export const blockIcons: { blocks: Record<BlockType, LucideIcon>; views: Record<ViewBlockKind, LucideIcon> } = {
  blocks: {
    title: Heading,
    text: Text,
    callout: MessageSquareQuote,
    quote: TextQuote,
    image: Image,
    separator: Minus,
    link: Link2,
    secret: LockKeyhole,
    notes: NotebookPen,
    view: LayoutDashboard,
    stat: ChartColumn,
    rowfields: TableProperties,
    backlinks: CornerDownLeft,
    search: Search,
    module: Puzzle,
  },
  views: {
    "table": Table2,
    "cards": LayoutGrid,
    "list": LayoutList,
    "kanban": SquareKanban,
    "master-detail": PanelLeft,
    "calendar": CalendarDays,
    "dashboard": LayoutDashboard,
    "gallery": GalleryHorizontalEnd,
    "timeline": Waypoints,
    "tree": ListTree,
    "codex": ScrollText,
  },
}
