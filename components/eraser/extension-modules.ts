/**
 * Ce qu'Eraser prête aux extensions (version `EXTENSION_API_VERSION`, lib/extensions.ts) : une
 * extension n'embarque ni React ni le routeur ni les pièces d'Eraser, elle les demande ici
 * (`window.EraserExtensions.require("@/components/ui/button")`). Ainsi elle rend dans la coque
 * d'Eraser, avec ses contextes, ses styles et ses composants tels qu'ils sont dans cette version.
 *
 * Chargé seulement quand une extension s'ouvre, dans le navigateur : jamais un module qui tire du
 * code du serveur (Worker, Google, base locale), vérifié par tests/extensions.test.mjs ; une
 * extension n'en importe que les types. Ne jamais retirer ni renommer une entrée, ni
 * changer ce qu'exporte un module prêté sans mettre à jour les extensions qui s'en servent
 * (l'atelier des pages, Pink-Rain/Eraser_page) et, si une ancienne version d'extension ne peut
 * plus tourner, incrémenter `EXTENSION_API_VERSION`.
 */
import * as React from "react"
import * as ReactCompilerRuntime from "react/compiler-runtime"
import * as ReactJsxRuntime from "react/jsx-runtime"
import * as ReactDom from "react-dom"
import * as ReactDomClient from "react-dom/client"
import * as NextLink from "next/link"
import * as NextNavigation from "next/navigation"

import * as uiAlertDialog from "@/components/ui/alert-dialog"
import * as uiAlert from "@/components/ui/alert"
import * as uiBadge from "@/components/ui/badge"
import * as uiButton from "@/components/ui/button"
import * as uiCard from "@/components/ui/card"
import * as uiCheckbox from "@/components/ui/checkbox"
import * as uiCollapsible from "@/components/ui/collapsible"
import * as uiContextMenu from "@/components/ui/context-menu"
import * as uiDialog from "@/components/ui/dialog"
import * as uiDropdownMenu from "@/components/ui/dropdown-menu"
import * as uiHoverCard from "@/components/ui/hover-card"
import * as uiInput from "@/components/ui/input"
import * as uiLabel from "@/components/ui/label"
import * as uiNativeSelect from "@/components/ui/native-select"
import * as uiPopover from "@/components/ui/popover"
import * as uiProgress from "@/components/ui/progress"
import * as uiSelect from "@/components/ui/select"
import * as uiSeparator from "@/components/ui/separator"
import * as uiSheet from "@/components/ui/sheet"
import * as uiSkeleton from "@/components/ui/skeleton"
import * as uiTabs from "@/components/ui/tabs"
import * as uiTextarea from "@/components/ui/textarea"
import * as uiTooltip from "@/components/ui/tooltip"
import * as eraserAppShell from "@/components/eraser/app-shell"
import * as eraserCustomPageView from "@/components/eraser/custom-page-view"
import * as eraserEditorControls from "@/components/eraser/editor-controls"
import * as eraserIndexGauge from "@/components/eraser/index-gauge"
import * as eraserIndexPresentationsEditor from "@/components/eraser/index-presentations-editor"
import * as eraserIndexReferences from "@/components/eraser/index-references"
import * as eraserIndexWindows from "@/components/eraser/index-windows"
import * as eraserPageIndexBlock from "@/components/eraser/page-index-block"
import * as eraserPageSectionGrid from "@/components/eraser/page-section-grid"
import * as eraserPagesIndexViews from "@/components/eraser/pages-index-views"
import * as eraserRichText from "@/components/eraser/rich-text"
import * as libAppMenu from "@/lib/app-menu"
import * as libCustomPagesData from "@/lib/custom-pages-data"
import * as libCustomPages from "@/lib/custom-pages"
import * as libEraserModules from "@/lib/eraser-modules"
import * as libEraserPageBlueprints from "@/lib/eraser-page-blueprints"
import * as libIndexPresentations from "@/lib/index-presentations"
import * as libIndexSavedViews from "@/lib/index-saved-views"
import * as libIndexWindows from "@/lib/index-windows"
import * as libPageExplorer from "@/lib/page-explorer"
import * as libPageFolders from "@/lib/page-folders"
import * as libPageReplacements from "@/lib/page-replacements"
import * as libPagesIndexShared from "@/lib/pages-index-shared"
import * as libUtils from "@/lib/utils"

