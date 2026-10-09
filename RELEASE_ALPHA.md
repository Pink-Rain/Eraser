# Eraser 0.1.1-alpha.166 — Les états partent avec ce qu'ils ont fait

Cette version arrive par la mise à jour sans réinstallation.

## Retirer un état retire ce qu'il a écrit

Les effets temporaires d'un état (+10, =100, ≥1) partaient déjà avec lui. Ceux qui
s'écrivent dans la fiche (dés lancés, « Redéclencher l'effet ») restaient. Désormais :

- La fiche note, sur chaque état posé, ce que ses effets y ont écrit.
- Quand l'état est retiré, ces écritures sont retirées, sauf pour les effets dont la
  nouvelle case **« Retiré en sortant de l'état »** est décochée.
- « Annuler » sur un lancer le retire aussi de ce qui sera défait.

## Nouvelle colonne dans l'Index des états, onglet Effets

**« Retiré en sortant de l'état »**, une case à cocher ajoutée à droite. Elle est remplie
une seule fois : cochée pour tous les effets, **décochée pour ceux qui visent les points de
vie actuels** (dégâts et soins restent). Une case vide compte comme cochée. Décoche-la pour
toute autre exception.

Les états posés avant cette version n'ont rien de noté. Leurs écritures passées restent ;
tout ce qu'ils écrivent à partir de maintenant sera retiré.
