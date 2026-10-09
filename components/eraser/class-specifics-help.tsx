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
/** Une façon de se servir de l'outil : son titre, puis comment la régler. */
const Recipe = ({ title, children }: { title: string; children: ReactNode }) => <div className="rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary">{title}</p>{children}</div>
/** Un intertitre dans une aide longue. */
const Part = ({ children }: { children: ReactNode }) => <p className="pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{children}</p>

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
  <p>Les spécificités sont des <b>outils génériques</b>. Tu les assembles comme tu veux pour donner à une classe ses règles propres. Chacun apparaît sur la fiche de tous les personnages qui ont cette classe.</p>
  <ul>
    <li><b>Jauge</b> : un nombre entre un minimum et un maximum. Il peut être calculé depuis la fiche ou tenu par le joueur, s’afficher en barre, en pastilles ou en chiffre, et même compter dans une caractéristique.</li>
    <li><b>Formes</b> : plusieurs états du personnage dont un seul est actif à la fois (forme, posture, aspect, stance, mode…). La forme active change des valeurs de la fiche tant qu’elle est choisie.</li>
    <li><b>Deck</b> : un paquet de cartes que le joueur pioche, garde en main, défausse ou retire du jeu.</li>
  </ul>
  <Part>Les combiner</Part>
  <ul>
    <li>Une <b>jauge liée à des formes</b> n’existe que dans ces formes, et peut se vider quand on en sort.</li>
    <li>Un <b>effet de forme</b> peut dépendre d’une jauge (<K>{"+{Jauge} * 2"}</K>) ou de n’importe quelle valeur de la fiche.</li>
    <li>Une <b>jauge qui s’ajoute à une caractéristique</b> fait grimper cette caractéristique, et tout ce qui la lit (formes, autres jauges) en tient compte.</li>
    <li>Une classe peut avoir <b>plusieurs</b> jauges, groupes de formes et decks à la fois.</li>
  </ul>
  <p>Tout s’enregistre dans le classeur « Sorts de classe » (onglets Jauges, Formes, Decks, Cartes), lisible et modifiable dans Google Sheets. Rien n’est recréé s’il existe déjà.</p>
</>

/* ─────────────────────────────── Jauge ─────────────────────────────── */

