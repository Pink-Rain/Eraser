"use client"

import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Le bouton « ? » des éditeurs de spécificités : un clic ouvre l'explication (longue, avec
 * des exemples), un autre clic ou Échap la referme. `guide` : le grand « Comment remplir »
 * en tête d'un éditeur.
 */
export function HelpButton({ title, children, guide = false }: { title: string; children: ReactNode; guide?: boolean }) {
  return <Popover>
    <PopoverTrigger asChild>
      {guide
        ? <button type="button" className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"><CircleHelp className="size-3.5" />Comment remplir ?</button>
        : <button type="button" aria-label={`Aide : ${title}`} title="Aide" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"><CircleHelp className="size-3.5" /></button>}
    </PopoverTrigger>
    <PopoverContent side="bottom" align="start" collisionPadding={12} className={`max-h-[min(34rem,75vh)] overflow-y-auto rounded-xl p-4 text-xs leading-5 ${guide ? "w-[min(36rem,calc(100vw-2rem))]" : "w-[min(26rem,calc(100vw-2rem))]"}`} onOpenAutoFocus={(event) => event.preventDefault()}>
      <p className="mb-2 font-display text-sm font-semibold">{title}</p>
      <div className="space-y-2 [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal">{children}</div>
    </PopoverContent>
  </Popover>
}

/** Une valeur à taper telle quelle. */
const K = ({ children }: { children: ReactNode }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{children}</code>
/** Un exemple encadré. */
const Example = ({ title, children }: { title: string; children: ReactNode }) => <div className="rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary">{title}</p>{children}</div>

const formulaBasics = <>
  <p>Une <b>formule</b> mélange des nombres et des valeurs de la fiche écrites entre accolades. Le bouton <b>« Valeur de la fiche »</b> les insère pour toi, sans faute de frappe.</p>
  <ul>
    <li><K>{"{Points de vie max}"}</K> : la valeur telle qu’elle s’affiche sur la fiche (objets, états et formes compris).</li>
    <li>Opérations : <K>+</K> <K>-</K> <K>*</K> <K>/</K>, les parenthèses, et <K>%</K> : <K>{"{Maximum} * 50%"}</K> = la moitié.</li>
    <li>Majuscules et accents ne comptent pas : <K>{"{points de vie max}"}</K> marche aussi.</li>
  </ul>
  <p>Sous le champ, <b>« Exemple »</b> montre le résultat avec une fiche fictive (vie 60/100, niveau 5, tout le reste à 50). Un texte orange : la formule est à revoir.</p>
</>

/* ─────────────────────────────── Vue d'ensemble ─────────────────────────────── */

export const specificsOverviewHelp = <>
  <p>Les spécificités sont des <b>outils</b> à assembler pour une classe. Chacun s’affiche sur la fiche de tous les personnages qui ont cette classe.</p>
  <ul>
    <li><b>Jauge</b> : un nombre entre un minimum et un maximum (rage, mana, folie temporaire, charges…). Il peut être calculé depuis la fiche ou tenu par le joueur.</li>
    <li><b>Formes</b> : plusieurs formes, une seule active à la fois. La forme active change des valeurs de la fiche tant qu’elle est choisie.</li>
    <li><b>Deck</b> : des cartes que le joueur pioche, garde en main, défausse ou retire du jeu.</li>
  </ul>
  <p>Les outils se combinent : une jauge peut n’exister que dans une forme, et un effet de forme peut dépendre d’une jauge.</p>
  <p>Tout s’enregistre dans le classeur « Sorts de classe » (onglets Jauges, Formes, Decks, Cartes). Rien n’est recréé s’il existe déjà.</p>
</>

/* ─────────────────────────────── Jauge ─────────────────────────────── */

export const gaugeHelp = {
  guide: <>
    <p>Une jauge, c’est <b>un nombre entre un minimum et un maximum</b>, affiché sur la fiche en barre, en pastilles ou en chiffre. Pour la régler :</p>
    <ol>
      <li><b>Nom</b> et <b>couleur</b>.</li>
      <li><b>Maximum</b> : fixe, calculé depuis la fiche, ou choisi par le joueur.</li>
      <li><b>Valeur actuelle</b> : tenue par le joueur (boutons − / +), ou calculée depuis la fiche.</li>
      <li>Si besoin, <b>S’ajoute à</b> : la jauge compte dans une caractéristique.</li>
      <li><b>Emplacement</b> et <b>affichage</b> sur la fiche.</li>
      <li>Facultatif : <b>seuils</b>, <b>formes</b> où elle apparaît, <b>description</b>.</li>
    </ol>
    <p>L’<b>aperçu</b> à droite se met à jour en direct. Ses boutons se testent sans rien enregistrer.</p>
    <Example title="Rage du berserker (calculée)">
      <ul>
        <li>Maximum : <b>Relié à la fiche</b>, <K>{"{Points de vie max}"}</K></li>
        <li>Valeur actuelle : <b>Reliée à la fiche</b>, <K>{"{Points de vie max} - {Points de vie actuels}"}</K></li>
        <li>Seuil : à partir de <K>{"{Maximum} * 50%"}</K>, « Frénésie »</li>
      </ul>
    </Example>
    <Example title="Mana (tenue par le joueur)">
      <ul>
        <li>Maximum : <b>Relié à la fiche</b>, <K>{"{Intelligence} / 10"}</K>, ou <b>Fixe</b> <K>10</K></li>
        <li>Valeur actuelle : <b>Tenue par le joueur</b>, départ <K>{"{Maximum}"}</K> (pleine)</li>
      </ul>
    </Example>
    <Example title="Folie temporaire (Adepte d’Hepo)">
      <ul>
        <li>Maximum : <b>Fixe</b> (par exemple <K>10</K>) · Valeur actuelle : <b>Tenue par le joueur</b>, départ <K>0</K></li>
        <li><b>S’ajoute à</b> : <K>Folie</K>. Ses points sont de la vraie Folie.</li>
        <li><b>Formes</b> : coche « Forme 2 » et « Revenir à la valeur de départ en quittant ces formes ».</li>
      </ul>
    </Example>
  </>,
  max: <>
    <ul>
      <li><b>Fixe</b> : le même nombre pour tout le monde (<K>100</K>).</li>
      <li><b>Relié à la fiche</b> : une formule, recalculée dès que la fiche change (<K>{"{Points de vie max}"}</K>, <K>{"{Niveau} * 2 + 3"}</K>).</li>
      <li><b>Choisi par le joueur</b> : le nombre écrit ici est le maximum de départ. Le joueur le change ensuite sur sa fiche (par exemple quand il monte de niveau).</li>
    </ul>
    {formulaBasics}
  </>,
  current: <>
    <ul>
      <li><b>Tenue par le joueur</b> : il la change avec − / + ou en tapant une valeur. Le champ donne la <b>valeur de départ</b> d’un nouveau personnage, celle que rétablit le bouton de remise à zéro : <K>0</K> pour vide, <K>{"{Maximum}"}</K> pour pleine.</li>
      <li><b>Reliée à la fiche</b> : une formule. Le joueur ne la touche pas, elle suit la fiche. Exemple : <K>{"{Points de vie max} - {Points de vie actuels}"}</K> = les points de vie perdus.</li>
    </ul>
    <p>En plus des valeurs de la fiche, <K>{"{Minimum}"}</K> et <K>{"{Maximum}"}</K> désignent ceux de cette jauge.</p>
    <p>La valeur reste toujours entre le minimum et le maximum.</p>
  </>,
  step: <>
    <p><b>Pas</b> : combien ajoutent ou retirent les boutons − / + (1 en général, 5 ou 10 pour une grande jauge). Le joueur peut toujours taper une valeur précise.</p>
    <p><b>Remise à zéro</b> : affiche un bouton qui remet la valeur de départ (après un repos, un combat…).</p>
  </>,
  addTo: <>
    <p>La valeur de la jauge <b>s’ajoute à une caractéristique ou une compétence</b> de la fiche, comme un bonus d’état. Le survol de cette valeur sur la fiche montre d’où vient le bonus.</p>
    <Example title="Folie temporaire → Folie">
      <p>Folie 4 sur la fiche, Folie temporaire à 3 : la fiche affiche <b>Folie 7</b>. Tout ce qui lit <K>{"{Folie}"}</K> compte les 7, y compris les effets de forme (<K>{"+{Folie} * 2"}</K>) et les formules des autres jauges.</p>
    </Example>
    <p>Une jauge liée à des formes n’ajoute rien quand elle est cachée.</p>
    <p>Laisse vide si la jauge ne doit rien changer sur la fiche (une rage, une mana…).</p>
  </>,
  min: <>
    <p>La plus petite valeur possible, <K>0</K> si vide. Un nombre ou une formule, comme le maximum.</p>
    <p>Un minimum négatif est permis, pour une jauge qui va de <K>-10</K> à <K>10</K> par exemple.</p>
  </>,
  placement: <>
    <ul>
      <li><b>Sous la barre de vie</b> : dans la carte des points de vie, en petit. Le seuil atteint et la description s’affichent au survol.</li>
      <li><b>Sous les caractéristiques</b> : un bandeau sous les caractéristiques secondaires, en grand.</li>
      <li><b>Onglet Sorts</b> : en haut de l’onglet Sorts, pour ce qui sert surtout à lancer des sorts.</li>
    </ul>
  </>,
  display: <>
    <ul>
      <li><b>Barre</b> : une jauge qui se remplit, avec les seuils marqués dessus.</li>
      <li><b>Pastilles</b> : des points à cocher, un par unité (20 au plus). Idéal pour des charges ou des points de folie.</li>
      <li><b>Nombre</b> : juste « 3 / 10 ».</li>
    </ul>
  </>,
  thresholds: <>
    <p>Des <b>repères</b> sur la jauge : à partir de telle valeur, il se passe quelque chose.</p>
    <ul>
      <li><b>À partir de</b> : un nombre (<K>50</K>) ou une formule. Pour un pourcentage du maximum : <K>{"{Maximum} * 25%"}</K>, <K>{"{Maximum} * 50%"}</K>…</li>
      <li><b>Texte</b> : ce qui se passe. La barre d’outils met en forme (gras, couleurs, listes) et <K>{"{"}</K> cite une ligne d’index (<K>{"{Sorts:Boule de feu}"}</K>) qui s’ouvre au clic.</li>
    </ul>
    <p>Sur la fiche, le <b>dernier seuil atteint</b> s’affiche (au survol quand la jauge est sous la barre de vie).</p>
  </>,
  forms: <>
    <p>Coche les formes où la jauge <b>existe</b>. Elle est cachée dans les autres. Si rien n’est coché, elle est toujours là.</p>
    <p><b>Revenir à la valeur de départ en quittant ces formes</b> : en passant dans une forme non cochée, la valeur du joueur est remise à sa valeur de départ. Elle ne revient pas quand il retourne dans la forme.</p>
    <p>Cette liste ne propose que les formes déjà enregistrées pour la classe. Crée donc les formes <b>avant</b> la jauge.</p>
  </>,
  description: <>
    <p>Comment la jauge se remplit, ce qu’elle permet, ses règles. Elle s’affiche <b>au survol</b> de la jauge, partout sur la fiche.</p>
    <p>La barre d’outils met en forme le texte, et <K>{"{"}</K> cite une ligne d’index.</p>
  </>,
}

/* ─────────────────────────────── Formes ─────────────────────────────── */

export const formHelp = {
  guide: <>
    <p>Un <b>groupe de formes</b>, ce sont plusieurs formes dont <b>une seule est active</b> à la fois. Le joueur choisit la forme active d’un clic sur sa fiche. Ses <b>effets</b> changent alors des valeurs, comme un état : les valeurs de base ne sont jamais modifiées, et changer de forme enlève les effets de l’ancienne.</p>
    <ol>
      <li><b>Nom du groupe</b> : ce qu’affiche la fiche (« Forme », « Posture », « Aspect »).</li>
      <li><b>Emplacement</b> sur la fiche.</li>
      <li>Pour chaque forme : un <b>nom</b>, une <b>couleur</b>, des <b>effets</b> et une <b>description</b>. Coche la <b>forme de départ</b>, celle d’un nouveau personnage.</li>
    </ol>
    <Example title="Adepte d’Hepo, pas à pas">
      <ol>
        <li>Ici : « Forme 1 » (forme de départ, sans effet) et « Forme 2 ». Enregistre.</li>
        <li>Crée une <b>jauge</b> « Folie temporaire » : tenue par le joueur, départ <K>0</K>, <b>S’ajoute à</b> <K>Folie</K>, forme « Forme 2 » cochée, avec « Revenir à la valeur de départ en quittant ces formes ».</li>
        <li>Reviens ici. Dans Forme 2, ajoute un effet par valeur : cible <K>CaracX</K>, changement <K>{"+{Folie} * x"}</K>. Puis <K>CaracY</K> <K>{"+{Folie} * y"}</K> et <K>CompétenceZ</K> <K>{"+{Folie} * z"}</K>.</li>
      </ol>
      <p className="mt-1"><K>{"{Folie}"}</K> compte la folie classique <b>et</b> la temporaire. Pour ne compter que la temporaire, écris <K>{"{Folie temporaire}"}</K>.</p>
    </Example>
  </>,
  groupName: <><p>Le titre du sélecteur sur la fiche. Une classe peut avoir plusieurs groupes (une posture <b>et</b> un aspect), chacun avec sa forme active.</p></>,
  placement: gaugeHelp.placement,
  forms: <>
    <ul>
      <li><b>Nom</b> : le bouton sur la fiche.</li>
      <li><b>Couleur</b> : la forme active prend cette couleur, et ses effets aussi au survol des valeurs.</li>
      <li><b>Forme de départ</b> : celle d’un personnage qui n’a encore rien choisi. En général la forme « normale », sans effet.</li>
      <li>↑ ↓ : l’ordre des boutons. ✕ : retirer la forme (il en faut au moins deux).</li>
    </ul>
    <p>Renommer une forme garde le choix des joueurs. Les jauges liées par nom sont à recocher.</p>
  </>,
  effects: <>
    <p>Un effet = <b>une cible</b> (caractéristique, compétence ou points de vie, proposés dans la liste) et <b>un changement</b> :</p>
    <ul>
      <li><K>+10</K> / <K>-5</K> : ajoute ou retire.</li>
      <li><K>=50</K> : remplace la valeur.</li>
      <li><K>≥5</K> (ou <K>{">="}5</K>) : au moins 5. <K>≤20</K> (ou <K>{"<="}20</K>) : au plus 20.</li>
      <li><b>Une formule</b> : <K>{"+{Folie} * 2"}</K> = +2 par point de Folie. <K>{"-{Rage} / 2"}</K> = −1 tous les 2 points de rage. <K>{"+{Niveau} * 50%"}</K> = la moitié du niveau.</li>
    </ul>
    <p>Les puces <b>« Proportionnel à »</b> transforment le changement que tu viens de taper : <K>2</K>, puis un clic sur <K>{"{Folie}"}</K>, donne <K>{"+{Folie} * 2"}</K>.</p>
    <p>Une formule lit la fiche <b>avec</b> les jauges qui s’ajoutent à une valeur, mais <b>sans</b> les effets des formes, pour éviter qu’un effet compte sur lui-même.</p>
    <p>Sous le champ, l’exemple calcule l’effet avec les jauges à 3. Une ligne orange : le changement n’est pas compris.</p>
  </>,
  description: <><p>Ce que fait la forme, en plus de ses effets chiffrés : les règles, les conditions pour en changer… Elle s’affiche au survol du bouton de la forme. <K>{"{"}</K> cite une ligne d’index.</p></>,
}

/* ─────────────────────────────── Deck ─────────────────────────────── */

export const deckHelp = {
  guide: <>
    <p>Un <b>deck</b>, ce sont des cartes que le joueur fait passer d’une pile à l’autre sur sa fiche :</p>
    <ul>
      <li><b>Pioche</b> : les cartes pas encore tirées.</li>
      <li><b>Main</b> : les cartes tirées, visibles, avec leur effet au survol.</li>
      <li><b>Défausse</b> : les cartes jouées. Elles peuvent revenir dans la pioche.</li>
      <li><b>Retirées</b> : hors du jeu jusqu’à ce qu’on les remette.</li>
    </ul>
    <ol>
      <li><b>Nom</b> et <b>couleur</b> du deck.</li>
      <li><b>Tirage</b> au hasard ou au choix, et <b>main maximum</b>.</li>
      <li><b>Emplacement</b> sur la fiche, et éventuellement les <b>règles</b>.</li>
      <li>Les <b>cartes</b> : celles de l’onglet « Cartes » déjà écrites pour la classe sont reprises. Complète, modifie, ajoute.</li>
    </ol>
    <p>L’<b>aperçu</b> à droite se joue comme sur la fiche : pioche et défausse pour vérifier.</p>
    <Example title="Cartomancien·ne">
      <p>Nom <K>Tarot</K>, tirage <b>Au hasard</b>, main maximum <K>5</K>, emplacement <b>Onglet Sorts</b>. Les 12 cartes de l’onglet « Cartes » sont déjà là.</p>
    </Example>
  </>,
  draw: <>
    <ul>
      <li><b>Au hasard</b> : « Piocher » tire une carte au hasard dans la pioche.</li>
      <li><b>Au choix</b> : « Piocher » ouvre la liste de la pioche, et le joueur prend la carte qu’il veut. Le contenu de la pioche est alors visible.</li>
    </ul>
    <p>Dans les deux cas, le menu « … » permet de tirer au hasard dans la défausse, de remettre la défausse dans la pioche, ou de tout remettre dans la pioche.</p>
  </>,
  handLimit: <><p>Le nombre de cartes que le joueur peut avoir en main. Une main pleine bloque « Piocher » tant qu’il ne défausse pas. Vide ou 0 : sans limite.</p></>,
  placement: gaugeHelp.placement,
  rules: <><p>Les règles générales du deck : quand piocher, ce qui se passe à la défausse… Elles s’affichent repliées sous le deck (« Règles du deck »). <K>{"{"}</K> cite une ligne d’index.</p></>,
  cards: <>
    <ul>
      <li><b>n°</b> : le numéro de la carte, donné tout seul. Il l’identifie dans la fiche des joueurs : on ne le réutilise jamais pour une autre carte.</li>
      <li><b>Nom</b> : écrit sur la carte (<K>La mort (Pique)</K>).</li>
      <li><b>Icône du coin</b> (colonne « Icone ») : le petit dessin sous le numéro, comme le ♥ d’une carte à jouer.</li>
      <li><b>Illustration</b> (colonne « Illustration ») : le grand visuel au centre de la carte. Sans illustration, l’icône du coin s’affiche en grand au centre.</li>
      <li>Ces deux boutons proposent la même chose : une icône d’Eraser (recherche en français ou en anglais : crâne, cœur…), un émoji (<K>♠</K> <K>🃏</K>), l’import d’une image ou son adresse.</li>
      <li><b>Couleur</b> : la bordure et le numéro de la carte. « celle du deck » : la couleur choisie plus haut. Pratique pour distinguer les familles (Carreau, Cœur, Pique, Trèfle).</li>
      <li><b>Effet</b> : affiché au survol de la carte. Il se met en forme, et <K>{"{"}</K> cite une ligne d’index.</li>
    </ul>
    <p>Une carte ajoutée plus tard arrive d’elle-même dans la pioche des joueurs. Une carte retirée (✕) est supprimée de l’onglet « Cartes » à l’enregistrement et disparaît des fiches.</p>
  </>,
}
