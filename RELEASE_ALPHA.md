# Eraser 0.1.1-alpha.286 — Les documents s'enregistrent plus vite

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 285) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Enregistrer un document est bien plus rapide.** Ses images (rendu, impression, fond importé,
  images posées, dessins) partent maintenant ensemble vers Google Drive au lieu de l'une après
  l'autre, et Eraser ne relit plus tout le dossier des visuels avant chacune (plus d'une seconde à
  chaque fois). Avec Eraser Doc 0.2.1, le document part aussi en un seul envoi : une seule lecture
  et une seule écriture dans Google Sheets au lieu de deux.
- **Les envois de plus de 1 Mo sont acceptés** (jusqu'à 40 Mo) : le serveur d'Eraser les refusait
  avant même de les lire. Les documents s'en servent ; un portrait, un token ou une image un peu
  lourds aussi.
- Envoyer plusieurs visuels à la suite (portraits, tokens, fonds) profite du même gain : la liste
  du dossier des visuels reste à jour au lieu d'être relue après chaque envoi.