export const gaugeHelp = {
  guide: <>
    <p>Une jauge, c’est <b>un nombre entre un minimum et un maximum</b>, montré sur la fiche. Trois questions la définissent : d’où vient son <b>maximum</b>, qui tient sa <b>valeur actuelle</b>, et est-ce qu’elle <b>agit sur la fiche</b>. Le reste, c’est de la présentation.</p>
    <ol>
      <li><b>Nom</b> et <b>couleur</b>.</li>
      <li><b>Maximum</b> : fixe, calculé depuis la fiche, ou choisi par le joueur.</li>
      <li><b>Valeur actuelle</b> : tenue par le joueur (boutons − / +), ou calculée depuis la fiche.</li>
      <li><b>S’ajoute à</b> (facultatif) : sa valeur compte dans une caractéristique ou une compétence.</li>
      <li><b>Emplacement</b> et <b>affichage</b>.</li>
      <li>Facultatif : <b>seuils</b>, <b>formes</b> où elle existe, <b>description</b>.</li>
    </ol>
    <p>L’<b>aperçu</b> à droite se met à jour en direct ; ses boutons se testent sans rien enregistrer.</p>
    <Part>Ce qu’on peut en faire</Part>
    <Recipe title="Une ressource qu’on dépense et qu’on regagne">
      <p>Maximum fixe ou relié à la fiche, valeur <b>tenue par le joueur</b> avec un départ <K>{"{Maximum}"}</K> (pleine) et un bouton de remise à zéro. Le joueur retire avec −, récupère avec + ou d’un clic sur « remettre ».</p>
    </Recipe>
    <Recipe title="Une ressource qui s’accumule">
      <p>Départ <K>0</K>, tenue par le joueur. Elle monte au fil des actions, et les <b>seuils</b> disent ce qui se débloque à 3, à 5, à la moitié…</p>
    </Recipe>
    <Recipe title="Un reflet de la fiche, sans rien à cocher">
      <p>Valeur <b>reliée à la fiche</b> : la jauge se calcule seule. Par exemple les points de vie perdus : maximum <K>{"{Points de vie max}"}</K>, valeur <K>{"{Points de vie max} - {Points de vie actuels}"}</K>. N’importe quelle formule sur les caractéristiques, compétences, niveau ou vie fonctionne.</p>
    </Recipe>
    <Recipe title="Des charges ou des points à cocher">
      <p>Affichage <b>Pastilles</b>, maximum petit (3, 5, 10), pas de 1. Le joueur coche et décoche.</p>
    </Recipe>
    <Recipe title="Un maximum qui grandit avec le personnage">
      <p>Maximum relié (<K>{"{Niveau} * 2"}</K>, <K>{"{Caractéristique} / 10"}</K>), ou <b>choisi par le joueur</b> s’il l’augmente lui-même au fil des rangs.</p>
    </Recipe>
    <Recipe title="Un bonus temporaire à une caractéristique">
      <p>Tenue par le joueur, départ <K>0</K>, <b>S’ajoute à</b> la caractéristique. Chaque point de la jauge est un point de cette caractéristique sur la fiche.</p>
    </Recipe>
    <Recipe title="Une valeur propre à une forme">
      <p>Coche les <b>formes</b> où elle existe, et « Revenir à la valeur de départ en quittant ces formes » pour qu’elle se vide en sortant.</p>
    </Recipe>
    <Recipe title="Une jauge qui va dans le négatif">
      <p>Minimum <K>-10</K>, maximum <K>10</K>, départ <K>0</K> : un équilibre, une balance, une corruption qui penche d’un côté ou de l’autre.</p>
    </Recipe>
  </>,
  max: <>
    <ul>
      <li><b>Fixe</b> : le même nombre pour tout le monde (<K>100</K>).</li>
      <li><b>Relié à la fiche</b> : une formule, recalculée dès que la fiche change (<K>{"{Points de vie max}"}</K>, <K>{"{Niveau} * 2 + 3"}</K>).</li>
      <li><b>Choisi par le joueur</b> : le nombre écrit ici est le maximum de départ. Le joueur le change ensuite sur sa fiche.</li>
    </ul>
    {formulaBasics}
  </>,
  current: <>
    <ul>
      <li><b>Tenue par le joueur</b> : il la change avec − / + ou en tapant une valeur. Le champ donne la <b>valeur de départ</b> d’un nouveau personnage, celle que rétablit le bouton de remise à zéro : <K>0</K> pour vide, <K>{"{Maximum}"}</K> pour pleine, <K>{"{Maximum} * 50%"}</K> pour à moitié.</li>
      <li><b>Reliée à la fiche</b> : une formule. Le joueur ne la touche pas, elle suit la fiche (<K>{"{Points de vie max} - {Points de vie actuels}"}</K>, <K>{"{Caractéristique} - 50"}</K>…).</li>
    </ul>
    <p>En plus des valeurs de la fiche, <K>{"{Minimum}"}</K> et <K>{"{Maximum}"}</K> désignent ceux de cette jauge. La valeur reste toujours entre les deux.</p>
  </>,
  step: <>
    <p><b>Pas</b> : combien ajoutent ou retirent les boutons − / + (1 en général, 5 ou 10 pour une grande jauge, 0,5 pour des demi-points). Le joueur peut toujours taper une valeur précise.</p>
    <p><b>Remise à zéro</b> : un bouton qui remet la valeur de départ (repos, fin de combat, nouvelle scène…).</p>
  </>,
  addTo: <>
    <p>La valeur de la jauge <b>s’ajoute à une caractéristique ou une compétence</b> de la fiche, comme un bonus d’état. Au survol de cette valeur, la fiche montre d’où vient le bonus.</p>
    <ul>
      <li>Tout ce qui lit cette caractéristique compte le total : les effets de forme, les formules des autres jauges, les calculs de la fiche.</li>
      <li>Une jauge liée à des formes n’ajoute rien quand elle est cachée.</li>
      <li>Pour <b>retirer</b> au lieu d’ajouter, donne-lui un minimum négatif et fais-la descendre sous 0.</li>
    </ul>
    <p>Laisse vide si la jauge n’est qu’un compteur qui ne change rien sur la fiche.</p>
  </>,
  min: <>
    <p>La plus petite valeur possible, <K>0</K> si vide. Un nombre ou une formule, comme le maximum. Un minimum négatif est permis.</p>
  </>,
  placement: <>
    <ul>
      <li><b>Sous la barre de vie</b> : dans la carte des points de vie, en petit. Le seuil atteint et la description s’affichent au survol.</li>
      <li><b>Sous les caractéristiques</b> : un bandeau sous les caractéristiques secondaires, en grand.</li>
      <li><b>Onglet Sorts</b> : en haut de l’onglet Sorts, pour ce qui accompagne surtout les sorts.</li>
    </ul>
  </>,
  display: <>
    <ul>
      <li><b>Barre</b> : une jauge qui se remplit, avec les seuils marqués dessus.</li>
      <li><b>Pastilles</b> : des points à cocher, un par unité (20 au plus).</li>
      <li><b>Nombre</b> : juste « 3 / 10 ».</li>
    </ul>
  </>,
  thresholds: <>
    <p>Des <b>repères</b> sur la jauge : à partir de telle valeur, il se passe quelque chose. Autant que tu veux (12 au plus).</p>
    <ul>
      <li><b>À partir de</b> : un nombre (<K>50</K>) ou une formule. Pour un pourcentage du maximum : <K>{"{Maximum} * 25%"}</K>, <K>{"{Maximum} * 50%"}</K>… Une formule peut aussi lire la fiche (<K>{"{Niveau} * 2"}</K>).</li>
      <li><b>Texte</b> : ce qui se passe. La barre d’outils met en forme (gras, couleurs, listes) et <K>{"{"}</K> cite une ligne d’index qui s’ouvre au clic.</li>
    </ul>
    <p>Sur la fiche, le <b>dernier seuil atteint</b> s’affiche (au survol quand la jauge est sous la barre de vie).</p>
  </>,
  forms: <>
    <p>Coche les formes où la jauge <b>existe</b>. Elle est cachée dans les autres. Rien de coché : elle est toujours là.</p>
    <p><b>Revenir à la valeur de départ en quittant ces formes</b> : en passant dans une forme non cochée, la valeur du joueur revient à sa valeur de départ. Elle ne revient pas quand il retourne dans la forme.</p>
    <p>Seules les formes déjà enregistrées pour la classe sont proposées : crée les formes <b>avant</b> la jauge.</p>
  </>,
  description: <>
    <p>Comment la jauge se remplit, ce qu’elle permet, ses règles. Elle s’affiche <b>au survol</b> de la jauge, partout sur la fiche. La barre d’outils met en forme, et <K>{"{"}</K> cite une ligne d’index.</p>
  </>,
}

