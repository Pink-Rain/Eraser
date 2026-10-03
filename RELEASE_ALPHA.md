# Eraser 0.1.1-alpha.128 — Les colonnes lues par leur nom, partout

Cette version arrive par la mise à jour sans réinstallation.

## Ranger ses colonnes dans Sheets ne casse plus rien

Toutes les feuilles d'Eraser sont désormais lues et écrites **par le nom de leurs
colonnes** (la ligne 1), jamais par leur position : PNJs, Campagnes, Personnages par
campagne, Relations, Feuille de personnage, Classes, Magasins, Sessions, Inventaire
(types, contenants, contenu), Tabletop (cartes, pions, dossiers, journal), To-do,
Vocabulaire, réglages des index et registre des index personnalisés. Les sorts et les
index du monde l'étaient déjà.

- Déplacer, intervertir ou insérer une colonne dans Google Sheets ne change plus ce que
  lit ou écrit l'application.
- Une colonne ajoutée à la main est **laissée intacte** : Eraser n'écrit que ses propres
  colonnes (une formule personnelle n'est plus écrasée à l'enregistrement d'un PNJ, d'une
  fiche ou d'un magasin).
- Une colonne prévue par Eraser qui manque est **ajoutée à droite**, sans rien déplacer.
- Fiche de personnage : chaque valeur est retrouvée sous son en-tête, et les formules
  qu'Eraser écrit (totaux des compétences, bonus) visent la vraie case, où qu'elle soit.

## Corrigé au passage

- Quand l'ordre des en-têtes ne correspondait plus exactement, plusieurs feuilles
  (Campagnes, PNJs, Classes…) **réécrivaient leur ligne d'en-têtes**, voire inséraient une
  nouvelle ligne au-dessus : c'est fini. Seule une feuille qui n'a vraiment aucun en-tête
  reçoit encore une ligne d'en-têtes, comme avant.
- La création d'une campagne réécrivait les en-têtes A1:F1 à chaque fois : supprimé.
- Les illustrations de classes suivent la colonne « Image » même si elle a bougé.

Aucune donnée n'est déplacée ni réécrite par cette version.
