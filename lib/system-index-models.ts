/**
 * Les index dont Eraser lit chaque colonne à une place précise (sorts, PNJ) ou qui ne
 * viennent pas d'une feuille (campagnes, personnages). L'éditeur les montre en lecture
 * seule : chaque cadenas dit ce qui lit la colonne, pour décider plus tard quoi ouvrir.
 */
import type { IndexColumnSpec } from "@/lib/index-columns"
import { lockedPolicy, type IndexEditorModel } from "@/lib/index-schema-shared"

type Column = { header: string; spec: IndexColumnSpec; reasons: string[] }

function model(input: { family: IndexEditorModel["family"]; key: string; title: string; tab: string; columns: Column[]; readOnlyReason: string; addColumnsReason: string; addTabsReason: string }): IndexEditorModel {
  return {
    family: input.family,
    key: input.key,
    title: input.title,
    readOnly: true,
    readOnlyReason: input.readOnlyReason,
    addTabs: false,
    addTabsReason: input.addTabsReason,
    relationTargets: [],
    tabs: [{
      name: input.tab,
      remove: false,
      removeReason: input.addTabsReason,
      addColumns: false,
      addColumnsReason: input.addColumnsReason,
      columns: input.columns.map((column) => ({ header: column.header, spec: column.spec, policy: lockedPolicy(column.reasons, "Rien pour l’instant : cet index est lu par le code d’Eraser.") })),
    }],
  }
}

const spellSheet = "La feuille des sorts est lue par Eraser d’après ses en-têtes (« Nom », « Effet », « Type »…) : renommer une colonne ou changer son type la rendrait illisible."

export function spellEditorModel(kind: "classes" | "creatures"): IndexEditorModel {
  const columns: Column[] = [
    { header: "Nom", spec: { kind: "name", also: ["fixed"] }, reasons: ["Les fiches de classe, les sorts des créatures et des PNJ et la fusion des doublons retrouvent un sort par son nom.", spellSheet] },
    { header: "Effet", spec: { kind: "rich" }, reasons: ["Affiché sur les fiches de classe et les cartes de sorts des créatures et des PNJ.", spellSheet] },
    { header: "Description", spec: { kind: "rich", display: "muted" }, reasons: ["Affichée sous l’effet sur les cartes de sorts.", spellSheet] },
    { header: "Type", spec: { kind: "choice", also: ["fixed"], allowCustom: true }, reasons: ["Décide de la catégorie du sort (actif, passif, bonus), de sa couleur et de l’onglet où il apparaît.", spellSheet] },
    { header: "Compétences", spec: { kind: "fixed", display: "skills" }, reasons: ["Affichées en rouge sur les cartes de sorts.", spellSheet] },
    { header: "Distance", spec: { kind: "rich" }, reasons: ["Affichée sur les cartes des sorts actifs.", spellSheet] },
    { header: "Charges", spec: { kind: "gauge", also: ["number"], gauge: { style: "icons", max: 5 } }, reasons: ["Les étincelles des cartes de sorts ; elles se dépensent en jeu sur les fiches.", spellSheet] },
    ...(kind === "classes" ? [{ header: "Classes et rangs", spec: { kind: "ranked-links" }, reasons: ["Une colonne par classe dans la feuille, avec le rang du sort (trois sorts au plus par rang) : la page de chaque classe et les rangs des personnages s’en servent."] } satisfies Column] : []),
    { header: "ID", spec: { kind: "id", hidden: true }, reasons: ["Relie le sort aux personnages qui l’ont appris et aux doublons marqués « ignorés ».", spellSheet] },
  ]
  return model({
    family: "spells",
    key: kind,
    title: kind === "classes" ? "Sorts des classes" : "Sorts des créatures",
    tab: "Sorts",
    columns,
    readOnlyReason: "Les sorts sont lus colonne par colonne par Eraser : fiches de classe, créatures, PNJ, doublons. Rien n’est modifiable ici pour l’instant ; les cadenas disent ce qui casserait.",
    addColumnsReason: "Pas encore : une colonne libre ne serait lue nulle part par les sorts.",
    addTabsReason: "Un seul onglet « Sorts » est lu.",
  })
}

