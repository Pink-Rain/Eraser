# Eraser 0.1.1-alpha.56 — « Souhaitez-vous rester dans le passé ? »

## Les mises à jour s’annoncent dans Eraser

Plus de boîte de dialogue Windows. Quand une mise à jour est téléchargée, le logo
d’Eraser tourne sur lui-même au milieu de l’écran :

> **Eraser est en changement.**
> Souhaitez-vous rester dans le passé ?

- **Oui** : rien ne change. La mise à jour attend la prochaine ouverture d’Eraser.
- **Non** : la mise à jour s’applique aussitôt.

Cette version modifie la fenêtre d’Eraser elle-même. Elle s’installe donc une
fois avec l’installateur, en silence (une dernière fenêtre Windows propose de
redémarrer). Les suivantes reprennent la mise à jour sans réinstallation.

## Magasins (campagne et bac à sable)

- **Clic droit sur « Relancer cette ligne »** : on choisit la rareté de l’objet
  tiré (Très commun, Commun, Rare, Très rare, Ultime). Si le magasin n’a aucun
  autre objet de cette rareté, Eraser le dit au lieu de ne rien faire.
- **« Ajouter à la campagne »** (vers le Créateur de session) : le nom de chaque
  magasin se modifie directement dans la fenêtre.

## Feuille de personnage

- **Plus besoin d’Entrée** : une valeur modifiée s’enregistre dès qu’on clique
  ailleurs ou que le survol d’une compétence se referme. On peut changer la stat,
  la réussite critique et l’échec critique d’affilée : les trois sont gardées.
  Échap annule. Même chose pour les points de vie, les titres et listes, et, dans
  l’inventaire, les champs d’objet et la monnaie. Dans le tabletop, un dossier
  renommé s’enregistre aussi en cliquant ailleurs.
- Deux modifications rapprochées ne s’écrasent plus l’une l’autre.
- **Actifs et passifs au survol d’une compétence** : l’actif affiche son nom avec
  ses charges, et son type passe sous la description, dans la partie dépliable.
  Le passif ne change pas. Un nom coupé s’affiche en entier au survol, par-dessus
  l’étiquette ou les charges.
- **Onglet Compétences** : « Cap de combat », « Cap de tir » et « Cap magique »
  remplacent « Capacité … » dans les titres.
- Corrigé : les compétences « Volonté … » ne s’abrégeaient pas en « Vol … ».

## Vérifications

- dans Electron, sur une copie installée : mise à jour téléchargée, annonce dans
  l’application, « Non » applique la nouvelle version en une seconde ;
- dans un vrai navigateur :
  - trois valeurs d’une compétence modifiées sans Entrée, puis survol refermé :
    les trois sont enregistrées ; Échap n’enregistre rien ;
  - titres « Cap » ;
  - « Oui » et « Non » de l’annonce ;
  - relance d’une ligne en « Ultime » ;
  - nom modifié à l’ajout d’un magasin ;
- lint sans erreur, 20 tests d’interface au vert, serveur desktop vérifié en
  HTTP 200.
