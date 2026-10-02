# Eraser 0.1.1-alpha.91 — Succès, profil, nouveau choix de sort, sauvegarde fiable de la fiche

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **Sauvegarde fiable** : seules les cases modifiées sont envoyées (plus la ligne
  entière), ce qui évite d'écraser ce qu'un MJ ou un autre onglet vient d'écrire.
  Un envoi raté est retenté trois fois. Une pastille en bas de l'écran indique
  « Enregistrement… », « Enregistré » ou « Pas encore enregistré : Google ne répond
  pas. Réessayer ». Quitter la page avant la fin de l'envoi demande confirmation.
- **Nouveau sort** : quand un rang attend son choix, un emplacement « Nouveau sort »
  s'affiche tout en haut de l'onglet Sorts. Un clic ouvre les trois propositions en
  grandes cartes : couleurs de la classe, icône du genre de sort en fond (actif,
  passif, bonus de rang), petit carillon (coupable). Le choix par rang ne change
  pas, et reste modifiable plus bas (« Rechoisir »).
- Une petite pastille rouge sur l'onglet Sorts signale un sort à choisir.
- **Retirer un sort choisi à un rang** rouvre le choix de ce rang. Les sorts ajoutés
  autrement (rang commun, ajouts libres) se retirent comme avant.
- **Objet reçu** : la notification reste, avec un petit « ploup ploup ». L'objet
  arrivé porte une pastille rouge qui disparaît au survol, et l'onglet Inventaire
  aussi tant qu'il n'a pas été vu.

## Succès et profil

- Nouvel index **Index › Succès** : Nom, Type (Joueur ou MJ), Sous-type (liste qui
  accepte de nouvelles valeurs), Description, Icône, Couleur. Un second onglet,
  « Obtenus », garde qui a reçu quel succès, quand et de qui. Le classeur est créé à
  la première ouverture de la page par un MJ (relié s'il existe déjà dans Drive),
  et il part vide.
- Les MJ et les administrateurs **attribuent un succès** depuis l'accueil ou depuis
  le profil d'un joueur, avec une note facultative. Ils peuvent aussi le retirer.
- **Accueil** : une section « Succès » sous le contenu, selon la vue. Vue joueur :
  succès de joueur ; vue MJ : succès de MJ. Une jauge montre la progression, et les
  succès à débloquer peuvent être affichés.
- **Profil** : un clic sur son nom en bas du menu ouvre « Mon profil ». On y trouve
  ses personnages, ses campagnes (menées ou jouées) et tous ses succès en cartes,
  quelle que soit la vue. La roue à côté du nom ouvre toujours les réglages du
  compte. Depuis « Comptes et rôles », le nom d'un compte ouvre son profil.

## Index

- **Toutes les colonnes se modifient**, même celles qu'Eraser lit. Un bouton
  « Modifier quand même » explique ce qui risque de casser avant de déverrouiller.
- Le texte d'avertissement jaune, illisible quand Windows est en mode sombre, est
  corrigé partout : Eraser n'a qu'un thème clair et ne suit plus le mode sombre du
  système.
- Nouveau type de colonne **Icône** : une icône de la liste ou un émoji. Un nom
  français tapé dans Sheets (« Trophée ») est reconnu.

## Chargements

- Changer de page n'affiche plus « Ouverture de la page… » : la page reste affichée
  jusqu'à ce que la suivante arrive avec sa structure, puis ses données se remplissent.
- F5 et « Actualiser » rafraîchissent les données sans vider l'écran (l'icône tourne
  pendant ce temps). Ctrl+F5 recharge toute la fenêtre.
- Ces éléments ne disparaissent plus pendant un rechargement : le Journal
  (relations), les bonus de rang (fiche et Création de classe), le sac à dos des PNJ
  rouvert, les sessions de « Ajouter à la session », les listes de « Récupérer des
  PNJ / magasins », les destinations de transfert, les sorts déjà choisis d'une fiche
  de PNJ ou de créature, et le diagnostic des feuilles.
- Les pages Comptes et rôles, Corbeille, Vocabulaire, Création de personnage, Index
  des campagnes et Index des personnages s'affichent tout de suite, avant leurs
  données.
- Réglages Google Drive : enregistrer ou autoriser ne recharge plus toute
  l'application.
