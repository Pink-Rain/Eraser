# Eraser 0.1.1-alpha.204 — Beaucoup moins d'attente à chaque page

Cette version arrive par la mise à jour sans réinstallation. Rien n'est écrit dans Google
Sheets. Elle ne change aucune fonctionnalité : elle enlève du temps perdu.

## Ce qui faisait attendre

- **Chaque page était calculée deux fois.** Le routeur rendait d'abord la page « à blanc »
  pour y détecter une redirection, puis pour de vrai : toutes ses lectures Google, toutes ses
  questions au serveur partagé, tout son calcul, en double. Chaque page a maintenant une
  frontière de chargement : elle n'est rendue qu'une fois, et la coque s'affiche avant que
  ses données soient là.
- **Le partage des lectures coûtait trois allers-retours de plus par lecture.** Avant de
  lire Google, chaque lecture posait un bail sur le serveur partagé, patientait, puis le
  relisait. Le bail est maintenant posé sans attendre : une question au serveur partagé,
  puis Google.
- **Deux lectures identiques au même instant** (deux pages ouvertes, ou le rendu en double
  ci-dessus) partaient toutes les deux ; la seconde attendait la première en interrogeant
  le serveur partagé en boucle. Elles n'en font plus qu'une, aussi pour les lectures
  fraîches (sessions, événements, PNJ).
- **Les index envoyaient chaque case deux fois** (sa valeur et sa mise en forme, presque
  toujours identiques) : la page d'un index est près de deux fois plus légère.
- La comparaison des noms (accents, casse), faite pour chaque case à chaque affichage d'un
  index, est gardée en mémoire : un tiers du temps de dessin d'un index en moins.
- Les liens d'identité des comptes n'étaient demandés deux fois au serveur partagé que par
  une course entre deux lectures : une seule fois.

Sur le banc de mesure (Google à 250 ms, serveur partagé à 100 ms), une page d'index ouverte
pour la première fois passe de 2,4 s à 1,3 s, une campagne de 2,8 s à 1,7 s, et une page
déjà vue répond en quelques millisecondes.

## Aussi

- `/campagne?campagne=…` menait toujours à l'accueil (même cause que l'atelier des pages).
