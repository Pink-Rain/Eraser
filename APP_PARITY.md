# Vérification de fidélité entre le site source et l’application

Base vérifiée : branche `main` au commit
`761bcfbd2bbd28ef4b9bded73e3b17f6cf43ad4a`.

## Résultat

- 270 fichiers historiques trouvés sur la branche `main` ;
- 270 fichiers historiques présents dans l’application Windows ;
- 0 fichier historique manquant ;
- 0 route historique supprimée ;
- 0 fichier CSS, SCSS, Sass ou Less historique modifié ;
- 73 routes de pages/API historiques conservées ;
- routes locales supplémentaires pour l’authentification et Drive ;
- ajouts Windows isolés dans `desktop/`, les scripts de construction et les
  workflows GitHub.

La commande `npm run desktop:parity` reproduit cette comparaison et fait échouer
la publication si un fichier du site disparaît, si une route est renommée ou si
le CSS historique diverge.

## Ce que cette vérification garantit

Le code, les composants, les pages, les styles et les ressources présents dans
la dernière copie GitHub du site sont inclus dans l’application. La compilation
Cloudflare historique et la compilation Windows sont exécutées séparément.

## Ce qui nécessite encore une validation avec les comptes réels

Google Drive, Google Sheets et Roll20 dépendent d’autorisations externes qui ne
peuvent pas être placées dans GitHub. Leur code et leurs routes sont présents,
mais leur validation finale doit être faite dans Eraser avec le compte Google
et la campagne Roll20 concernés.
