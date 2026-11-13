# Eraser 0.1.1-alpha.299 — Séance plus fluide

Sans réinstallation (même enveloppe que l'alpha 298). Rien ne change dans Google Sheets.

D'après les relevés « Fluidité de cet ordinateur » du 13 novembre (MJ et quatre joueurs) :

- **Fiches enregistrées plus vite en séance.** Quand tout le monde modifie sa fiche en même
  temps, Google mettait jusqu'à 25 s à répondre sur le classeur des personnages. Une modification
  qu'aucune formule ne lit (vie actuelle, notes, états, onglets, sorts choisis…) ne relit plus la
  fiche après l'écriture : Google rend les cases écrites avec l'écriture, soit un passage de moins
  dans la file. Une caractéristique ou un bonus fait toujours relire la fiche (les totaux en
  dépendent), tout comme une colonne ajoutée à la main dans la feuille.
- **Fiche ouverte en une lecture au lieu de deux** après un démarrage d'Eraser : la ligne de chaque
  personnage est apprise au passage par la liste des personnages (et toujours vérifiée par son ID).
- **Icônes pleines** : leur silhouette est gardée d'une ouverture à l'autre et calculée sans
  passer par la carte graphique (un gel de 0,7 s relevé sur la fiche).
- **Chat en direct** : WebRTC se met en route, puis le salon est rejoint juste après, en deux temps
  courts au lieu d'un gel d'une seconde.
- **Journal de campagne** : la mise en page à deux colonnes ne recalcule plus tout le récit
  plusieurs fois (gels de 0,5 à 3 s relevés), et les sections hors de l'écran attendent d'y
  arriver pour être dessinées.
