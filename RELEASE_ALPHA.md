# Eraser 0.1.1-alpha.262 — Un index qui se répond

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets tant que tu ne crées pas de colonne.

- **Colonne liée ↔ vers son propre index** : dans « Modifier », « Index lié » propose d'abord
  « Cet index ». Deux colonnes d'un même index se répondent alors (par exemple « Se recycle en »
  et « Recyclage de » dans les items) : écrire « Fer » dans « Se recycle en » de l'Épée inscrit
  « Épée » dans « Recyclage de » du Fer, et l'inverse. Une seule colonne à créer : Eraser crée
  celle qui répond dans les onglets choisis. Une colonne peut aussi se répondre à elle-même
  (« Allié de », dans les deux sens). Une ligne ne se cite jamais en retour. Marche aussi dans un
  index qu'on est en train de créer.
- **D'un onglet à l'autre, sans doublon** : posée dans plusieurs onglets, la colonne a une réponse
  qui les vise tous. Un nom cité est cherché dans chacun d'eux ; avant, il pouvait être recréé en
  double dans un onglet où il n'était pas. Un nom absent n'est créé qu'une fois, dans un onglet qui
  a la colonne d'en face. Les liens entre deux index (des items vers les lieux…) en profitent aussi.
- **L'éditeur explique avant d'enregistrer** : une phrase sous le réglage dit ce qui va se passer,
  et la colonne qui répond propose les colonnes existantes. Refusés d'avance, sans rien écrire dans
  Sheets : « Nom » ou « ID » comme colonne qui répond, une colonne qui répond déjà à une autre (elle
  perdrait son lien), une colonne qui répond ajoutée en même temps sous un autre type. Les deux
  colonnes créées ensemble et réglées l'une vers l'autre sont acceptées.
