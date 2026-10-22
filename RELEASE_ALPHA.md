# Eraser 0.1.1-alpha.252 — Plus d'attente pour les autres

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

Faite d'après les trois relevés « Fluidité » de la séance du 22 octobre (MJ et deux joueurs).

- **Plus de gel au lancement.** Le chat en direct préparait vingt connexions d'un coup en
  arrivant : l'écran figeait 1,5 à 2 s au démarrage d'Eraser, et encore une demi-seconde à chaque
  changement de salon (en entrant dans une campagne). Elles se préparent maintenant une à une,
  quand l'application est au repos, et six suffisent pour la table.
- **Une fiche qui ne met plus 30 s à s'ouvrir.** Quand plusieurs joueurs ouvrent la même chose,
  une seule installation lit Google et les autres reprennent sa copie. Si celle-ci était retenue
  (Google qui fait patienter), les autres l'attendaient jusqu'à 80 s : 30 s pour un inventaire,
  26 s pour les références, 13 s pour les modificateurs d'armes, 20 s pour le journal. Une page
  n'attend plus que 6 s au plus, puis lit Google elle-même ; une installation que Google fait
  patienter le dit, et personne ne l'attend.
- **Moins de pauses imposées par Google.** Quand Google refusait plusieurs lectures parties
  ensemble, chaque refus doublait la pause : quatre refus d'une même rafale faisaient attendre
  32 s ou plus. Une rafale ne compte plus que pour un refus (4 à 6 s).
- **Journal de campagne** : les sessions sont lues en même temps que les notes, PNJ, magasins et
  événements, au lieu d'avant eux.
