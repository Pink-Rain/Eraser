# Eraser 0.1.1-alpha.242 — Le relevé pour tous, et moins d'attente du serveur partagé

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

## Le relevé de fluidité, pour chaque joueur

- Une **jauge** à côté de la roue des réglages du compte, en bas de la barre latérale, ouvre
  « Fluidité de cet ordinateur » : clics lents, gels de l'écran, temps de chaque page. Chaque
  compte la voit, joueurs compris ; « Copier le relevé » le met dans le presse-papiers pour
  l'envoyer.
- Le relevé copié contient maintenant aussi ce qu'a attendu le serveur local : Google, le serveur
  partagé, et les refus de quota. On sait ainsi d'où vient chaque attente.

## Google Drive et Sheets : une page qui se replie

- Chaque partie (configuration, compte Google, liaison des feuilles, doublons, création, fichiers,
  diagnostic, lenteurs) se replie et se déplie d'un clic. Les parties fermées ne sont même pas
  calculées : la page s'ouvre tout de suite au lieu d'une dizaine de secondes.
- Les parties lourdes (fichiers du Drive, doublons, diagnostic) restent ouvertes après un
  rechargement ; les autres se souviennent de leur pli sur cet ordinateur.

## Moins d'attente du serveur partagé

Mesuré avec un serveur partagé à 400 ms d'aller-retour, comme Cloudflare vu de chez nous.

- **Session** : passé 30 s, la première requête d'une page servait la session connue pendant sa
  revérification, mais les suivantes de la même page attendaient le serveur partagé. Plus
  aucune n'attend : 435 ms → 20 ms par requête.
- **Réglages des index** (mises en page, cartes, vues, cadenas, presets, statistiques,
  rangement de la page Index) : servis tout de suite et relus derrière, au lieu d'attendre le
  serveur partagé toutes les 30 s. Les réglages d'un index : 880 ms → 20 ms. Ce que l'on
  enregistre ici se voit aussitôt ; une modification faite sur un autre ordinateur arrive à la
  page suivante.

## Le quota Google ménagé

- **Préchauffage des index** (alpha 241) : il lisait tous les index d'affilée et épuisait le
  quota Google commun juste quand le MJ ouvrait ses pages (les `SHEETS_API_ERROR:429` du
  journal). Il lit maintenant un index toutes les quelques secondes, s'arrête au premier refus,
  et reprend cinq minutes plus tard où il en était.
- **Classes** : chaque page qui les lisait relançait leur relecture, même juste après un refus ;
  elle attend désormais une minute après un échec.
- Une relecture d'arrière-plan refusée par Google garde l'index tel qu'il est en mémoire au lieu
  de le remplacer par un index sans ses réglages, et ne remplit plus le journal des erreurs :
  ce n'est pas une panne, elle sera refaite.

## Journal des erreurs

- Les « Erreur non rattrapée : TimeoutError » anonymes : le délai d'une requête vers Google ou le
  serveur partagé courait encore après la réponse, et se déclenchait parfois sur une réponse
  jamais lue (un refus de Google rejoué). Il s'arrête maintenant dès la réponse lue, les
  réponses écartées sont libérées, et un vrai délai dépassé dit quelle requête n'a pas répondu.
