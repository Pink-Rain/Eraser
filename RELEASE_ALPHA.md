# Eraser 0.1.1-alpha.183 — Au sol, un menu qui s'ouvre partout, des index plus légers

Cette version arrive par la mise à jour sans réinstallation.

## Inventaire : « Au sol »

- Sous l'inventaire classique de la fiche, un nouvel emplacement **Au sol**, sans limite. Il
  existe toujours une seule fois : il ne se crée pas en double et ne se supprime pas.
- Ce qui ne trouve plus de place y atterrit : un objet **reçu** d'un autre joueur, un objet
  **ajouté** ou **créé** dans un contenant plein. Un message le dit (« Plus de place : l'objet a
  été posé au sol. ») et le destinataire d'un envoi est prévenu.
- Depuis le sol, on renvoie un objet dans un contenant, vers un autre inventaire, ou on le
  supprime. Un objet posé au sol n'est plus équipé et ne compte plus dans les totaux.
- Partout (fiche, campagne, PNJ, créature), la **description** d'un objet est grisée et
  repliée sur une ligne : le chevron la déplie. L'effet reste toujours affiché.

## Index des objets

- Le bandeau « Index regroupés… » et le bouton « Mettre à jour les icônes » sont retirés.
- La barre ne se chevauche plus : ses éléments passent à la ligne quand la place manque.
- Une colonne **Actions** (juste après le nom) avec deux boutons, aussi au clic droit d'une ligne :
  - **Envoyer** dans un inventaire : campagnes, joueurs, PNJs, créatures nommées (les
    compagnons). En vue MJ, la campagne en cours est proposée en premier (inventaire de
    campagne, joueurs, PNJs, créatures de la campagne). Inventaire plein : l'objet va au sol.
  - **Déplacer** vers un autre onglet (Objets → Équipement…). L'objet garde son ID : les
    inventaires qui le contiennent le retrouvent. Rien ne se perd : une colonne remplie absente
    de l'onglet d'arrivée y est ajoutée.
- **Type** et **Sous-type** sont des listes : on choisit une valeur déjà utilisée ou on en tape
  une nouvelle, qui rejoint aussitôt la liste.

## Tous les tableaux

- Un bouton **plein écran** (Échap pour en sortir).
- « Ouvrir dans Sheets », « Actualiser », « Onglet-fenêtre » et « Tirer » ne gardent que leur
  icône ; leur nom s'affiche au survol.
- « Régler les cartes » est retiré (c'est dans « Modifier › Cartes »), comme la phrase sur les
  colonnes liées.
- L'index **Classes** se charge de nouveau : l'afficher ne vérifie plus (ni ne répare) les
  en-têtes de la feuille, comme le fait déjà la Création de classe. Si un index ne se charge
  pas, la cause exacte est maintenant affichée.

## Page Index

- Plus de « créés par toi / par moi » ni d'index secondaire : tous les index au même endroit,
  **Création de classe** comprise.
- **Étoile** (clic) : l'index est dans la section Index du menu. **Étoile rouge** (clic droit) :
  directement dans le menu. Par défaut, l'index des objets et la Création de classe sont en rouge.
- MJ et administrateurs créent des **dossiers** et rangent les index par **glisser-déposer**
  (dans un dossier, ou pour changer l'ordre). Le rangement est le même pour toute la table.

## Menu

- Chaque section est aussi une page : un clic sur son **nom** l'ouvre, un clic ailleurs sur la
  ligne la déplie. Menu replié, l'icône ouvre la page.
- Nouvelles pages : **Règles**, **Administration** (avec le **journal des erreurs** du serveur
  local), **Bac à sable**, et le **dossier de la campagne** (vue MJ) avec ses pages et le
  **compagnon Roll20** dans une partie dépliable. La page Roll20 seule n'existe plus (ses
  anciens liens mènent au dossier).
- Vue joueur, menu replié : chaque campagne garde une icône cliquable.
