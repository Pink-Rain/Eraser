# Eraser 0.1.1-alpha.269 — Le bon nom, du bout des doigts

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 268) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Colonnes liées ↔ : fini les virgules** : dans un index, la case d'une colonne liée (et son
  champ dans la fiche ou le formulaire d'ajout) est maintenant une liste. On commence à taper,
  Eraser propose les noms des onglets d'en face ; un clic ou Entrée les ajoute en pastilles, une
  croix les retire. Un nom qui n'existe pas encore : « Créer « … » dans l'index … », et la ligne
  naît à l'enregistrement, avec sa réponse en face, comme avant.
- **Les fautes de frappe trouvent quand même** (listes, listes liées et colonnes liées) : « Epe »
  propose « Épée », « Fortresse » propose « Forteresse du Nord » (marquée « proche »), « dragon
  rou » trouve « Rouge dragon ». Les noms qui commencent par ce qu'on tape passent devant. Un nom
  déjà là écrit autrement (accents, majuscules, pluriel, lettre doublée) est repris, jamais recréé
  en double.
- **Au clavier** : Entrée prend la meilleure proposition (« Ép » → « Épée », « Fortresse » →
  « Forteresse du Nord ») ; quand rien n'y ressemble, Entrée crée le nom tapé. Pour créer malgré
  une proposition, ↑ jusqu'à « Créer », ou un clic. Une ligne sous la recherche dit toujours ce
  qu'Entrée va faire. Une virgule ajoute le nom et laisse la liste ouverte pour le suivant,
  Effacer retire le dernier, Entrée sur un nom déjà choisi le garde. Taper une lettre sur une case
  fermée l'ouvre, la lettre déjà dans la recherche. Plusieurs noms collés d'un coup (« Fer, Épée,
  Bois ») sont reconnus un à un.
- **Léger pour le quota** : une colonne liée ne charge ses noms qu'à l'ouverture, ceux de l'index
  affiché viennent de la page sans rien relire, et plusieurs noms ajoutés d'un coup s'enregistrent
  en une seule écriture, en refermant la liste.
- Le copier-coller de lignes entières dans le tableau marche comme avant.
