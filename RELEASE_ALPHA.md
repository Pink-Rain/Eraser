# Eraser 0.1.1-alpha.21 — mini-barre, chat de table partout, pages admin réparées

## Ajouté

- **La mini-barre peut se réduire sans épingler la fenêtre d'abord** : le
  double-clic sur la barre de titre réduit désormais la fenêtre même quand
  l'épingle (toujours au premier plan) n'a pas été activée avant — elle
  s'active automatiquement au moment de la réduction, puisqu'une mini-barre
  flottante n'a de sens que par-dessus les autres fenêtres.
- **Chat et dés disponibles sur toutes les pages** : un nouveau widget
  flottant, par campagne, synchronisé en temps réel (comme le chat du
  tabletop) et présent partout sauf sur la page tabletop elle-même (qui
  garde son propre chat lié à la carte active).
- **Commande `/rjoueur`** : comme `/joueur` (message chuchoté à un joueur),
  mais pour lancer un jet de dés en privé. Disponible dans le nouveau
  widget et dans le chat du tabletop.

## Corrigé

- **« Toutes les campagnes » et « Tous les personnages » plantaient** :
  ces deux pages appelaient la liste des comptes sans le jeton de session
  nécessaire pour s'authentifier auprès de l'annuaire de comptes partagé,
  provoquant une erreur 401 non rattrapée à chaque chargement.
- **Créer un personnage ou une campagne** renvoie maintenant directement
  vers la fiche ou le tableau de bord créé, au lieu de rester sur
  l'accueil.
- **L'index des classes (Règles et Ressources) pouvait afficher « aucune
  classe »** alors qu'il s'agissait en réalité d'un échec de lecture
  Google Sheets avalé silencieusement ; l'échec remonte maintenant
  correctement et affiche le vrai message d'indisponibilité.
- **Rafraîchissements en arrière-plan (index des classes) qui échouaient à
  s'authentifier** : en mode annuaire de comptes partagé, récupérer le
  jeton d'accès Google Drive a besoin du cookie de session de la requête
  en cours, illisible une fois le travail relégué en arrière-plan
  (`waitUntil`). Le jeton est maintenant récupéré par avance, pendant que
  la requête est encore active.
- **Ajouter un personnage à une campagne échouait sans aucun message** :
  l'échec affiche maintenant la raison réelle (personnage/campagne
  introuvable, feuille non reliée…) au lieu de ne rien faire.

## Performances

- Fiche de personnage : un calcul recalculé à chaque frappe sur un champ
  quelconque (recherche des sorts/compétences liés) est maintenant mis en
  cache et ne se relance que lorsque la classe ou le niveau changent
  réellement.
- Les recherches de personnage/campagne déjà lues dans une même page ne
  sont plus relues plusieurs fois.
- La page tabletop (carte, Leaflet) se charge désormais à la demande côté
  client au lieu d'être incluse dans le paquet de toutes les pages.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
