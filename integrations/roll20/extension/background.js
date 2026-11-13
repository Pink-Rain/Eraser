// 0.3.0 : le service worker ne fait plus que les requêtes réseau vers Eraser.
// Toute la configuration Roll20 passe par le script Mod.
// 0.8.0 : « eraser-file » télécharge aussi un fichier qui n'est pas une image (PDF des documents).
// 0.10.0 : « eraser-self-update » : quand Eraser a rangé une version plus récente dans le dossier
// du compagnon (dossier de campagne › Compagnon Roll20 › étape 1), le compagnon se recharge seul.
// 0.10.1 : le compagnon dit à Eraser quelle version tourne dans le navigateur (dès qu'il est
// rechargé) et celle du script Mod de la partie : l'étape 2 et l'étape 3 se cochent seules.

const ERASER = 'http://127.0.0.1:32147';

// Eraser fermé : rien à signaler, rien ne casse.
async function report(extra) {
  const query = new URLSearchParams({ running: chrome.runtime.getManifest().version, ...(extra || {}) });
  try { return await fetch(ERASER + '/api/roll20/bridge/companion?' + query, { cache: 'no-store' }); } catch { return null; }
}
chrome.runtime.onInstalled.addListener(() => { void report(); });
chrome.runtime.onStartup.addListener(() => { void report(); });

function newerVersion(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference > 0;
  }
  return false;
}

// Une seule tentative par version : chargé depuis un autre dossier, le compagnon ne boucle pas.
async function selfUpdate() {
  const running = chrome.runtime.getManifest().version;
  const response = await report();
  if (!response?.ok) return { reloading: false };
  const { folderVersion } = await response.json();
  if (!folderVersion || !newerVersion(folderVersion, running)) return { reloading: false };
  const { eraserReloadedFor } = await chrome.storage.local.get('eraserReloadedFor');
  if (eraserReloadedFor === folderVersion) return { reloading: false, otherFolder: folderVersion };
  await chrome.storage.local.set({ eraserReloadedFor: folderVersion });
  setTimeout(() => chrome.runtime.reload(), 400);
  return { reloading: true, version: folderVersion };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'eraser-report-mod') {
    report({ mod: String(message.version || '') }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'eraser-self-update') {
    selfUpdate().then(sendResponse, () => sendResponse({ reloading: false }));
    return true;
  }
  if (!message || !['eraser-fetch', 'eraser-image', 'eraser-file'].includes(message.type)) return false;
  (async () => {
    try {
      const response = await fetch(message.url, {
        method: message.method || 'GET',
        headers: message.headers || {},
        body: message.body || undefined,
        cache: 'no-store',
      });
      if (message.type === 'eraser-image' || message.type === 'eraser-file') {
        const image = message.type === 'eraser-image';
        if (!response.ok) throw new Error((image ? 'Téléchargement du portrait impossible (' : 'Téléchargement du fichier impossible (') + response.status + ').');
        const type = (response.headers.get('content-type') || (image ? 'image/png' : 'application/octet-stream')).split(';')[0];
        if (image && !type.startsWith('image/')) throw new Error('Le lien du portrait ne renvoie pas une image (' + type + ').');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        return sendResponse({ ok: true, dataUrl: 'data:' + type + ';base64,' + btoa(binary) });
      }
      let payload = {};
      try { payload = await response.json(); } catch { payload = { error: 'Réponse Eraser illisible (' + response.status + ').' }; }
      sendResponse({ ok: response.ok, status: response.status, payload });
    } catch (error) {
      sendResponse({ ok: false, status: 0, payload: { error: error.message || String(error) }, error: error.message || String(error) });
    }
  })();
  return true;
});
