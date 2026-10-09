# Eraser 0.1.1-alpha.176 — Les classes à cinq autour de la table

Cette version arrive par la mise à jour sans réinstallation.

## Ce qui se passait vraiment

Toutes les installations d'Eraser lisent Google Sheets avec le même compte Google. Google ne
compte donc pas « par joueur » mais pour tout le groupe : environ 60 lectures par minute,
pas plus. Ouvrir une fiche pour la première fois sur un PC neuf en demandait une
cinquantaine. À cinq, le quota était épuisé dès les premières secondes.

Pire : chaque lecture refusée se relançait seule cinq fois. Vingt lectures refusées en
devenaient cent, le quota ne se libérait jamais, et chaque « Réessayer » aggravait les
choses. D'où le message « trop de modifications d'un coup » et l'application de plus en
plus lente.

## Les classes et leurs sorts ne dépendent plus de Google pour les nouveaux joueurs

- Dès qu'une installation lit les classes et les sorts dans Google, elle en dépose une copie
  sur le serveur partagé d'Eraser.
- Un PC qui n'a encore rien lu (nouveau joueur) prend cette copie en une seule requête, hors
  quota Google. Il voit aussitôt les classes, peut les ajouter à sa fiche, et voit les sorts
  de la classe donnée par le MJ.
- Google est relu ensuite en arrière-plan, quand il a de la place. Google Sheets reste la
  source : la copie n'est qu'un cache, remplacée à chaque lecture plus récente, jamais par
  une plus ancienne.
- Si Google refuse, la fiche, la création de personnage et les pages Règles prennent aussi
  cette copie plutôt que d'afficher une liste vide.

**À faire une fois après la mise à jour :** ouvre une fiche de personnage (ou Règles →
Classes) sur ton PC. La copie partagée est alors créée, et les joueurs en profitent.

## Un refus de Google ne fait plus boule de neige

- Un refus met toute l'installation en pause quelques secondes (plus longtemps s'il se
  répète), au lieu de relancer chaque requête en rafale.
- Six requêtes au plus partent en même temps, et celles de la page affichée passent
  toujours en premier.
- Le travail d'arrière-plan (relectures de caches, synchronisations) cède sa place. Pendant
  une pause, il abandonne et sera retenté plus tard.
- Si les classes ne peuvent pas être lues, la fiche réessaie d'elle-même trois fois,
  espacées. Plus besoin de cliquer en boucle sur « Réessayer ».

## Moins de lectures Google à chaque page

- Jauges, formes, decks et cartes des classes : servis depuis la mémoire et relus en
  arrière-plan. Avant, quatre onglets entiers étaient relus à chaque fiche ouverte après une
  minute.
- Sorts, présentations et bonus de rang : relus au plus toutes les trois minutes (au lieu
  d'une). Les modifications faites dans Eraser restent visibles aussitôt.
- Synchronisation des personnages et campagnes : une seule à la fois, et en arrière-plan
  quand la page n'en a pas besoin.
- Une fiche introuvable ne relance plus une seconde lecture complète des trois feuilles en
  parallèle.

Le message d'erreur dit désormais la vraie raison : le quota du compte Google commun est
atteint. Rien n'est perdu ; il suffit de recommencer une minute plus tard.
