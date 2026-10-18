# Eraser 0.1.1-alpha.228 — Les listes sur les pages, la fiche qui ne quitte plus la page

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : les vues gardent leurs clés.

## Une liste posée sur une page

- **Cliquer une ligne n'ouvre plus l'index.** Sur une page, la fiche s'ouvre ici, en lecture,
  dans une fenêtre au centre ; on ne quitte la page que pour la page de la ligne, si elle en a une.
- **Un joueur peut cliquer** : il lit la ligne comme le MJ, sans rien pouvoir modifier.
- Le **maître-détail** montre la ligne cliquée dans son détail, comme l'éditeur l'annonce (il
  ouvrait la fiche) ; c'est vrai aussi dans l'index.
- **« Ajouter »** de la barre d'outils marche sur une page : le formulaire d'ajout s'ouvre dans une
  fenêtre (MJ et admins ; le serveur vérifie qui peut écrire). Dans l'index aussi, il s'ouvre en
  fenêtre au lieu de tout en haut de la page, hors de vue.
- Dans les réglages d'un bloc qui montre une vue (liste, kanban…), **« Au clic sur une ligne »**
  n'est plus proposé : il doublait celui de la vue, avec moins de choix. Un ancien réglage du bloc
  ne compte plus pour ces vues (« Retirer l'ancien réglage du bloc » le nettoie). Le tableau et les
  cartes gardent le leur.

## « Ouvrir la fiche »

- Le bouton **« Ouvrir la fiche » sous le détail ne s'affiche plus d'office** : il se demande dans
  « Éléments et clic › Au clic : le détail › Bouton « Ouvrir la fiche » ». Jamais sur une page.

## La taille des listes

- **Apparences › Taille** : la hauteur au plus (au-delà, la liste défile dans son cadre ; le
  maître-détail : sa liste) et la largeur au plus (la vue se centre).

## L'éditeur de la Liste

- Plus compact, comme l'atelier des cartes : les réglages à gauche sur toute la largeur, plusieurs
  par ligne ; l'aperçu à droite (« ⤢ » l'ouvre en grand).
- L'aperçu montre le bouton **« Ajouter »** et le **détail modifiable** comme dans l'index (on peut
  y taper pour essayer : rien n'est enregistré).

## Les formulaires

- **Un même champ plusieurs fois** : « Dupliquer » (sur la barre d'un champ) le place une fois de
  plus, marqué « copie » ; la copie montre et modifie la même case (un rappel du nom dans un autre
  onglet, les PV en haut et dans « Combat »…).
