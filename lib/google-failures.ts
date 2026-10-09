/**
 * Pourquoi Google Sheets (ou ce qui y mène) a refusé une écriture, en clair. Sans lui, une
 * coupure réseau, un jeton refusé ou un Google trop sollicité affichaient tous le même
 * « n'a pas pu être enregistrée dans Google Sheets », impossible à distinguer.
 * Renvoie "" pour une erreur que la route sait mieux dire elle-même.
 */
export function googleFailureMessage(code: string) {
  if (code === "SHEETS_NETWORK_ERROR") return "La connexion à Google Sheets a été coupée pendant l’enregistrement (réseau, mise en veille). Vérifie la connexion puis recommence ; pour un ajout ou une suppression de ligne, actualise d’abord le tableau."
  if (code === "SHEETS_TIMEOUT") return "Google Sheets n’a pas répondu à temps. Recommence dans un instant ; pour un ajout ou une suppression de ligne, actualise d’abord le tableau."
  if (code === "NOT_AUTHENTICATED" || /^REMOTE_ACCOUNTS_ERROR_/.test(code)) return "Le serveur partagé d’Eraser n’a pas donné l’accès à Google (session expirée ou serveur injoignable). Recommence ; si cela continue, déconnecte-toi puis reconnecte-toi."
  if (code === "GOOGLE_DRIVE_NOT_AUTHORIZED") return "Google Drive n’est pas relié à Eraser : un administrateur doit le relier dans Administration → Google Drive."
  const google = code.match(/^SHEETS_API_ERROR:(\d+)(?::([\s\S]*))?$/)
  // Toutes les installations lisent Google avec le même compte : son quota par minute est commun.
  if (google?.[1] === "429") return "Google Sheets est saturé pour le moment : toutes les installations d’Eraser partagent le même compte Google et son quota de la minute est atteint. Rien n’est perdu ; recommence dans une minute."
  if (google?.[1] === "401" || google?.[1] === "403") return `Google a refusé l’accès à la feuille (${google[1]}). Vérifie dans Administration → Google Drive que le compte relié y a toujours accès.`
  if (google) return `Google Sheets a refusé la modification (${google[1]}${google[2] ? ` : ${google[2].slice(0, 300)}` : ""}).`
  if (code === "CLASSES_READ_TIMEOUT") return "Google Sheets met trop de temps à donner les classes à cet ordinateur. Réessaie dans une minute : la lecture continue en arrière-plan et sera prête au prochain essai."
  if (code === "CLASSES_SHEET_NOT_LINKED") return "La feuille des classes est introuvable dans le Drive d’Eraser depuis cet ordinateur (recherche par son nom). Réessaie dans une minute ; si cela continue, un administrateur peut cliquer sur « Relier mes feuilles existantes » dans Administration → Google Drive."
  const tab = code.match(/^JDR_SHEET_TAB_MISSING:(.+)$/)
  if (tab) return `L’onglet « ${tab[1]} » est introuvable dans sa feuille Google Sheets : a-t-il été renommé ?`
  return ""
}
