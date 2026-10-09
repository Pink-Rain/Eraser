# Eraser 0.1.1-alpha.173 — Les classes ne disparaissent plus en silence

Cette version arrive par la mise à jour sans réinstallation.

## Joueurs qui ne voyaient aucune classe

Chaque installation garde en mémoire la liste des classes lue dans Google Sheets. Sur une
installation neuve, si cette première lecture échouait, la création de personnage et la
fiche n'affichaient **aucune classe, sans rien dire**.

- **La liste ne dépend plus des images** : une erreur en lisant les notes d'images des
  classes (qui ne servent qu'aux illustrations) vidait toute la liste. Elle est maintenant
  ignorée, et les classes s'affichent quand même.
- **La fiche peut choisir une classe même si les sorts sont illisibles** : le choix de
  classe ne dépend plus de la lecture des sorts de classe.
- **Plus de liste vide muette** : la création et la fiche disent pourquoi les classes
  manquent (réseau, accès Google, feuille introuvable…), avec un bouton **Réessayer**.
  La raison exacte est aussi écrite dans `%APPDATA%/Eraser/logs/eraser-startup.log`.
