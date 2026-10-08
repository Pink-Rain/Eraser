# Eraser 0.1.1-alpha.152 — Correctif : lenteur et cases « équipé »

Cette version arrive par la mise à jour sans réinstallation.

## Équiper et déséquiper

- La case se coche (ou se décoche) tout de suite, sans attendre Google : les totaux de la
  fiche suivent aussitôt.
- Une case en cours d'enregistrement ne bloque plus les autres objets du contenant.
- Si l'enregistrement échoue (Google lent, serveur local qui redémarre), la case revient
  comme avant, un message le dit, et plus rien ne reste bloqué.
- Même chose pour les cases d'objets au survol des caractéristiques et des compétences.

## Lenteur

- Le jeton d'accès à Google n'est plus redemandé avant chaque requête dans les dernières
  minutes de sa validité : il est renouvelé en arrière-plan, sans faire attendre.
