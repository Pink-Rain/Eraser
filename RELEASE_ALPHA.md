# Eraser 0.1.1-alpha.52 — des listes déroulantes pour les créatures, un onglet Environnement pour les lieux

## Index des lieux

- Nouvel onglet **Environnement**, créé tout seul dans le classeur au premier
  chargement. Rien n’est déplacé dans les onglets existants.
- Les boutons d’onglets sont remplacés par une **liste déroulante**, comme dans
  l’Index des objets. Elle s’ouvre sur **Tout**, qui réunit les lignes de tous
  les onglets.
- Dans la vue « Tout », une colonne **Onglet** indique où se trouve chaque lieu.
  On peut y choisir un autre onglet pour l’y déplacer. « Ajouter un lieu »
  demande dans quel onglet le ranger.

## Index des créatures

### Le tableau

- L’icône d’ouverture disparaît : **un clic sur le nom ouvre la fiche**.
- Type, Sous-type, Rang, les deux Emplacements, les deux Raretés et
  Comportement deviennent des **listes déroulantes**, directement dans le
  tableau. Dressable devient une **case à cocher**.
- Les valeurs déjà présentes dans la feuille sont reconnues même si elles sont
  écrites un peu autrement (« Aggressif », « défensif », « Humanoïde
  monstrueux »). Elles ne sont réécrites que si tu choisis une autre valeur. Une
  valeur hors liste (« Donjon-Ruine », « / ») reste affichée en italique, rien
  n’est effacé.
- La seconde colonne « Comportement » de la feuille (restée vide) n’apparaît
  plus en double.

### La fiche

- **À gauche** : l’image, l’emplacement principal et sa rareté, l’emplacement
  secondaire et sa rareté, l’extension.
- **À droite** : nom, rang, taille et poids ; type, sous-type et Dressable ;
  organisation, comportement et langue. La famille de créatures qui parle
  chaque langue s’affiche au survol de l’option, jamais écrite en dur.
- **Dessous** : Force, Dextérité, Intelligence, **Sagesse**, Charisme, Vitesse,
  Vitalité.
- Une seule note : « Description, Histoire, Lore, Autre ».
- **Actifs** et **Passifs** : chaque sort ajouté s’affiche en carte complète,
  avec son type, ses charges, son effet, sa description, ses compétences et sa
  distance, sans mention de classe.

Les colonnes Sagesse et Description sont ajoutées à droite de la feuille. Les
anciennes colonnes (Environnement, Climat, Rencontre, Perception…) gardent
leur contenu dans Sheets et restent hors du tableau.

## Vérifications

- dans un vrai navigateur : tableau à onze colonnes sans doublon, listes et
  case à cocher qui enregistrent la bonne cellule, anciennes valeurs reconnues
  ou conservées, fiche ouverte depuis le nom, info-bulle des langues, cartes de
  sorts, envoi des seuls champs modifiés, vue « Tout » des lieux et filtre par
  onglet ;
- lint sans erreur, build Vinext complet, 20 tests d’interface au vert ;
- serveur desktop construit et vérifié en HTTP 200.
