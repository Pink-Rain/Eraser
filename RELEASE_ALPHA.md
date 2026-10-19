# Eraser 0.1.1-alpha.233 — « Modifier » reste sur sa page

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## « Modifier » d'un index reste sur sa page

- La fenêtre « Modifier » ne suit plus quand on change de page ou d'onglet d'Eraser : elle reste
  **attachée à l'index qui l'a ouverte**. Ailleurs, elle est cachée ; en revenant sur l'index, on
  la retrouve ouverte, avec ses modifications en attente.
- Chaque index garde la sienne : ouvrir « Modifier » sur un autre index ne ferme plus la première.

## « Rareté et emplacements »

- Une colonne neuve passée au type « Rareté et emplacements » prend ce nom d'office (si aucune
  autre colonne de l'onglet ne le porte déjà). Les autres types gardent le nom tapé.

## Rappel (alpha 232)

La reprise des anciennes raretés et anciens emplacements dans la colonne « Rareté et
emplacements » n'est pas faite automatiquement. Tant qu'un onglet n'a pas cette colonne, rien ne
change pour lui.
