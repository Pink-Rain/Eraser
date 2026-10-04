# Eraser 0.1.1-alpha.140 — Fiches enregistrées d'elles-mêmes, presets de mise en page, canal « Général »

Cette version arrive par la mise à jour sans réinstallation.

## La fiche d'une ligne (moteur des index)

- **Enregistrement automatique** : chaque champ s'enregistre de lui-même, peu après la
  frappe. Plus de boutons « Fermer » ni « Enregistrer » ; un petit indicateur en bas à droite
  dit « Enregistrement… » puis « Enregistré ». Fermer la fiche (croix, Échap, clic à côté)
  enregistre ce qui restait.
- **Précédente · Aller à… · Suivante**, au milieu en bas : on passe d'une ligne à l'autre
  sans quitter la fiche, dans l'ordre du tableau (tri et recherche compris). « Aller à… »
  ouvre une recherche parmi les lignes. Au clavier : Alt + ← et Alt + →.
- **La barre de mise en forme reste toujours affichée** : elle n'apparaît plus au clic, ce
  qui décalait le champ pendant qu'on visait.

## Ajouter une ligne depuis le bas du tableau

- « Ajouter » en bas du tableau crée la ligne **dans le tableau même** : sa case de nom
  s'ouvre, prête à écrire. Entrée enregistre la ligne et en ouvre une autre (pour en
  ajouter plusieurs d'affilée) ; Échap annule. Le bouton « Ajouter » du haut garde son
  formulaire. Les personnages et campagnes gardent leur page de création.

## Réglages des colonnes (« Modifier »)

- **« Où s'affiche la colonne » est retiré.** Le tableau ne connaît plus que « Masquée »
  (montrée d'un clic par « Colonnes masquées ») ; les anciennes colonnes « Formulaire
  seulement » comptent comme masquées. La fiche et le survol se règlent dans leur mise en
  page, où **toutes** les colonnes, masquées comprises, peuvent être placées.
- **Presets de mise en page** pour la fiche et pour le survol : « Enregistrer en preset »,
  puis l'appliquer à n'importe quel onglet, de n'importe quel index. Et **« Copier vers
  d'autres onglets… »** donne d'un coup la mise en page affichée aux onglets cochés. Rien
  n'est écrit avant « Enregistrer ».

## Index des objets : mêmes colonnes partout

- Nouveau bouton, dans « Modifier », sous la liste des onglets : **« Aligner les autres
  onglets sur « Armes » »** (ou sur l'onglet choisi). Tous les onglets prennent les colonnes
  de la référence : mêmes noms, mêmes types, mêmes styles imposés, même ordre. Les fautes
  sont corrigées au passage : « Rareté principal » → « Rareté principale », « Cout » →
  « Prix », « Effet » → « Effets », « Sous-Type » → « Sous-type ».
- Ces renommages sont permis même sur les colonnes verrouillées : l'inventaire, les
  boutiques et la table lisent déjà les deux orthographes, rien n'est perdu. Rien n'est
  supprimé : une colonne propre à un onglet reste, à la fin. Le résumé montre chaque
  changement avant « Enregistrer », et tout se défait depuis « Modifier ».

## Campagnes

- « Ajouter un personnage » ne propose plus les lignes illisibles (un identifiant à la
  place du nom) : d'anciennes lignes mal lues, absentes de la feuille des personnages.
  Rien n'est effacé.

## Chat

- Nouveau canal **« Général »**, sans campagne, ouvert à tous les comptes. C'est le canal du
  chat à l'ouverture d'Eraser ; aller sur la page d'une campagne passe toujours sur son
  canal, et la liste permet de revenir à « Général ».
