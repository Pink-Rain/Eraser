# Eraser 0.1.1-alpha.149 — Sauvegardes fiables, étiquettes et créateur de classe

Cette version arrive par la mise à jour sans réinstallation.

## Enregistrer dans Google Sheets

- Une coupure réseau (mise en veille, Wi-Fi), un Google trop sollicité ou un jeton expiré
  ne font plus échouer l'enregistrement : Eraser réessaie de lui-même (jusqu'à une
  demi-minute quand Google demande d'attendre) et renouvelle son accès à Google, même
  pendant un travail d'arrière-plan.
- Quand un enregistrement échoue malgré tout, le message dit pourquoi (connexion coupée,
  Google qui ne répond pas, accès refusé…) au lieu du message général. La fiche propose
  **Réessayer** et garde ce qui a été tapé.
- Une saisie refusée ne provoque plus ensuite des « modifiée entre-temps » à répétition, et
  une relecture plus ancienne n'efface plus une saisie toute récente.
- Une recherche de feuille ratée un instant n'affiche plus « pas reliée » (ni des index
  vides) pendant dix minutes : Eraser réessaie vingt secondes plus tard.
- Une requête Google bloquée ne fige plus les enregistrements de tous les index.
- Ce qui est modifié dans la fiche d'une ligne apparaît aussitôt dans le tableau derrière.

## Le gras venu de Sheets

- Le gras du début d'une cellule n'est plus perdu à la relecture.
- Une cellule mise en gras dans Sheets ne redevient plus grasse en entier : Eraser écrit
  chaque morceau gras ou non gras explicitement.
- Le gras collé depuis Google Docs ou Sheets, ou posé avec Ctrl+B après une couleur, est gardé.

## Étiquettes « { »

- Dans la fiche (vue formulaire), cliquer une proposition du menu « { » fonctionne, et le
  champ qui modifie le texte d'une étiquette se referme normalement.
- Une étiquette créée en fin de paragraphe reste sur sa ligne ; celles qui avaient sauté à
  la ligne y reviennent à la prochaine modification.
- Une citation laissée en plan (« {État:Empoi ») rouvre le menu dès qu'on continue de l'écrire.

## Créateur de classe

- Actifs, Passifs, Bonus et Bonus de rang s'ouvrent dans la fiche des index (barre de mise
  en forme, Précédent, « Aller à… », Suivant, enregistrement automatique) : clic sur le nom
  (ou le rang), ou clic droit › Ouvrir la fiche.
- Onglet Classes : la corbeille d'un sort demande s'il faut le supprimer de l'index (pour
  toutes les classes) ou seulement le retirer de ce rang. Un bouton « Retirer de ce rang »
  est aussi sur chaque carte.
- La recherche d'un sort se referme d'un clic ailleurs ou avec Échap, sans jamais choisir un
  sort qu'on n'a pas cliqué.
- La présentation de la classe (caractéristiques, spécialités) se modifie ici, dans la
  nouvelle partie « Présentation ».

## Règles › Classes

- Les pages des classes se consultent seulement : elles ne se modifient plus d'ici. Un
  bouton mène au créateur de classe pour les administrateurs et les MJ.
