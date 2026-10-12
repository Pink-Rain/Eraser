# Eraser 0.1.1-alpha.205 — Le menu, les pages d'Eraser et les pages de ligne à ta main

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets : le menu et les pages sont enregistrés sur le serveur partagé d'Eraser.

## Éditeur du menu (admin et MJ)

- **Pages › Menu** (`/pages/menu`) : réordonner, renommer, masquer, regrouper les sections et
  les liens du menu latéral, avec une icône ou un émoji — les entrées d'Eraser comprises.
  Placer une page créée n'importe où, ajouter des liens et des sections libres.
- **Aperçu par rôle** (Admin, MJ, Joueur) à côté de l'éditeur.
- Masquer une entrée ne donne rien à personne : chacun ne voit toujours que ce que son rôle
  lui ouvre.
- Garde-fous : « Pages » et son « + » restent toujours accessibles à l'admin ; **« Rétablir le
  menu d'Eraser »** garde une copie (« Remettre le menu précédent ») ; une entrée d'Eraser
  ajoutée par une prochaine version apparaît d'elle-même à sa place.
- Les pages publiées s'affichent dans le menu sous leur section ; celles d'une campagne sous
  son dossier.

## Remplacer ou compléter une page d'Eraser

- Dans l'atelier, Réglages de la page › **« Remplacer une page d'Eraser »** : une page créée
  prend la place d'une page d'Eraser, ou s'affiche **au-dessus** ou **en dessous** de son
  contenu.
- Réversible : choisir « Aucune » rend la page d'origine. Admin et MJ gardent le lien « Voir la
  page d'origine ».
- Les pages techniques (connexion, comptes et rôles, corbeille, Google Drive, Roll20…) ne
  peuvent pas être remplacées.

## Pages de ligne d'index

- Un **modèle de page par index** (ou par onglet) : chaque ligne a sa page, à une adresse
  stable (`/fiche/<index>/<ID>`).
- Dans les blocs, `{Colonne}` affiche la valeur de la ligne (y compris une image, `{Portrait}`).
  Deux blocs de plus : **« Valeurs de la ligne »** et **« Cité dans »** (les lignes d'autres
  index qui la mentionnent). Une vue peut ne montrer que les lignes qui la citent.
- Un bouton **« Page de la ligne »** dans la fiche de la ligne et dans les vues.
- Les colonnes cachées aux joueurs restent cachées.
