"use client"

import { useMemo, useState } from "react"
import { BookOpen, Search } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { actionStepCatalog } from "@/lib/index-actions"
import { foldName, formulaResultLabels, indexColumnKinds, kindGroups, placementLabels, randomSourceLabels, type IndexColumnKind } from "@/lib/index-columns"
import {
  computeFormulaDisplay,
  formulaCategories,
  formulaDisplayText,
  formulaFunctions,
  formulaOperators,
  formulaSampleRow,
  sampleFormulaContext,
  seededRandom,
} from "@/lib/index-formula"

export type GuideSection = "types" | "settings" | "formulas" | "buttons" | "random"

const sections: Array<{ key: GuideSection; label: string }> = [
  { key: "types", label: "Types de colonnes" },
  { key: "settings", label: "Réglages communs" },
  { key: "formulas", label: "Formules" },
  { key: "buttons", label: "Boutons" },
  { key: "random", label: "Aléatoire" },
]

const code = "rounded bg-muted px-1 py-0.5 font-mono text-[12px]"
const h3 = "mt-5 font-display text-lg font-semibold first:mt-0"
const p = "mt-1.5 text-sm leading-6 text-muted-foreground"

function exampleResult(formula: string, random: boolean) {
  const display = computeFormulaDisplay(formula, sampleFormulaContext(random ? seededRandom(formula) : undefined))
  if (display.kind === "checkbox") return display.value ? "VRAI" : "FAUX"
  return formulaDisplayText(display)
}

