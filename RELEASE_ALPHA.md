# Eraser 0.1.1-alpha.295 — Préparer à l'avance, choisir en lot, et les créatures sur Roll20

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 294) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. La feuille « Sessions » reçoit une
colonne de plus à droite (« Cachée aux joueurs ») ; rien d'autre ne bouge dans Google Sheets.

- **Sélection multiple dans le Créateur de session** : chaque joueur et chaque PNJ a sa case (en haut
  à gauche de sa carte), et « Tout sélectionner » coche toute une section. Une barre en bas de l'écran
  agit sur tout ce qui est coché : **Révéler**, **Cacher**, **Envoyer…** dans une autre session (ils
  restent aussi ici), **Déplacer…** vers une autre session (ils quittent celle-ci), **Retirer** de la
  session (ils restent dans la campagne).
- **Sessions préparées en avance** : « Préparer en avance » à la création, ou le bouton « Visible des
  joueurs / Cachée aux joueurs » en haut du Créateur. Une session cachée n'apparaît ni dans le journal
  des joueurs, ni dans leurs notes, ni dans leurs magasins, même pour ce qui y est déjà révélé. Le MJ la
  voit dans son journal, marquée « Préparée — cachée aux joueurs ».
- **Les créatures partent sur Roll20** : les créatures des événements d'une session (et de toutes les
  sessions avec « Tout synchroniser ») sont importées avec leur portrait et le token préparé dans
  Eraser (sinon un token par défaut au cadre argenté), rangées dans le dossier de la session. Une même
  créature de l'index ne fait qu'une fiche, même si elle revient d'une session à l'autre.
  **Mettre à jour le compagnon et le script Mod en 0.9.0** (téléchargements de la page Roll20).
