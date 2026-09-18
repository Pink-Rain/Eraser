// 0.3.0 : le service worker ne fait plus que les requêtes réseau vers Eraser.
// Toute la configuration Roll20 passe par le script Mod.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !['eraser-fetch', 'eraser-image'].includes(message.type)) return false;
  (async () => {
    try {
      const response = await fetch(message.url, {
        method: message.method || 'GET',
        headers: message.headers || {},
        body: message.body || undefined,
        cache: 'no-store',
      });
      if (message.type === 'eraser-image') {
        if (!response.ok) throw new Error('Téléchargement du portrait impossible (' + response.status + ').');
        const type = (response.headers.get('content-type') || 'image/png').split(';')[0];
        if (!type.startsWith('image/')) throw new Error('Le lien du portrait ne renvoie pas une image (' + type + ').');
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