function TypesSection({ query }: { query: string }) {
  const kinds = (Object.keys(indexColumnKinds) as IndexColumnKind[]).filter((kind) => !["fixed", "archived"].includes(kind))
  return <>
    <p className={p}>Chaque colonne a un type : il décide de sa case dans le tableau, de son champ dans la fiche, de son tri et de ce qui est écrit dans Google Sheets. On le choisit dans « Modifier ». Survole un en-tête de colonne pour lire son type (par exemple « Jauge (icônes, propre à chaque case) · Nombre »).</p>
    {kindGroups.map((group) => {
      const items = kinds.filter((kind) => indexColumnKinds[kind].group === group && (!query || foldName(`${indexColumnKinds[kind].label} ${indexColumnKinds[kind].description} ${(indexColumnKinds[kind].settings ?? []).join(" ")}`).includes(query)))
      if (!items.length) return null
      return <section key={group}>
        <h3 className={h3}>{group}</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {items.map((kind) => {
            const info = indexColumnKinds[kind]
            return <article key={kind} className="rounded-xl border bg-card/60 p-3">
              <p className="flex items-center gap-2 font-semibold">{info.label}{!info.creatable && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">posé par Eraser</span>}</p>
              <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
              {info.settings && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{info.settings.map((setting) => <li key={setting}>{setting}</li>)}</ul>}
              {info.example && <p className="mt-2 text-xs"><span className="font-semibold">Exemple :</span> {info.example}</p>}
            </article>
          })}
        </div>
      </section>
    })}
    <h3 className={h3}>La jauge, en détail</h3>
    <p className={p}>Une jauge, ce sont des icônes (ou une barre, ou un anneau) qu’on remplit. Pour chaque colonne Jauge, on choisit jusqu’où elle va :</p>
    <ul className="mt-2 grid gap-2 text-sm md:grid-cols-3">
      <li className="rounded-xl border p-3"><b>Même maximum pour toute la colonne.</b><br />On règle « sur 5 » une fois. La case « 2 » donne ✦✦✧✧✧. Pour une note sur 5, un niveau de danger.</li>
      <li className="rounded-xl border p-3"><b>Chaque case a sa propre jauge.</b><br />Le nombre tapé est le nombre d’icônes : « 3 » donne ✦✦✦. Ce sont les charges des sorts : l’index fixe leur nombre, la fiche de personnage les dépense.</li>
      <li className="rounded-xl border p-3"><b>Maximum lu dans une autre colonne.</b><br />« PV » se remplit sur « PV max » de la même ligne : 12 sur 20 pour un gobelin, 150 sur 300 pour un dragon.</li>
    </ul>
  </>
}

function SettingsSection() {
  return <>
    <h3 className={h3}>Nom et description</h3>
    <p className={p}>Le nom est l’en-tête de la colonne dans Google Sheets. La description s’affiche au survol de l’en-tête et à côté du champ dans la fiche.</p>
    <h3 className={h3}>Emplacement</h3>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li><b>{placementLabels.both}</b> : la colonne est dans le tableau, dans la fiche de la ligne et dans le formulaire d’ajout.</li>
      <li><b>{placementLabels.table}</b> : seulement dans le tableau.</li>
      <li><b>{placementLabels.sheet}</b> : seulement dans la fiche et le formulaire d’ajout (le survol de l’en-tête affiche « · Formulaire »). C’est le cas du portrait ou des caractéristiques des créatures.</li>
    </ul>
    <p className={p}>La <b>fiche</b> s’ouvre en cliquant sur une colonne <b>Nom formulaire</b>, par clic droit sur la poignée d’une ligne (« Ouvrir la fiche ») ou avec un bouton « Ouvrir la fiche ».</p>
    <h3 className={h3}>Masquée</h3>
    <p className={p}>La colonne est cachée du tableau ; le bouton « Colonnes masquées (N) » de la barre du tableau la montre d’un clic. Les identifiants sont masqués d’office.</p>
    <h3 className={h3}>Style imposé</h3>
    <p className={p}>Possible sur tous les types. Toute la colonne prend le même style : gras, italique, souligné, barré, couleur du texte, couleur de fond, taille, police (normale, avec empattement, machine à écrire, titre), casse (MAJUSCULES, minuscules, Majuscule Au Début), alignement. Sur une colonne Texte, la mise en forme propre à chaque case est alors retirée à l’enregistrement : c’est ce qui garde le Nom en gras et les Compétences en rouge. Sans style imposé, une colonne Texte garde la mise en forme de chaque case.</p>
    <h3 className={h3}>Place des colonnes et des onglets</h3>
    <p className={p}>Fais glisser une colonne ou un onglet par sa poignée (⠿), ou utilise les flèches. Les colonnes sont déplacées dans Google Sheets aussi.</p>
    <h3 className={h3}>Cadenas</h3>
    <p className={p}>Un cadenas marque ce qu’Eraser lit ailleurs (inventaire, boutiques, fiches, liens…). Son survol dit ce qui casserait et ce qu’on peut quand même changer. L’affichage reste toujours modifiable : description, masquée, style imposé, emplacement, place, et passer de Nom à Nom formulaire.</p>
    <h3 className={h3}>Corbeille</h3>
    <p className={p}>Une colonne ou un onglet supprimé part dans la corbeille (Administration › Corbeille), d’où on peut le restaurer. « Supprimer définitivement » l’efface de la feuille.</p>
  </>
}

function FormulasSection({ query }: { query: string }) {
  const functions = formulaFunctions.filter((definition) => !query || foldName(`${definition.name} ${(definition.aliases ?? []).join(" ")} ${definition.description} ${definition.category}`).includes(query))
  return <>
    <p className={p}>Une colonne Formule calcule sa valeur à partir des autres colonnes de la même ligne. Rien ne s’y saisit : le résultat se met à jour tout seul. Les formules servent aussi dans les boutons (valeurs, conditions, adresses, messages) et dans l’Aléatoire (conditions, tirages).</p>
    <h3 className={h3}>L’essentiel</h3>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li>Une colonne s’écrit entre accolades : <code className={code}>{"{Prix}"}</code>, <code className={code}>{"{PV max}"}</code>. Majuscules et accents ne comptent pas.</li>
      <li>Un texte s’écrit entre guillemets : <code className={code}>&quot;Élite&quot;</code> (ou « Élite »).</li>
      <li>Les décimales s’écrivent <code className={code}>1,5</code> ou <code className={code}>1.5</code>.</li>
      <li>Les arguments d’une fonction sont séparés par un point-virgule : <code className={code}>SI({"{Rang}"} &gt;= 3; &quot;Élite&quot;; &quot;Commun&quot;)</code>. Une virgule suivie d’une espace marche aussi, mais <code className={code}>MAX(1,5)</code> se lit « 1,5 ».</li>
      <li>Les noms de fonctions s’écrivent en majuscules ou non, avec ou sans accents ; les noms anglais (IF, SUM…) marchent aussi.</li>
    </ul>
    <h3 className={h3}>Ce que vaut une colonne dans une formule</h3>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li><b>Nombre</b> : un nombre, dans l’unité par défaut de la colonne (« 50 PC » dans une colonne en PO vaut 0,5).</li>
      <li><b>Case à cocher</b> : VRAI ou FAUX.</li>
      <li><b>Liste à choix multiple, Colonne liée, Sélecteur de sorts</b> : une liste de valeurs (NB, JOINDRE, CONTIENT, ELEMENT…).</li>
      <li><b>Recherche</b> : la liste des valeurs d’en face ; <b>Agrégat</b> : son résultat.</li>
      <li><b>Autre formule</b> : son résultat (deux formules ne peuvent pas se citer l’une l’autre).</li>
      <li><b>Le reste</b> : le texte de la case, sans sa mise en forme. Un texte qui commence par un nombre (« 12 kg ») compte pour ce nombre dans un calcul.</li>
    </ul>
    <h3 className={h3}>Type du résultat</h3>
    <p className={p}>Dans les réglages de la colonne : {Object.values(formulaResultLabels).join(", ")}. « Automatique » affiche un nombre comme un nombre, VRAI/FAUX comme une case, une liste en pastilles. Un résultat Nombre prend le format choisi (unité PO/PC/PN, distance, décimales…).</p>
    <h3 className={h3}>Opérateurs</h3>
    <div className="mt-2 overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs"><tr><th className="px-3 py-2">Symbole</th><th className="px-3 py-2">Sens</th><th className="px-3 py-2">Exemple</th><th className="px-3 py-2">Résultat</th></tr></thead><tbody>
      {formulaOperators.map((operator) => <tr key={operator.symbol} className="border-t"><td className="px-3 py-2 font-mono">{operator.symbol}</td><td className="px-3 py-2 text-muted-foreground">{operator.meaning}</td><td className="px-3 py-2"><code className={code}>{operator.example}</code></td><td className="px-3 py-2 font-semibold">{exampleResult(operator.example, false)}</td></tr>)}
    </tbody></table></div>
    <h3 className={h3}>La ligne des exemples</h3>
    <p className={p}>Tous les exemples ci-dessous sont calculés en direct sur cette ligne :</p>
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{formulaSampleRow.map((column) => <span key={column.header} className="rounded-lg border bg-muted/30 px-2 py-1"><b>{column.header}</b> : {column.value || "(vide)"}</span>)}<span className="rounded-lg border bg-muted/30 px-2 py-1"><b>Peuples → Région</b> : Sylve, Montagnes</span></div>
    {formulaCategories.map((category) => {
      const items = functions.filter((definition) => definition.category === category.name)
      if (!items.length) return null
      return <section key={category.name}>
        <h3 className={h3}>{category.name}</h3>
        <p className="text-xs text-muted-foreground">{category.description}</p>
        <div className="mt-2 grid gap-2">
          {items.map((definition) => <article key={definition.name} className="rounded-xl border bg-card/60 p-3">
            <p className="font-mono text-sm font-semibold">{definition.signature}</p>
            {definition.aliases?.length ? <p className="text-[11px] text-muted-foreground">Aussi : {definition.aliases.join(", ")}</p> : null}
            <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>
            <ul className="mt-2 grid gap-1">
              {definition.examples.map((example) => <li key={example.formula} className="flex flex-wrap items-baseline gap-2 text-sm">
                <code className={code}>{example.formula}</code>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold">{definition.random ? example.result : exampleResult(example.formula, false)}</span>
                {definition.random && <span className="text-xs text-muted-foreground">(par exemple : {exampleResult(example.formula, true)})</span>}
                {example.note && <span className="text-xs text-muted-foreground">— {example.note}</span>}
              </li>)}
            </ul>
          </article>)}
        </div>
      </section>
    })}
    {!functions.length && <p className="mt-4 text-sm text-muted-foreground">Aucune fonction ne correspond à « {query} ».</p>}
    <h3 className={h3}>Erreurs</h3>
    <p className={p}>Une formule mal écrite affiche <b>#ERREUR</b> dans sa case ; le survol explique pourquoi (parenthèse manquante, colonne inconnue, texte au lieu d’un nombre…). L’éditeur vérifie la formule pendant la frappe et montre le résultat sur les premières lignes.</p>
  </>
}

function ButtonsSection() {
  const groups = [...new Set(actionStepCatalog.map((step) => step.group))]
  return <>
    <p className={p}>Une colonne Boutons met un ou plusieurs boutons dans chaque case. Chaque bouton a un libellé, une icône, une couleur, et au besoin :</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li><b>une confirmation</b> : un message à valider avant d’agir (« Supprimer {"{Nom}"} ? ») ;</li>
      <li><b>une condition d’affichage</b> : une formule ; le bouton n’apparaît que si elle est vraie (<code className={code}>{"{Charges}"} &gt; 0</code>) ;</li>
      <li><b>des étapes</b>, exécutées dans l’ordre d’un seul clic. Une étape qui échoue arrête les suivantes et affiche pourquoi.</li>
    </ul>
    <h3 className={h3}>Écrire une valeur</h3>
    <p className={p}>Les textes des étapes acceptent les colonnes entre accolades : <code className={code}>{"{Nom} attaque !"}</code>. Un texte qui commence par <code className={code}>=</code> est une formule : <code className={code}>{"={PV} - DES(\"1d6\")"}</code>. Pour « Augmenter / diminuer », le nombre est toujours une formule : <code className={code}>-1</code>, <code className={code}>{"{Bonus}"}</code>. Une valeur écrite dans un Nombre garde son unité ; dans une case à cocher, elle devient Oui ou Non.</p>
    {groups.map((group) => <section key={group}>
      <h3 className={h3}>{group}</h3>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {actionStepCatalog.filter((step) => step.group === group).map((step) => <article key={step.type} className="rounded-xl border bg-card/60 p-3">
          <p className="font-semibold">{step.label}{step.only && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{step.only === "objects" ? "index des objets" : "index du monde"}</span>}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
          {step.fields.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Réglages : {step.fields.map((field) => field.label).join(", ")}.</p>}
        </article>)}
      </div>
    </section>)}
    <h3 className={h3}>Exemples</h3>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li><b>« −1 charge »</b> : Augmenter / diminuer « Charges » de <code className={code}>-1</code>, minimum <code className={code}>0</code> ; condition <code className={code}>{"{Charges}"} &gt; 0</code>.</li>
      <li><b>« Soigner »</b> : Augmenter « PV » de <code className={code}>{"DES(\"2d8\")"}</code>, maximum <code className={code}>{"{PV max}"}</code> ; puis Afficher un message <code className={code}>{"{Nom} : ={PV} PV"}</code>.</li>
      <li><b>« Un PNJ de ce peuple »</b> : Créer une ligne dans l’Index des lieux, des peuples… avec « Peuple » = <code className={code}>{"{Nom}"}</code>, et ouvrir l’index ensuite.</li>
      <li><b>« Annoncer »</b> : Envoyer dans le chat d’une campagne <code className={code}>{"{Nom} surgit des fourrés !"}</code> ; la campagne est demandée au premier clic.</li>
    </ul>
    <p className={p}>Pas encore : envoyer vers Roll20 (le pont actuel ne lit que les PNJ et les sessions), ajouter à une session ou à une boutique, lancer un jet dans la table. Ils demandent chacun un choix de campagne et de session qui n’existe pas encore côté index.</p>
  </>
}

function RandomSection() {
  return <>
    <p className={p}>Une colonne Aléatoire tire au sort et écrit le résultat dans sa case (il est donc gardé dans Google Sheets). On choisit ce qu’on tire :</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {Object.entries(randomSourceLabels).map(([key, label]) => <li key={key}><b>{label}</b>{{
        number: " : entre un minimum et un maximum, entier ou avec des décimales.",
        dice: " : « 1d20 », « 2d6+1 », « 3d8 - 2 »… Le détail des dés s’affiche après le tirage.",
        list: " : chaque option a un poids ; une option de poids 3 sort trois fois plus souvent qu’une option de poids 1, un poids 0 ne sort jamais.",
        index: " : cet index ou un autre, un onglet ou tous ; une condition (formule sur les colonnes de l’index tiré, par exemple {Région} = \"Nord\") ; une colonne de poids (un nombre par ligne) ; la colonne à écrire (le Nom, par défaut).",
        column: " : une des valeurs d’une autre colonne de la ligne (une liste à choix multiple, une colonne liée…).",
        formula: " : n’importe quelle formule ; ALEA, ALEA.ENTRE, DES et TIRER y font le hasard.",
      }[key]}</li>)}
    </ul>
    <p className={p}><b>Nombre de tirages</b> : plusieurs résultats séparés par des virgules, avec ou sans doublons.</p>
    <p className={p}><b>Figé</b> : une fois la case remplie, le dé disparaît (un cadenas le remplace). Pour retirer quand même : vider la case, ou un bouton avec l’étape « Tirer au sort ». <b>Relançable</b> : le dé reste, chaque clic retire.</p>
    <h3 className={h3}>Tirer une ligne</h3>
    <p className={p}>Le bouton « Tirer » de la barre de chaque index tire une ligne au hasard parmi celles affichées : la recherche et les filtres du tableau décident de la table. On peut pondérer par une colonne numérique. Le bestiaire devient une table de rencontres : filtre les créatures de la région, pondère par une colonne « Chance », tire.</p>
  </>
}

/** Le guide « ? » : tout ce qu'on peut faire avec les colonnes, sans avoir à demander. */
export function IndexGuide({ open, section: initial = "types", onClose }: { open: boolean; section?: GuideSection; onClose: () => void }) {
  const [section, setSection] = useState<GuideSection>(initial)
  const [search, setSearch] = useState("")
  const query = useMemo(() => foldName(search), [search])
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="flex h-[90svh] flex-col gap-3 sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-2xl"><BookOpen className="size-5 text-primary" />Guide des colonnes</DialogTitle>
        <DialogDescription>Tout ce que savent faire les colonnes des index. Les exemples de formules sont calculés en direct.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        {sections.map((item) => <button key={item.key} type="button" onClick={() => setSection(item.key)} className={`rounded-full border px-3 py-1 text-sm ${section === item.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item.label}</button>)}
        {(section === "types" || section === "formulas") && <div className="relative ml-auto w-full sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === "formulas" ? "Chercher une fonction…" : "Chercher un type…"} className="h-8 pl-8 text-sm" /></div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {section === "types" && <TypesSection query={query} />}
        {section === "settings" && <SettingsSection />}
        {section === "formulas" && <FormulasSection query={query} />}
        {section === "buttons" && <ButtonsSection />}
        {section === "random" && <RandomSection />}
      </div>
    </DialogContent>
  </Dialog>
}
