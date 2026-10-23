# Eraser 0.1.1-alpha.253 — Une cuisse de poulet avant de dormir

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

- **Barre de rassasiement** sur la fiche de personnage, sous le portrait, le token et les états :
  cinq cuisses de poulet, rouges quand la barre est vide, vertes quand elle est pleine (orange,
  ambre, jaune et vert clair entre les deux). Un clic sur une cuisse remplit ou vide la barre
  jusqu'à elle, comme les charges des sorts.
- **La lune** à côté de la barre : « Passer une nuit » ou « Ellipse » (avec le nombre de jours).
  Sans repas, une nuit enlève une charge et une ellipse une charge par jour, sans jamais
  descendre sous zéro. Avec « Repas offert » coché : petit repas +1, moyen +3, grand +5, sans
  dépasser cinq. Un aperçu montre la barre avant et après.
- **Les jours passés** s'affichent dans l'étiquette de chaque campagne en haut à droite de la
  fiche : « Nom de la campagne • 12 jours ». Un personnage de plusieurs campagnes choisit dans la
  fenêtre de la lune celle où les jours comptent ; le dernier choix est retenu.
- **Dossier de campagne** : une colonne « Rassasiement » dans le tableau du groupe, avec la barre,
  les jours et la lune de chaque personnage, et au-dessus un bouton « Nuit ou ellipse pour tout
  le groupe ».
- **Journal de campagne** : dans « Le groupe », un bouton « Nuit ou ellipse » pour tous les
  personnages présents à la session, ouvert au MJ et aux joueurs présents.

La barre et les jours sont gardés sur le serveur partagé (comme les chutes du dossier) : ils ne
coûtent rien au quota Google et ne créent pas de conflit avec une fiche ouverte. Un personnage
jamais réglé commence rassasié (5 charges, 0 jour).
