# Eraser 0.1.1-alpha.238 — Plus léger, plus fluide

Cette version change l'enveloppe d'Eraser (enveloppe 10) : elle arrive par l'**installateur, en
mode silencieux**. Eraser la télécharge, s'installe et se relance tout seul ; rien n'est effacé,
ni sur l'ordinateur ni dans Google Sheets.

## Un serveur local qui ne fige plus

- La base locale n'attend plus le disque à chaque écriture (WAL en `synchronous = NORMAL`, sans
  risque de corruption) et garde ses requêtes compilées : 500 écritures passent de 320 ms à
  30 ms sur un bon disque, bien plus sur le disque lent d'un portable.
- Les portraits, bannières et sons en cache se lisent et s'écrivent sans bloquer les autres pages.
- Les grosses lectures Google partagées entre installations se compressent à côté du serveur,
  au lieu de le figer quelques dizaines de millisecondes à chaque fois.
- Une écriture groupée dans la base locale ne peut plus se mélanger à celle d'une autre page.

## Des pages qui attendent moins

- Règles, Ressources, pages créées et fiches de ligne n'attendent plus le serveur partagé toutes
  les quinze secondes pour la liste des pages : la dernière liste connue s'affiche tout de suite et
  se relit en arrière-plan.
- Campagne, dossier et accueil gardent en mémoire les noms des joueurs (une minute, puis relus en
  arrière-plan) et ne font plus attendre la page pour compléter l'annuaire.
- La fiche d'une ligne et les pages créées lisent leurs données en même temps, plus l'une après
  l'autre.
- Le générateur de magasins ne relit plus toute la page après chaque relance, choix, renommage
  ou marché ambulant : le tirage enregistré s'affiche directement.
- Afficher une notification ou partager une page n'oublie plus les pages déjà visitées :
  « Précédent » reste instantané.

## Fluidité : des effets allégés pour les PC modestes

- Nouveau réglage **Fluidité** dans les réglages du compte : *Automatique*, *Complets* ou
  *Allégés*. Gardé sur l'ordinateur.
- *Allégés* (choisi d'office sur un ordinateur à 4 cœurs ou moins, ou 4 Go de mémoire ou moins) :
  les états de la fiche (flammes, brume, givre, poison…) restent visibles mais immobiles et sans
  flou, plus de verre dépoli, plus de glissade de la barre latérale.
- Dans tous les modes, l'en-tête, le chat, les notifications et les barres collantes n'ont plus de
  flou d'arrière-plan (invisible à leur opacité, mais recalculé à chaque image).
- Les portraits recadrés sont mesurés en un seul passage par image d'écran, plus un par portrait.
- Les boutons et onglets n'animent plus que leurs couleurs.

## L'application Windows

- Le journal d'Eraser s'écrit par paquets, sans faire attendre la fenêtre ; les cookies sont
  enregistrés une seconde après le dernier changement, plus à chaque cookie.

## Nettoyage

- Retirés : un bouton de regroupement des classeurs d'objets jamais affiché, cinq fonctions plus
  appelées nulle part et une note de migration périmée.
