# Eraser 0.1.1-alpha.257 — Nés quelque part, un jour

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Dans Google Sheets, des
colonnes s'ajoutent à droite : « Date de naissance », « Calendrier de naissance » et « Lieu de
naissance » dans la feuille des personnages ; « Lieux liés (JSON) », « Calendrier », « Date de
début » et « Date de fin » dans « Sessions ». Rien d'existant n'est déplacé ni réécrit.

- **Fiche de personnage** : Religions et Autre remontent sur la ligne des Langues parlées et
  des Titres honorifiques. À côté de Taille, Poids et Âge arrivent la **date de naissance** et
  le **lieu de naissance**. La date se choisit dans le calendrier de Cir'Hoit (jour, mois,
  année, avec le jour de la semaine et la saison) ; « Autre calendrier » en prend un autre de
  l'Index des calendriers, ou le calendrier réel.
- **Créateur de session** : une **date en jeu** (calendrier de Cir'Hoit d'office, « Autre
  calendrier » au besoin), sur un jour ou sur plusieurs (« Sur plusieurs jours »).
- **Lieux de la session reliés à l'Index des lieux** : on cherche un lieu et on le lie d'un
  clic. Un lieu absent s'ajoute à l'index d'ici, dans l'onglet choisi (Villes, Régions…). Comme
  le reste de la session, un lieu lié est caché aux joueurs jusqu'à ce que l'œil le révèle.
  L'ancien texte des lieux reste affiché (et modifiable) tant qu'il n'est pas vide.
- **Journal de campagne** : la date en jeu s'affiche sous le titre de la session et dans le
  bilan ; les lieux liés rejoignent ceux que citent les notes, avec leur image de l'index.
