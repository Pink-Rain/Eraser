# Eraser 0.1.1-alpha.241 — Des clics qui répondent tout de suite

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

## Changer de page : tout de suite

- **Chaque page n'a plus qu'une copie.** Le routeur rangeait une page visitée sous la page d'où
  l'on venait : vue en venant de l'accueil, elle n'était jamais resservie en venant d'ailleurs.
  Presque chaque clic repartait donc au serveur. Une page revue s'affiche maintenant aussitôt.
- **Les copies durent 30 minutes** (au lieu de 5). Une copie d'avant une modification, ou de plus
  d'une minute, s'affiche quand même tout de suite, puis la page se relit en arrière-plan et se
  met à jour seule, sans squelette.
- **Écrire n'oublie plus toutes les pages** : seule celle où l'on vient d'écrire est relue.
- **Un lien visé se prépare** : dans la barre latérale, un lien survolé un instant précharge sa
  page ; le clic, qui suit, la trouve prête. Mesuré processeur bridé comme un petit portable :
  700 à 1 060 ms → 335 à 470 ms. Un clic pendant le préchargement reprend sa réponse au lieu
  d'en redemander une.

## Des boutons qui ne font plus attendre

- **Inventaire** : +, − et « Retirer » s'affichent aussitôt ; plusieurs clics rapides partent en
  une seule écriture, et les autres boutons restent cliquables.
- **Journal** : cocher une quête, supprimer une note.
- **Créateur de session** : ajouter ou retirer un joueur, un PNJ, un magasin, sans bloquer la
  page.
- **Relations** : niveau, note, suppression.
- **PNJ** : entrer dans le groupe, en sortir, supprimer.
- **Tableau de bord de campagne** : cacher un personnage, titre et description.
- Si Google refuse, la chose revient comme elle était et le message dit pourquoi.

## Un écran plus léger

- **React Compiler** : chaque composant ne se redessine plus que si ce qu'il montre a changé.
- **Mode « Allégés » réparé** : une règle de l'alpha 238 rendait chaque calcul des styles un
  tiers plus lent, justement sur les petits portables.
- Les infobulles de la barre latérale ne se calculent plus quand elle est dépliée.
- Les longues pages ne dessinent leurs sections du bas qu'en s'en approchant.

## Données prêtes

- Peu après l'ouverture d'Eraser par un MJ ou un administrateur, les index se lisent en
  arrière-plan : leur première ouverture est immédiate.
- Une page revue au cours d'une longue séance (jusqu'à six heures) s'affiche tout de suite et se
  relit derrière, au lieu d'attendre Google. Aucune lecture Google de plus. « Actualiser » (F5)
  relit toujours tout de suite.

## Mesurer chez soi

- Administration › Google Drive et Sheets › **Fluidité de cet ordinateur** : les clics lents, les
  gels de l'écran, le temps de chaque page et les attentes du serveur, gardés sur cet ordinateur.
  « Copier le relevé » permet de l'envoyer pour viser la prochaine lenteur.
