# Eraser 0.1.1-alpha.121 — Catalogue des objets fiable

Cette version arrive par la mise à jour sans réinstallation.

## Les objets de l'inventaire retrouvent leurs colonnes

Quand Google refusait un instant la lecture de l'Index des objets (trop de demandes en
même temps, au chargement d'une page), l'inventaire arrivait sans le catalogue. Les
objets perdaient alors leur valeur, leur compétence, leur action… : « {Valeur} » restait
écrit tel quel et rien ne s'affichait sous l'effet. L'index pouvait aussi afficher « Les
tableaux du dossier Objets n'ont pas pu être chargés ».

Désormais :

- une lecture refusée est **réessayée**, en laissant plus de temps à Google quand il dit
  « trop de demandes » ;
- si elle échoue encore, Eraser garde le **dernier catalogue lu** au lieu d'un catalogue
  vide ;
- une seule lecture du catalogue à la fois : l'inventaire, les magasins et l'index la
  partagent ;
- un inventaire reçu sans catalogue n'est plus gardé en mémoire comme s'il était
  complet, et la page le **redemande** d'elle-même quelques secondes plus tard ;
- chaque objet n'emporte plus que le style de ses propres cases, au lieu de toute la
  liste des actions : l'inventaire se charge plus vite.

Si l'index ne se charge toujours pas, le message affiche maintenant le code exact de
l'erreur, pour savoir quoi corriger.
