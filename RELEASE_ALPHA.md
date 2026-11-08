# Eraser 0.1.1-alpha.272 — Des extensions qui se posent toutes seules

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 271) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Administration › Extensions** : une nouvelle page liste les extensions liées à Eraser :
  Eraser Doc (documents de campagne), Eraser Map (tabletop) et Eraser Page (atelier des pages).
  Chacune vit dans son propre dépôt GitHub. Pour chacune, l'admin coche qui la reçoit
  automatiquement : joueurs, MJ, admins. Par défaut, personne.
- **Téléchargement et mises à jour automatiques** : dès qu'une extension publie une version, les
  ordinateurs des rôles cochés la téléchargent tout seuls (au lancement d'Eraser, quelques
  minutes après un changement de l'admin, puis toutes les six heures), vérifient qu'elle n'a pas
  été altérée et la mettent à jour sans réinstaller Eraser. Une version abîmée est refusée et
  l'ancienne reste en place.
- **Une adresse par extension** : une extension installée s'ouvre dans Eraser, avec sa barre
  latérale, à l'adresse `/extension/map` (ou `doc`, `page`) ; le bouton « Ouvrir » de la page
  d'administration y mène.
- Les trois extensions n'ont pas encore de version publiée : la page l'indique. Rien n'est
  téléchargé tant qu'elles n'existent pas.
