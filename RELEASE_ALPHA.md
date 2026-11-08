# Eraser 0.1.1-alpha.277 — Le chat ne gèle plus l'écran au lancement

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 276) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien ne change dans Google Sheets.

- **Fini le gel de 1 à 2 secondes peu après le lancement.** Il venait du salon en direct du chat :
  sa première connexion pair à pair met en route WebRTC, ce qui bloque la fenêtre. Le chat ne le
  rejoint plus dès que la page est chargée, mais quand on ouvre le chat, quand Eraser passe à
  l'arrière-plan, ou après un moment sans toucher à la souris ni au clavier (4 secondes sur une
  page de campagne, dont le journal se met à jour en direct ; 20 secondes ailleurs). L'historique
  du chat se charge comme avant ; les messages en direct arrivent dès que le salon est rejoint.
- **Le relevé de fluidité compte les extensions** : une nouvelle case « Extensions » mesure
  l'ouverture de chacune, de son chargement à son contenu prêt, avec sa version ; « Copier le
  relevé » donne aussi les versions des extensions installées. Le changement de page vers une
  extension attend maintenant qu'elle soit prête.
- **L'ouverture de la fenêtre n'est plus comptée comme un gel** : l'image qui met Eraser à l'écran
  au lancement est comptée avec les pages (« ouverture de la fenêtre »), avec le temps du serveur
  et du premier affichage.
- Va avec Eraser Page 0.2.1, qui s'installe toute seule (ou avec « Chercher les mises à jour »).
