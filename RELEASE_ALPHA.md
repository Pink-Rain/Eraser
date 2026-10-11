# Eraser 0.1.1-alpha.187 — Carnet en pages, dossier de campagne, index sans exceptions

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **Carnet de notes en pages** (onglet Journal) : des onglets nommés au-dessus du carnet. « + »
  ajoute une page, un double-clic la renomme, la croix la supprime (après confirmation). Un
  carnet d'une seule page « Notes » reste écrit exactement comme avant dans Google Sheets.

## Dossier de campagne

- Les pages de la campagne ne sont plus en grandes cartes : elles sont dans un petit encart
  **« La campagne »** à côté des statistiques, comme les liens de l'accueil (en tête sur mobile).

## Index

- **Colonne « Onglet »** de la vue « Tout » (Lieux…) réglable dans « Modifier » : son libellé, sa
  place, masquée ou non, et les onglets vers lesquels une ligne peut être déplacée.
- **« Nomme la ligne »** vaut aussi pour les citations « { » : les attributions de succès se citent
  par leur succès.
- **Classes** : « Ajouter une classe » menait à la page Création de classe, qui ne sait pas en
  créer. Il ouvre maintenant le formulaire de l'index (ajout seulement : ni copie ni suppression
  depuis le tableau, et un nom saisi ailleurs ne crée jamais de classe).
- **Valeur d'une nouvelle ligne** : nouveau réglage de colonne dans « Modifier », pour tous les
  index. Les valeurs données d'office à un PNJ ajouté (bibliothèque, « Non ») en sont devenues de
  simples réglages, inchangés.
- **Sorts des créatures** : un sort renommé dans l'index est renommé aussi chez les créatures et
  les PNJs qui le citent.
- **États** : les colonnes que lit la fiche de personnage (type, descriptions des niveaux, règles
  liées) sont protégées, avec leur raison, comme les autres.
- **PNJs** : le portrait est une colonne image (voir, importer, coller une adresse), importée
  comme depuis la page du PNJ.
- Les anciens éditeurs « en lecture seule » des pages Doublons (sorts) et Récupérer (PNJs), qui
  décrivaient des colonnes qui n'existent plus, sont retirés : tout se règle dans « Modifier ».

## Corbeille et quota Google

- La page Corbeille ne relit plus les vingt classeurs d'index d'un coup en lecture forcée : elle
  reprend les réglages déjà lus et avance trois index à la fois. Elle provoquait des refus de
  quota Google (429) en rafale. Restaurer et supprimer relisent toujours tout juste avant d'écrire.
- Si la liste des index créés ne se lit pas, la corbeille des autres index s'affiche quand même.

## Journal des erreurs

- N'y entrent plus : les avertissements de dépréciation de Node (DEP0180, levé par Electron en
  lisant l'archive du serveur) et les pages fermées avant la fin de leur réponse
  (ERR_STREAM_UNABLE_TO_PIPE, après un F5 par exemple). Ils restent dans le log de démarrage.
- Feuille « Classes » : les en-têtes J1 et K1 étaient décalés (« Couleur d'accent sombre » en
  double, « ID » manquant), ce qui empêchait Eraser de reconnaître les classes. Ils ont été
  corrigés dans la feuille (deux cases de la ligne 1, aucune donnée déplacée).
