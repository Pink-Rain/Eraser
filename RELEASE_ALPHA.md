# Eraser 0.1.1-alpha.261 — Toute la table sur la même page

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

- **Journal en direct** : une note de session écrite, modifiée, cochée ou supprimée apparaît
  tout de suite chez les autres joueurs qui ont le journal ouvert (et dans l'onglet Journal de
  leur fiche, vue « Campagne »), sans actualiser. Quand le MJ révèle ou cache quelque chose,
  ajoute un PNJ, un magasin ou un événement à une session (journal ou Créateur de session), le
  journal des joueurs se relit seul, un peu plus d'une seconde après son dernier clic.
  Le message passe par le salon en direct du chat de la campagne, déjà ouvert : aucune lecture
  Google de plus pour les notes. Seules les notes publiques voyagent ; les notes privées des
  fiches restent à leur auteur.
- **Le chat suit la campagne après « Actualiser »** : une fenêtre rechargée (F5, mise à jour)
  sur une page de campagne reprend le canal de cette campagne au lieu de « Général ». À
  l'ouverture d'Eraser, le chat reste sur « Général ».
- **Résumé de session en petit** : dans le bilan du journal, le résumé s'écrit en petit, sans
  lettrine, et se replie au-delà de quatre lignes (« Lire la suite »).
- **Notes signées du personnage** : le résumé, le butin et l'historique d'un PNJ signent du
  personnage du joueur (ou « MJ - pseudo »), comme le panneau des notes. Ta première note, et
  celles reçues en direct, ne signent plus du nom du compte.
- **Lien Roll20 sur le tableau de bord** : le MJ colle le lien de sa partie Roll20 dans
  « Modifier » (sur la bannière) ou via « Ajouter le lien de la partie Roll20 ». Toute la table
  voit alors le bouton « Rejoindre la partie sur Roll20 », qui l'ouvre dans le navigateur. Le
  lien est gardé sur le serveur partagé ; seuls les liens https de roll20.net sont acceptés.
- **Date dans le chat** : chaque message et chaque jet porte sa date en petit (JJ/MM/AA) avant
  l'heure, dans le chat d'Eraser comme dans celui du tabletop ; la date complète au survol.
