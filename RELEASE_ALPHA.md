# Eraser 0.1.1-alpha.223 — Eraser ne se ferme plus pendant une mise à jour au démarrage

Cette version change l'enveloppe d'Eraser : elle arrive par **l'installateur, en mode silencieux**
(rien à cliquer, Eraser se relance tout seul). Rien n'est effacé dans Google Sheets ni dans
les réglages.

## Correction

- Au lancement, si une mise à jour était appliquée (ou un lien suivi) **avant que la première
  page ait fini de charger**, ce chargement était interrompu (« ERR_ABORTED (-3) ») et Eraser le
  prenait pour une panne : fenêtre « Impossible d'ouvrir Eraser », puis fermeture. Ça arrivait
  surtout après plusieurs jours sans mise à jour, quand la nouvelle version arrive dès
  l'ouverture.
- Un chargement remplacé par un autre n'est plus une panne : Eraser reste ouvert et affiche la
  nouvelle page. Un vrai échec (service local injoignable) affiche toujours son message.

Tout le reste est identique à l'alpha 222 (élément sur mesure dans les vues, deux volets dans
« Modifier », valeurs selon leur type…).