/* ─────────────────────────────── Formes ─────────────────────────────── */

export const formHelp = {
  guide: <>
    <p>Un <b>groupe de formes</b>, ce sont plusieurs formes dont <b>une seule est active</b> à la fois. Le joueur la choisit d’un clic sur sa fiche. Ses <b>effets</b> changent alors des valeurs, comme un état : les valeurs de base ne sont jamais modifiées, et changer de forme enlève les effets de l’ancienne.</p>
    <ol>
      <li><b>Nom du groupe</b> : le titre affiché sur la fiche.</li>
      <li><b>Emplacement</b> sur la fiche.</li>
      <li>Pour chaque forme : un <b>nom</b>, une <b>couleur</b>, des <b>effets</b> et une <b>description</b>. Coche la <b>forme de départ</b>, celle d’un nouveau personnage.</li>
    </ol>
    <Part>Ce qu’on peut en faire</Part>
    <Recipe title="Un état normal et un état transformé">
      <p>Deux formes : la forme de départ sans effet, et une seconde avec ses bonus et malus.</p>
    </Recipe>
    <Recipe title="Des postures à choisir selon la situation">
      <p>Trois formes ou plus, chacune avec ses avantages et ses contreparties (<K>+20</K> à une compétence, <K>-10</K> à une autre).</p>
    </Recipe>
    <Recipe title="Des bonus qui grandissent avec une ressource">
      <p>Un effet en formule : <K>{"+{Jauge} * 2"}</K> donne +2 par point de la jauge. Avec une jauge qui « s’ajoute à » une caractéristique, <K>{"+{Caractéristique} * 2"}</K> compte la caractéristique entière, bonus de la jauge compris.</p>
    </Recipe>
    <Recipe title="Des bonus qui dépendent du personnage">
      <p><K>{"+{Niveau}"}</K>, <K>{"+{Caractéristique} * 10%"}</K>, <K>{"-{Points de vie max} / 10"}</K> : n’importe quelle valeur de la fiche.</p>
    </Recipe>
    <Recipe title="Bloquer ou plafonner une valeur">
      <p><K>=0</K> remplace (une compétence inutilisable), <K>≥1</K> empêche de descendre sous 1, <K>≤50</K> plafonne.</p>
    </Recipe>
    <Recipe title="Une ressource qui n’existe que dans une forme">
      <p>Crée la forme, puis une <b>jauge</b> avec cette forme cochée et « Revenir à la valeur de départ en quittant ces formes ».</p>
    </Recipe>
    <Recipe title="Une forme qui pose un état">
      <p>Dans « États posés par cette forme », ajoute un état de l’Index des états : il est posé tant que la forme est active, et part au changement de forme. Couleurs, FX et effets de l’état compris.</p>
    </Recipe>
    <Recipe title="Plusieurs choix indépendants">
      <p>Plusieurs groupes pour la même classe (une posture <b>et</b> un élément, par exemple) : chacun a sa forme active, et leurs effets s’additionnent.</p>
    </Recipe>
  </>,
  groupName: <><p>Le titre du sélecteur sur la fiche (« Forme », « Posture », « Aspect », « Mode »…). Une classe peut avoir plusieurs groupes, chacun avec sa forme active.</p></>,
  placement: gaugeHelp.placement,
  forms: <>
    <ul>
      <li><b>Nom</b> : le bouton sur la fiche.</li>
      <li><b>Couleur</b> : la forme active prend cette couleur, et ses effets aussi au survol des valeurs.</li>
      <li><b>Forme de départ</b> : celle d’un personnage qui n’a encore rien choisi, en général la forme « normale », sans effet.</li>
      <li>↑ ↓ : l’ordre des boutons. ✕ : retirer la forme (il en faut au moins deux).</li>
    </ul>
    <p>Renommer une forme garde le choix des joueurs. Les jauges liées par nom sont à recocher.</p>
  </>,
  effects: <>
    <p>Un effet = <b>une cible</b> (caractéristique, compétence ou points de vie, proposés dans la liste) et <b>un changement</b>. Autant d’effets que tu veux par forme :</p>
    <ul>
      <li><K>+10</K> / <K>-5</K> : ajoute ou retire.</li>
      <li><K>=50</K> : remplace la valeur.</li>
      <li><K>≥5</K> (ou <K>{">="}5</K>) : au moins 5. <K>≤20</K> (ou <K>{"<="}20</K>) : au plus 20.</li>
      <li><b>Une formule</b> : <K>{"+{Jauge} * 2"}</K> = +2 par point de la jauge. <K>{"-{Jauge} / 2"}</K> = −1 tous les 2 points. <K>{"+{Niveau} * 50%"}</K> = la moitié du niveau. <K>{"≥{Niveau}"}</K> = au moins le niveau.</li>
    </ul>
    <p>Les puces <b>« Proportionnel à »</b> transforment le changement que tu viens de taper : <K>2</K>, puis un clic sur une puce, donne <K>{"+{…} * 2"}</K>.</p>
    <p>Une formule lit la fiche <b>avec</b> les jauges qui s’ajoutent à une valeur, mais <b>sans</b> les effets des formes, pour éviter qu’un effet compte sur lui-même.</p>
    <p>Sous le champ, l’exemple calcule l’effet avec les jauges à 3. Une ligne orange : le changement n’est pas compris.</p>
  </>,
  states: <>
    <p>Des états de l’<b>Index des états</b> que la forme <b>pose toute seule</b> tant qu’elle est active. En changeant de forme, ils partent, et ceux de la nouvelle forme arrivent.</p>
    <ul>
      <li>Sur la fiche, ils apparaissent dans les États avec la mention <b>Auto</b> : le joueur ne peut pas les retirer, mais il peut changer leur niveau et recliquer pour redéclencher leurs effets, comme pour un état posé à la main.</li>
      <li>En quittant la forme, ce que leurs effets ont écrit dans la fiche (dés, effets redéclenchés) est défait, sauf pour les effets dont « Retiré en sortant de l’état » est décoché.</li>
      <li>Leurs effets temporaires (+10, =100, ≥1), leurs couleurs, images et FX s’appliquent comme pour un état posé à la main.</li>
      <li>Pour un état à deux niveaux, choisis le niveau de départ : <b>niv. 1</b> ou <b>niv. 2</b>.</li>
      <li>Un état déjà posé à la main reste celui du joueur (avec son niveau à lui).</li>
    </ul>
    <p>C’est le moyen de réutiliser un état existant (sa description, ses effets, ses FX) au lieu de recopier ses effets dans la forme. Les deux se cumulent : effets de la forme + effets de ses états.</p>
  </>,
  description: <><p>Ce que fait la forme en plus de ses effets chiffrés : règles, conditions pour en changer, durée… Elle s’affiche au survol du bouton de la forme. <K>{"{"}</K> cite une ligne d’index.</p></>,
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
      <li><b>Tirage</b> (au hasard, au choix, ou les deux) et <b>main maximum</b>.</li>
      <li><b>Emplacement</b> sur la fiche, et éventuellement les <b>règles</b>.</li>
      <li>Les <b>cartes</b> : celles de l’onglet « Cartes » déjà écrites pour la classe sont reprises. Complète, modifie, ajoute.</li>
    </ol>
    <p>L’<b>aperçu</b> à droite se joue comme sur la fiche.</p>
    <Part>Ce qu’on peut en faire</Part>
    <Recipe title="Un tirage aléatoire de pouvoirs">
      <p>Tirage <b>au hasard</b>, main limitée : le joueur pioche, joue (Défausser), puis remet la défausse dans la pioche quand la règle le dit.</p>
    </Recipe>
    <Recipe title="Une main préparée">
      <p>Tirage <b>au choix</b> : le joueur compose sa main parmi toutes les cartes, comme des sorts préparés.</p>
    </Recipe>
    <Recipe title="Des règles qui mélangent les deux">
      <p>Tirage <b>au hasard ou au choix</b> : « Piocher » pour un tirage aléatoire, « Choisir » quand une règle autorise à prendre une carte précise.</p>
    </Recipe>
    <Recipe title="Des cartes à usage unique">
      <p>Le joueur les <b>retire</b> après usage au lieu de les défausser : elles ne reviennent qu’avec « Tout remettre dans la pioche ».</p>
    </Recipe>
    <Recipe title="Des familles de cartes">
      <p>Une <b>couleur</b> et une <b>icône du coin</b> par famille, et une <b>illustration</b> par carte pour les reconnaître d’un coup d’œil.</p>
    </Recipe>
    <Recipe title="Plusieurs paquets">
      <p>Plusieurs decks pour la même classe, chacun avec son tirage, sa main et son emplacement.</p>
    </Recipe>
  </>,
  draw: <>
    <ul>
      <li><b>Au hasard</b> : « Piocher » tire une carte au hasard dans la pioche.</li>
      <li><b>Au choix</b> : « Piocher » ouvre la liste de la pioche, et le joueur prend la carte qu’il veut. Le contenu de la pioche est alors visible.</li>
      <li><b>Au hasard ou au choix</b> : les deux boutons. « Piocher » tire au hasard, « Choisir » ouvre la pioche.</li>
    </ul>
    <p>Dans tous les cas, le menu « … » permet de tirer au hasard dans la défausse, de remettre la défausse dans la pioche, ou de tout remettre dans la pioche.</p>
  </>,
  handLimit: <><p>Le nombre de cartes que le joueur peut avoir en main. Une main pleine bloque la pioche tant qu’il ne défausse pas. Vide ou 0 : sans limite.</p></>,
  placement: gaugeHelp.placement,
  rules: <><p>Les règles générales du deck : quand piocher, ce qui se passe à la défausse… Elles s’affichent repliées sous le deck (« Règles du deck »). <K>{"{"}</K> cite une ligne d’index.</p></>,
  cards: <>
    <ul>
      <li><b>n°</b> : le numéro de la carte, donné tout seul. Il l’identifie dans la fiche des joueurs : on ne le réutilise jamais pour une autre carte.</li>
      <li><b>Nom</b> : écrit sur la carte.</li>
      <li><b>Couleur</b> : la bordure et le numéro de la carte. « celle du deck » : la couleur choisie plus haut.</li>
      <li><b>Icône du coin</b> (colonne « Icone ») : le petit dessin sous le numéro.</li>
      <li><b>Illustration</b> (colonne « Illustration ») : le grand visuel au centre. Sans illustration, l’icône du coin s’affiche en grand au centre.</li>
      <li>Icône et illustration proposent la même chose : une icône d’Eraser (recherche en français ou en anglais), un émoji, l’import d’une image ou son adresse.</li>
      <li><b>Effet</b> : affiché au survol de la carte. Il se met en forme, et <K>{"{"}</K> cite une ligne d’index.</li>
    </ul>
    <p>Une carte ajoutée plus tard arrive d’elle-même dans la pioche des joueurs. Une carte retirée (✕) est supprimée de l’onglet « Cartes » à l’enregistrement et disparaît des fiches.</p>
  </>,
}
