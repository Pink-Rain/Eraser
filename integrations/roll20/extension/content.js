(function () {
  'use strict';
  const VERSION = '0.4.0';
  const API = 'http://127.0.0.1:32147/api/roll20/bridge';
  const IS_TOP = window.top === window;
  let syncing = false;
  const acknowledgements = new Map();
  const observedAcknowledgements = new Set();
  const observedRoots = new WeakSet();
  const chatRootList = [];
  let acknowledgementPoll = null;

  /* ---------- utilitaires ---------- */
  const encode = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const decode = (value) => {
    let input = value.replace(/-/g, '+').replace(/_/g, '/');
    while (input.length % 4) input += '=';
    return JSON.parse(decodeURIComponent(escape(atob(input))));
  };
  const rid = () => Math.random().toString(36).slice(2, 12);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const storageGet = (key) => new Promise((resolve) => chrome.storage.local.get([key], (result) => resolve(result[key] || '')));
  const storageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));
  const runtimeMessage = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  const bridgeFetch = (options) => runtimeMessage({ type: 'eraser-fetch', ...options });

  /* ---------- accusés de réception du Mod ---------- */
  function waitForAcknowledgement(id, timeoutMs = 12000, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        acknowledgements.delete(id);
        reject(new Error(timeoutMessage || 'Le script Mod Roll20 ne répond pas. Vérifie dans la console Mod que « Eraser Bridge ' + VERSION + ' prêt » apparaît.'));
      }, timeoutMs);
      acknowledgements.set(id, {
        resolve: (metadata) => {
          clearTimeout(timer);
          acknowledgements.delete(id);
          if (metadata?.error) reject(new Error(metadata.error));
          else resolve(metadata || {});
        },
        cancel: () => { clearTimeout(timer); acknowledgements.delete(id); },
      });
      scanAllChatRoots();
    });
  }

  function scanAcknowledgements(text) {
    for (const match of String(text || '').matchAll(/ERASER_ACK:([A-Za-z0-9_-]+)(?::([A-Za-z0-9_-]+))?/g)) {
      const id = match[1];
      let metadata = {};
      try { if (match[2]) metadata = decode(match[2]); } catch { metadata = {}; }
      acknowledgements.get(id)?.resolve(metadata);
      if (!observedAcknowledgements.has(id)) {
        observedAcknowledgements.add(id);
        void storageSet({ eraserLastAcknowledgement: { id, metadata, at: Date.now() } });
      }
    }
  }
  function scanAllChatRoots() { for (const root of chatRootList) scanAcknowledgements(root.textContent || ''); }

  /* ---------- chat ---------- */
  function chatElements() {
    const input = document.querySelector('#textchat-input textarea, textarea.ui-autocomplete-input, textarea[placeholder*="chat" i], textarea[aria-label*="chat" i]');
    const container = input && (input.closest('#textchat-input') || input.parentElement);
    const form = input && input.closest('form');
    const candidates = [...new Set([
      ...(form ? form.querySelectorAll('button[type="submit"], input[type="submit"], button') : []),
      ...(container ? container.querySelectorAll('button[type="submit"], input[type="submit"], button') : []),
    ])];
    const button = candidates.find((c) => c.matches('[type="submit"]')) || candidates.find((c) => /envoyer|send|chat/i.test([c.textContent, c.getAttribute('aria-label'), c.getAttribute('title')].filter(Boolean).join(' ')));
    return { input, form, button };
  }

  async function sendCommand(command) {
    const { input, form, button } = chatElements();
    if (!input) throw new Error('Le champ de chat Roll20 est introuvable. Ouvre l’onglet Chat puis réessaie.');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    if (setter) setter.call(input, command); else input.value = command;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: command }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(50);
    if (button && !button.matches('[type="submit"]')) button.click();
    else if (form && typeof form.requestSubmit === 'function') form.requestSubmit(button || undefined);
    else if (button) button.click();
    else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    for (let attempt = 0; attempt < 10 && input.value.trim() === command; attempt += 1) await sleep(100);
    if (input.value.trim() === command) throw new Error('La commande Eraser est restée dans le chat Roll20 sans être envoyée. Ouvre l’onglet Chat puis réessaie.');
    await sleep(120);
  }

  // Envoie une commande et attend l'accusé correspondant.
  async function command(prefix, payload, timeoutMs, timeoutMessage) {
    const syncId = payload?.syncId || rid();
    const pending = waitForAcknowledgement(syncId, timeoutMs, timeoutMessage);
    try {
      await sendCommand(payload ? prefix + ' ' + encode({ ...payload, syncId }) : prefix + ' ' + syncId);
      return await pending;
    } catch (error) {
      acknowledgements.get(syncId)?.cancel();
      throw error;
    }
  }

  async function checkModBridge() {
    const result = await command('!eraser-ping', null, 8000, 'Le script Mod Eraser Bridge ne répond pas. Installe la version ' + VERSION + ' et vérifie la console Mod.');
    if (result.version !== VERSION) throw new Error('Le script Mod est en version ' + (result.version || 'ancienne') + ', l’extension en ' + VERSION + '. Mets le script Mod à jour.');
  }

  async function importPayload(payload) {
    const syncId = rid();
    const encoded = encode({ ...payload, syncId });
    const pending = waitForAcknowledgement(syncId, 15000);
    try {
      if (encoded.length <= 3500) await sendCommand('!eraser-import ' + encoded);
      else {
        const parts = [];
        for (let offset = 0; offset < encoded.length; offset += 3000) parts.push(encoded.slice(offset, offset + 3000));
        for (let index = 0; index < parts.length; index += 1) await sendCommand('!eraser-chunk ' + syncId + ' ' + index + '/' + parts.length + ' ' + parts[index]);
        await sendCommand('!eraser-chunk-done ' + syncId);
      }
      return await pending;
    } catch (error) {
      acknowledgements.get(syncId)?.cancel();
      throw error;
    }
  }

  /* ---------- portraits ---------- */
  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl).match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error('Le portrait reçu depuis Eraser est invalide.');
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  }

  // Roll20 accepte png/jpg/gif ; on convertit le reste (webp, avif…) et on réduit les images énormes.
  async function toUploadableFile(dataUrl, name) {
    let blob = dataUrlToBlob(dataUrl);
    const safeName = (String(name || 'portrait').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'portrait');
    const accepted = /^image\/(png|jpe?g|gif)$/i.test(blob.type);
    let bitmap = null;
    try { bitmap = await createImageBitmap(blob); } catch { if (!accepted) throw new Error('Le portrait n’est pas une image lisible (' + (blob.type || 'type inconnu') + ').'); }
    const tooBig = bitmap && (bitmap.width > 1400 || bitmap.height > 1400 || blob.size > 4 * 1024 * 1024);
    if (bitmap && (!accepted || tooBig) && !/gif/i.test(blob.type)) {
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    }
    bitmap?.close?.();
    const extension = blob.type.split('/')[1].replace('jpeg', 'jpg');
    return new File([blob], safeName + '.' + extension, { type: blob.type });
  }

  // La table de jeu : le plus grand canvas visible de l'éditeur.
  function tabletopTarget() {
    const canvases = [...document.querySelectorAll('#editor-wrapper canvas, #editor canvas, canvas')]
      .filter((c) => { const r = c.getBoundingClientRect(); return r.width > 200 && r.height > 200 && getComputedStyle(c).visibility !== 'hidden'; });
    canvases.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    const canvas = canvases[0];
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    // On vise l'élément réellement au premier plan (Roll20 empile plusieurs canvas).
    const top = document.elementFromPoint(x, y);
    const target = top && (top === canvas || canvas.parentElement?.contains(top)) ? top : canvas;
    return { target, x, y };
  }

  // Imite le glisser-déposer d'un fichier sur la table : Roll20 l'envoie
  // dans ta bibliothèque avec son propre pipeline, et le Mod capture le résultat.
  function dropFileOnTabletop(file) {
    const spot = tabletopTarget();
    if (!spot) throw new Error('La table de jeu Roll20 est introuvable (reste sur l’onglet de la carte pendant la synchro).');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const init = { bubbles: true, cancelable: true, composed: true, clientX: spot.x, clientY: spot.y, screenX: spot.x, screenY: spot.y, dataTransfer: transfer };
    for (const type of ['dragenter', 'dragover', 'drop']) spot.target.dispatchEvent(new DragEvent(type, init));
  }

  async function uploadPortrait(imported, npc) {
    const portraitUrl = new URL(npc.portraitUrl, API).href;
    const image = await runtimeMessage({ type: 'eraser-image', url: portraitUrl });
    if (!image?.ok) throw new Error(image?.error || 'Le portrait Eraser n’a pas pu être téléchargé.');
    const file = await toUploadableFile(image.dataUrl, npc.name);
    const doneId = rid();
    const done = waitForAcknowledgement(doneId, 60000, 'Roll20 n’a pas renvoyé l’image importée en 60 s (upload bloqué ou table de jeu non visible).');
    try {
      await command('!eraser-expect-portrait', { characterId: imported.characterId, eraserId: imported.eraserId, portraitHash: imported.portraitHash, doneId }, 10000);
      dropFileOnTabletop(file);
      return await done;
    } catch (error) {
      acknowledgements.get(doneId)?.cancel();
      await sendCommand('!eraser-cancel-portrait').catch(() => {});
      throw error;
    }
  }

  /* ---------- panneau ---------- */
  function status(message, error) {
    const node = document.getElementById('eraser-roll20-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.error = error ? '1' : '0';
  }
  const openPanel = () => document.getElementById('eraser-roll20-panel')?.classList.add('open');
  const closePanel = () => document.getElementById('eraser-roll20-panel')?.classList.remove('open');

  function gameId() {
    const query = new URL(location.href).searchParams;
    return query.get('campaign') || query.get('id') || location.pathname.split('/').filter(Boolean).pop() || 'roll20-game';
  }
  const gameName = () => document.title.replace(/\s*\|\s*Roll20.*$/i, '').trim() || 'Partie Roll20';

  async function fetchCampaign() {
    const token = await storageGet('eraserToken');
    if (!token) throw new Error('Colle d’abord la clé créée dans Eraser.');
    const url = API + '?gameId=' + encodeURIComponent(gameId()) + '&gameName=' + encodeURIComponent(gameName());
    const response = await bridgeFetch({ url, headers: { authorization: 'Bearer ' + token } });
    if (!response?.ok) throw new Error(response?.payload?.error || 'Connexion à Eraser impossible.');
    return response.payload;
  }

  /* ---------- synchronisation ---------- */
  async function syncAll() {
    if (syncing || !IS_TOP) return;
    syncing = true; openPanel();
    const started = Date.now();
    try {
      status('Vérification du script Mod Roll20…');
      await checkModBridge();
      status('Chargement de la campagne…');
      const payload = await fetchCampaign();
      if (!Array.isArray(payload.npcs) || !Array.isArray(payload.shops)) throw new Error('Eraser a renvoyé une campagne invalide. Vérifie la clé de liaison.');
      const total = payload.npcs.length + payload.shops.length;
      if (!total) throw new Error('Eraser a renvoyé 0 PNJ et 0 magasin. Vérifie que les PNJ sont marqués « dans la campagne ».');

      const failures = [];
      const warnings = [];
      let imported = 0, tokens = 0, portraits = 0, done = 0;

      for (const npc of payload.npcs) {
        const label = 'PNJ ' + (++done) + '/' + total + ' — ' + npc.name;
        status(label);
        let result;
        try {
          result = await importPayload({ campaign: payload.campaign, kind: 'npc', value: npc });
          if (!result.characterId) throw new Error('Roll20 n’a pas confirmé la création de la fiche.');
          imported += 1;
        } catch (error) {
          failures.push(npc.name + ' : import — ' + error.message);
          continue;
        }

        if (result.needsAvatar) {
          status(label + ' (portrait)');
          try {
            const portrait = await uploadPortrait(result, npc);
            portraits += 1;
            if (portrait.token) tokens += 1;
          } catch (error) {
            failures.push(npc.name + ' : portrait — ' + error.message);
            // Sans portrait, on configure quand même le jeton (image existante ou image par défaut).
            try {
              const fallback = await command('!eraser-token', { characterId: result.characterId, eraserId: result.eraserId }, 12000);
              if (fallback.token) tokens += 1; else warnings.push(npc.name + ' : jeton en attente — ' + fallback.reason);
            } catch (tokenError) { failures.push(npc.name + ' : jeton — ' + tokenError.message); }
          }
        } else if (result.token) {
          tokens += 1;
        } else {
          warnings.push(npc.name + ' : jeton en attente — ' + (result.reason || 'raison inconnue'));
        }
      }

      for (const shop of payload.shops) {
        status('Magasin ' + (++done) + '/' + total + ' — ' + shop.name);
        try { await importPayload({ campaign: payload.campaign, kind: 'shop', value: shop }); }
        catch (error) { failures.push(shop.name + ' : import — ' + error.message); }
      }

      await sendCommand('!eraser-import-done');
      const seconds = Math.round((Date.now() - started) / 1000);
      const summary = imported + '/' + payload.npcs.length + ' PNJ · ' + tokens + ' jeton(s) OK · ' + portraits + ' portrait(s) importé(s) · ' + payload.shops.length + ' magasin(s) · ' + seconds + ' s';
      if (failures.length) status('Synchronisation incomplète — ' + summary + '\n\n' + failures.concat(warnings).join('\n'), true);
      else if (warnings.length) status('Synchronisation faite — ' + summary + '\n\n' + warnings.join('\n') + '\n\nAstuce : sélectionne un jeton puis « !eraser-placeholder » pour donner une image par défaut aux PNJ sans portrait.', false);
      else status('Synchronisation terminée — ' + summary);
    } catch (error) {
      status(error.message || String(error), true);
    } finally {
      syncing = false;
    }
  }

  async function resetAllImports() {
    if (!window.confirm('Supprimer les PNJ et magasins créés par Eraser dans cette partie Roll20, puis repartir de zéro ?')) return;
    try {
      const result = await command('!eraser-reset-all', null, 15000);
      status((result.removed || 0) + ' import(s) Eraser supprimé(s). Tu peux relancer une synchronisation.');
    } catch (error) { status(error.message || String(error), true); }
  }

  async function pushHp(encoded) {
    try {
      const token = await storageGet('eraserToken');
      if (!token) throw new Error('Clé Eraser absente.');
      const response = await bridgeFetch({ url: API, method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(decode(encoded)) });
      if (!response?.ok) throw new Error(response?.payload?.error || 'Retour des PV impossible.');
      openPanel(); status(response.payload.updated + ' PNJ mis à jour dans Eraser.');
    } catch (error) { openPanel(); status(error.message || String(error), true); }
  }

  /* ---------- observation du chat ---------- */
  const handledEvents = new Set();
  function watchChat() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        const text = (node.nodeType === Node.TEXT_NODE ? node.parentElement?.textContent : node.textContent) || '';
        scanAcknowledgements(text);
        if (!IS_TOP) continue;
        if (text.includes('ERASER_SYNC_REQUEST')) void syncAll();
        const hp = text.match(/ERASER_HP:([A-Za-z0-9_-]+)/);
        if (hp && !handledEvents.has(hp[1])) { handledEvents.add(hp[1]); void pushHp(hp[1]); }
        observeNestedRoots(observer, node);
      }
    });
    observeChatRoot(observer, document.body);
    acknowledgementPoll = acknowledgementPoll || setInterval(() => { if (acknowledgements.size) scanAllChatRoots(); }, 300);
  }
  function observeChatRoot(observer, root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    chatRootList.push(root);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    observeNestedRoots(observer, root);
  }
  function observeNestedRoots(observer, node) {
    if (node?.shadowRoot) observeChatRoot(observer, node.shadowRoot);
    for (const element of node?.querySelectorAll?.('*') || []) if (element.shadowRoot) observeChatRoot(observer, element.shadowRoot);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const ack = changes.eraserLastAcknowledgement?.newValue;
    if (ack?.id) acknowledgements.get(ack.id)?.resolve(ack.metadata);
  });

  async function mount() {
    if (document.getElementById('eraser-roll20-button')) return;
    const button = document.createElement('button');
    button.id = 'eraser-roll20-button'; button.textContent = 'Eraser'; button.type = 'button';
    const panel = document.createElement('aside');
    panel.id = 'eraser-roll20-panel';
    panel.innerHTML = '<div class="eraser-head"><strong>Eraser ↔ Roll20 <small style="opacity:.6">' + VERSION + '</small></strong><button type="button" data-close>×</button></div>'
      + '<label>Clé de liaison<input type="password" id="eraser-roll20-token" autocomplete="off" placeholder="era_…"></label>'
      + '<div class="eraser-actions"><button type="button" data-save>Enregistrer la clé</button><button type="button" data-sync>Tout synchroniser</button><button type="button" data-hp>Renvoyer les PV</button><button type="button" data-reset>Effacer les imports Eraser / repartir de zéro</button></div>'
      + '<p id="eraser-roll20-status">Prêt.</p>';
    document.body.append(button, panel);
    button.addEventListener('click', openPanel);
    panel.querySelector('[data-close]').addEventListener('click', closePanel);
    panel.querySelector('[data-save]').addEventListener('click', async () => {
      const token = panel.querySelector('#eraser-roll20-token').value.trim();
      if (!token.startsWith('era_')) return status('Cette clé n’est pas valide.', true);
      await storageSet({ eraserToken: token }); status('Clé enregistrée.');
    });
    panel.querySelector('[data-sync]').addEventListener('click', syncAll);
    panel.querySelector('[data-hp]').addEventListener('click', () => sendCommand('!eraser-push-hp').catch((error) => status(error.message, true)));
    panel.querySelector('[data-reset]').addEventListener('click', resetAllImports);
    panel.querySelector('#eraser-roll20-token').value = await storageGet('eraserToken');
    watchChat();
  }

  const start = () => (IS_TOP ? mount() : watchChat());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void start()); else void start();
}());