const npcSheet = "La feuille « PNJs » est lue par position (colonnes A à AK) : campagnes, sessions, groupe des joueurs, tokens et Roll20 en dépendent. Changer une colonne décalerait tous les PNJ."

export function npcEditorModel(): IndexEditorModel {
  return model({
    family: "npcs",
    key: "npcs",
    title: "PNJs",
    tab: "PNJs",
    columns: [
      { header: "Nom", spec: { kind: "name-form", also: ["fixed"] }, reasons: ["Ouvre la fiche du PNJ ; les campagnes où figure un PNJ du même nom sont retrouvées par ce nom.", npcSheet] },
      { header: "Titre", spec: { kind: "rich" }, reasons: ["Affiché sous le nom dans les campagnes, les sessions et le groupe des joueurs.", npcSheet] },
      { header: "Peuple", spec: { kind: "linked-choice", source: { index: "peoples", tab: "Peuples" } }, reasons: ["Liste liée à l’Index des peuples : un peuple absent y est créé.", npcSheet] },
      { header: "Fonction / classe / métier", spec: { kind: "rich" }, reasons: ["Colonne « Classe / métier » de la feuille.", npcSheet] },
      { header: "Campagnes", spec: { kind: "auto-links" }, reasons: ["Calculée par Eraser à partir des campagnes : rien n’est stocké dans la feuille."] },
      { header: "Important", spec: { kind: "checkbox" }, reasons: ["Colonne « PNJ important » : met le PNJ en avant dans sa campagne.", npcSheet] },
      { header: "ID", spec: { kind: "id", hidden: true }, reasons: ["Relie le PNJ à son sac à dos, à ses tokens et aux sessions.", npcSheet] },
    ],
    readOnlyReason: "Les PNJ sont lus colonne par colonne, à une place fixe. Rien n’est modifiable ici pour l’instant ; les cadenas disent ce qui casserait.",
    addColumnsReason: "Pas encore : la feuille des PNJ est lue par position, une colonne libre devrait d’abord être prévue par Eraser.",
    addTabsReason: "Un seul onglet « PNJs » est lu (les PNJ génériques y sont rangés comme les autres).",
  })
}

const database = "Cet index vient de la base d’Eraser (et, d’après la feuille de route, bientôt du serveur partagé) : ses colonnes sont calculées, elles ne sont pas stockées dans une feuille."

export function entityEditorModel(kind: "campaigns" | "characters"): IndexEditorModel {
  const campaign = kind === "campaigns"
  return model({
    family: kind,
    key: kind,
    title: campaign ? "Campagnes" : "Personnages",
    tab: campaign ? "Campagnes" : "Personnages",
    columns: [
      { header: campaign ? "Campagne" : "Personnage", spec: { kind: "name-form", also: ["fixed"] }, reasons: [campaign ? "Ouvre le tableau de bord de la campagne." : "Ouvre la fiche du personnage.", database] },
      ...(campaign ? [] : [{ header: "Classe", spec: { kind: "fixed" }, reasons: ["La classe et le rang viennent de la fiche du personnage.", database] } satisfies Column]),
      { header: "Propriétaire", spec: { kind: "fixed", display: "muted" }, reasons: ["Le compte qui possède l’élément ; l’administrateur le réattribue avec « Attribuer à ».", database] },
      { header: campaign ? "Personnages" : "Campagne(s)", spec: { kind: "auto-links" }, reasons: [campaign ? "Les personnages inscrits à la campagne, calculés par Eraser." : "Les campagnes du personnage, calculées par Eraser.", database] },
      { header: "ID", spec: { kind: "id", hidden: true }, reasons: ["L’identifiant de l’élément dans la base et dans les liens.", database] },
    ],
    readOnlyReason: database,
    addColumnsReason: database,
    addTabsReason: database,
  })
}
