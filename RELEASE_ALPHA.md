# Eraser 0.1.1-alpha.249 — Le rayon se remplit

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

- **La vitrine reste ouverte.** Dans le journal, un achat ou un changement du MJ met la fenêtre
  du magasin à jour sur place : le journal derrière n'est plus relu pendant qu'elle est ouverte,
  mais à sa fermeture (croix ou clic à côté).
- **Remettre en vente ce qui est parti.** Dans « Vendu », un objet qui n'est plus en rayon a, pour
  le MJ, deux boutons : remettre le même item en vente (au « Nombre max » de l'item), ou relancer
  la ligne avec un autre item (clic droit : choisir la rareté), comme les lignes en vente. La
  vente reste dans l'historique, marquée « remis en vente ». Un objet encore en rayon se
  réassortit avec le « ×N » de sa ligne.
- **Les ventes restent dans leur session.** Elles ne s'affichent que dans la session où elles ont
  été faites : un magasin qui revient dans une autre session repart sans cet historique. Un achat
  fait hors session (magasins sauvegardés, Événements) va à la dernière session du magasin.
- **Notes de session plus compactes.** Une note ouverte ne répète plus son type (c'est déjà le nom
  de son groupe) ; son auteur devient une petite étiquette : son personnage dans la session (le
  dernier modifié s'il en a plusieurs), ou « MJ - pseudo ». Modifier et Supprimer ne sont plus
  que deux icônes.
