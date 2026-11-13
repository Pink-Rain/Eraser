import manifest from "@/integrations/roll20/extension/manifest.json"

/** Le manifeste du compagnon livré avec cette version d'Eraser (page et serveur). */
export const companionManifest = manifest as { name: string; version: string }

/** Le nom du compagnon dans le navigateur : il reconnaît aussi son dossier sur le PC. */
export const ROLL20_COMPANION_NAME = companionManifest.name