/**
 * Une copie marquée « module ES » : l'import par défaut d'une extension (`import Link from
 * "next/link"`) reçoit l'export par défaut, et non le module entier.
 */
function lent(namespace: object) {
  return Object.freeze({ ...namespace, __esModule: true })
}

const modules: Record<string, Readonly<Record<string, unknown>>> = {
  "react": lent(React),
  "react/compiler-runtime": lent(ReactCompilerRuntime),
  "react/jsx-runtime": lent(ReactJsxRuntime),
  "react-dom": lent(ReactDom),
  "react-dom/client": lent(ReactDomClient),
  "next/link": lent(NextLink),
  "next/navigation": lent(NextNavigation),
  "@/components/ui/alert-dialog": lent(uiAlertDialog),
  "@/components/ui/alert": lent(uiAlert),
  "@/components/ui/badge": lent(uiBadge),
  "@/components/ui/button": lent(uiButton),
  "@/components/ui/card": lent(uiCard),
  "@/components/ui/checkbox": lent(uiCheckbox),
  "@/components/ui/collapsible": lent(uiCollapsible),
  "@/components/ui/context-menu": lent(uiContextMenu),
  "@/components/ui/dialog": lent(uiDialog),
  "@/components/ui/dropdown-menu": lent(uiDropdownMenu),
  "@/components/ui/hover-card": lent(uiHoverCard),
  "@/components/ui/input": lent(uiInput),
  "@/components/ui/label": lent(uiLabel),
  "@/components/ui/native-select": lent(uiNativeSelect),
  "@/components/ui/popover": lent(uiPopover),
  "@/components/ui/progress": lent(uiProgress),
  "@/components/ui/select": lent(uiSelect),
  "@/components/ui/separator": lent(uiSeparator),
  "@/components/ui/sheet": lent(uiSheet),
  "@/components/ui/skeleton": lent(uiSkeleton),
  "@/components/ui/tabs": lent(uiTabs),
  "@/components/ui/textarea": lent(uiTextarea),
  "@/components/ui/tooltip": lent(uiTooltip),
  "@/components/eraser/app-shell": lent(eraserAppShell),
  "@/components/eraser/custom-page-view": lent(eraserCustomPageView),
  "@/components/eraser/editor-controls": lent(eraserEditorControls),
  "@/components/eraser/index-gauge": lent(eraserIndexGauge),
  "@/components/eraser/index-presentations-editor": lent(eraserIndexPresentationsEditor),
  "@/components/eraser/index-references": lent(eraserIndexReferences),
  "@/components/eraser/index-windows": lent(eraserIndexWindows),
  "@/components/eraser/page-index-block": lent(eraserPageIndexBlock),
  "@/components/eraser/page-section-grid": lent(eraserPageSectionGrid),
  "@/components/eraser/pages-index-views": lent(eraserPagesIndexViews),
  "@/components/eraser/rich-text": lent(eraserRichText),
  "@/lib/app-menu": lent(libAppMenu),
  "@/lib/custom-pages-data": lent(libCustomPagesData),
  "@/lib/custom-pages": lent(libCustomPages),
  "@/lib/eraser-modules": lent(libEraserModules),
  "@/lib/eraser-page-blueprints": lent(libEraserPageBlueprints),
  "@/lib/index-presentations": lent(libIndexPresentations),
  "@/lib/index-saved-views": lent(libIndexSavedViews),
  "@/lib/index-windows": lent(libIndexWindows),
  "@/lib/page-explorer": lent(libPageExplorer),
  "@/lib/page-folders": lent(libPageFolders),
  "@/lib/page-replacements": lent(libPageReplacements),
  "@/lib/pages-index-shared": lent(libPagesIndexShared),
  "@/lib/utils": lent(libUtils),
}

/** Les modules prêtés, par le nom sous lequel une extension les importe. */
export const lentModuleIds = Object.keys(modules)

export function eraserRequire(id: string) {
  const lentModule = modules[id]
  if (!lentModule) throw new Error(`Eraser ne prête pas « ${id} » aux extensions.`)
  return lentModule
}
