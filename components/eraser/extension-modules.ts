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
 * (l'atelier des pages, Pink-Rain/Eraser_page ; les documents, Pink-Rain/Eraser_doc) et, si une
 * ancienne version d'extension ne peut plus tourner, incrémenter `EXTENSION_API_VERSION`.
 *
 * On ne prête que ce qu'Eraser garde pour lui-même (affichage, modèles, pièces partagées) : le
 * code qui ne sert qu'à une extension vit dans son dépôt, pas ici.
 */
import * as React from "react"
import * as ReactCompilerRuntime from "react/compiler-runtime"
import * as ReactJsxRuntime from "react/jsx-runtime"
import * as ReactDom from "react-dom"
import * as ReactDomClient from "react-dom/client"
import * as NextLink from "next/link"
import * as NextNavigation from "next/navigation"

import * as eraserAppShell from "@/components/eraser/app-shell"
import * as eraserAppTabs from "@/components/eraser/app-tabs"
import * as eraserCustomPageView from "@/components/eraser/custom-page-view"
import * as eraserDocumentViewer from "@/components/eraser/document-viewer"
import * as eraserEditorControls from "@/components/eraser/editor-controls"
import * as eraserEditorDock from "@/components/eraser/editor-dock"
import * as eraserIndexCard from "@/components/eraser/index-card"
import * as eraserIndexCardEditor from "@/components/eraser/index-card-editor"
import * as eraserIndexCells from "@/components/eraser/index-cells"
import * as eraserIndexFormView from "@/components/eraser/index-form-view"
import * as eraserIndexGauge from "@/components/eraser/index-gauge"
import * as eraserIndexLayoutEditor from "@/components/eraser/index-layout-editor"
import * as eraserIndexPresentation from "@/components/eraser/index-presentation"
import * as eraserIndexPresetsUi from "@/components/eraser/index-presets-ui"
import * as eraserIndexReferences from "@/components/eraser/index-references"
import * as eraserIndexRowSheet from "@/components/eraser/index-row-sheet"
import * as eraserIndexStats from "@/components/eraser/index-stats"
import * as eraserIndexVariantsPanel from "@/components/eraser/index-variants-panel"
import * as eraserIndexWindows from "@/components/eraser/index-windows"
import * as eraserPageIndexBlock from "@/components/eraser/page-index-block"
import * as eraserRichText from "@/components/eraser/rich-text"
import * as eraserViewRoles from "@/components/eraser/view-roles"
import * as uiAlert from "@/components/ui/alert"
import * as uiAlertDialog from "@/components/ui/alert-dialog"
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
import * as uiSidebar from "@/components/ui/sidebar"
import * as uiSkeleton from "@/components/ui/skeleton"
import * as uiTabs from "@/components/ui/tabs"
import * as uiTextarea from "@/components/ui/textarea"
import * as uiTooltip from "@/components/ui/tooltip"
import * as libAppMenu from "@/lib/app-menu"
import * as libCalendars from "@/lib/calendars"
import * as libCustomPages from "@/lib/custom-pages"
import * as libCustomPagesData from "@/lib/custom-pages-data"
import * as libDocumentModel from "@/lib/document-model"
import * as libEraserModules from "@/lib/eraser-modules"
import * as libEraserPageBlueprints from "@/lib/eraser-page-blueprints"
import * as libIndexAppearance from "@/lib/index-appearance"
import * as libIndexCards from "@/lib/index-cards"
import * as libIndexColumns from "@/lib/index-columns"
import * as libIndexLayoutDefaults from "@/lib/index-layout-defaults"
import * as libIndexLayouts from "@/lib/index-layouts"
import * as libIndexPresentations from "@/lib/index-presentations"
import * as libIndexSavedViews from "@/lib/index-saved-views"
import * as libIndexSchemaShared from "@/lib/index-schema-shared"
import * as libIndexStats from "@/lib/index-stats"
import * as libIndexWindows from "@/lib/index-windows"
import * as libPageFolders from "@/lib/page-folders"
import * as libPageReplacements from "@/lib/page-replacements"
import * as libPagesIndexShared from "@/lib/pages-index-shared"
import * as libUtils from "@/lib/utils"
import * as libViewRoles from "@/lib/view-roles"

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
  "@/components/eraser/app-shell": lent(eraserAppShell),
  "@/components/eraser/app-tabs": lent(eraserAppTabs),
  "@/components/eraser/custom-page-view": lent(eraserCustomPageView),
  "@/components/eraser/document-viewer": lent(eraserDocumentViewer),
  "@/components/eraser/editor-controls": lent(eraserEditorControls),
  "@/components/eraser/editor-dock": lent(eraserEditorDock),
  "@/components/eraser/index-card": lent(eraserIndexCard),
  "@/components/eraser/index-card-editor": lent(eraserIndexCardEditor),
  "@/components/eraser/index-cells": lent(eraserIndexCells),
  "@/components/eraser/index-form-view": lent(eraserIndexFormView),
  "@/components/eraser/index-gauge": lent(eraserIndexGauge),
  "@/components/eraser/index-layout-editor": lent(eraserIndexLayoutEditor),
  "@/components/eraser/index-presentation": lent(eraserIndexPresentation),
  "@/components/eraser/index-presets-ui": lent(eraserIndexPresetsUi),
  "@/components/eraser/index-references": lent(eraserIndexReferences),
  "@/components/eraser/index-row-sheet": lent(eraserIndexRowSheet),
  "@/components/eraser/index-stats": lent(eraserIndexStats),
  "@/components/eraser/index-variants-panel": lent(eraserIndexVariantsPanel),
  "@/components/eraser/index-windows": lent(eraserIndexWindows),
  "@/components/eraser/page-index-block": lent(eraserPageIndexBlock),
  "@/components/eraser/rich-text": lent(eraserRichText),
  "@/components/eraser/view-roles": lent(eraserViewRoles),
  "@/components/ui/alert": lent(uiAlert),
  "@/components/ui/alert-dialog": lent(uiAlertDialog),
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
  "@/components/ui/sidebar": lent(uiSidebar),
  "@/components/ui/skeleton": lent(uiSkeleton),
  "@/components/ui/tabs": lent(uiTabs),
  "@/components/ui/textarea": lent(uiTextarea),
  "@/components/ui/tooltip": lent(uiTooltip),
  "@/lib/app-menu": lent(libAppMenu),
  "@/lib/calendars": lent(libCalendars),
  "@/lib/custom-pages": lent(libCustomPages),
  "@/lib/custom-pages-data": lent(libCustomPagesData),
  "@/lib/document-model": lent(libDocumentModel),
  "@/lib/eraser-modules": lent(libEraserModules),
  "@/lib/eraser-page-blueprints": lent(libEraserPageBlueprints),
  "@/lib/index-appearance": lent(libIndexAppearance),
  "@/lib/index-cards": lent(libIndexCards),
  "@/lib/index-columns": lent(libIndexColumns),
  "@/lib/index-layout-defaults": lent(libIndexLayoutDefaults),
  "@/lib/index-layouts": lent(libIndexLayouts),
  "@/lib/index-presentations": lent(libIndexPresentations),
  "@/lib/index-saved-views": lent(libIndexSavedViews),
  "@/lib/index-schema-shared": lent(libIndexSchemaShared),
  "@/lib/index-stats": lent(libIndexStats),
  "@/lib/index-windows": lent(libIndexWindows),
  "@/lib/page-folders": lent(libPageFolders),
  "@/lib/page-replacements": lent(libPageReplacements),
  "@/lib/pages-index-shared": lent(libPagesIndexShared),
  "@/lib/utils": lent(libUtils),
  "@/lib/view-roles": lent(libViewRoles),
}

/** Les modules prêtés, par le nom sous lequel une extension les importe. */
export const lentModuleIds = Object.keys(modules)

export function eraserRequire(id: string) {
  const lentModule = modules[id]
  if (!lentModule) throw new Error(`Eraser ne prête pas « ${id} » aux extensions.`)
  return lentModule
}
