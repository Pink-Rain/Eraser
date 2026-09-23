// 0.7.1 : s'exécute dans la page Roll20 elle-même (pas dans le monde isolé du
// compagnon). Le script Mod ne peut pas modifier les dossiers du Journal : c'est
// la page de l'éditeur, comme quand le MJ glisse une fiche, qui les enregistre.
(function () {
  'use strict';
  if (window.top !== window || window.__eraserPageBridge) return;
  window.__eraserPageBridge = true;

  function strip(nodes, wanted) {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (typeof node === 'string' && wanted.has(node)) nodes.splice(index, 1);
      else if (node && typeof node === 'object' && Array.isArray(node.i)) strip(node.i, wanted);
    }
  }

  function newFolderId() {
    if (typeof window.generateUUID === 'function') return window.generateUUID();
    return '-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== 'eraser-companion' || data.type !== 'journal-folder') return;
    const reply = (result) => window.postMessage({ source: 'eraser-page', requestId: data.requestId, ...result }, '*');
    try {
      const campaign = window.Campaign;
      if (!campaign || typeof campaign.get !== 'function' || typeof campaign.save !== 'function') throw new Error('Le Journal Roll20 n’est pas accessible depuis la page.');
      const name = String(data.folder || '').trim();
      const ids = (Array.isArray(data.ids) ? data.ids : []).filter((id) => typeof id === 'string' && id);
      if (!name || !ids.length) return reply({ ok: true, moved: 0 });
      const raw = campaign.get('journalfolder');
      let tree = [];
      try { tree = typeof raw === 'string' ? JSON.parse(raw || '[]') : Array.isArray(raw) ? raw : []; } catch { tree = []; }
      if (!Array.isArray(tree)) tree = [];
      strip(tree, new Set(ids));
      let folder = tree.find((node) => node && typeof node === 'object' && Array.isArray(node.i) && node.n === name);
      if (!folder) {
        folder = { n: name, id: newFolderId(), i: [] };
        tree.push(folder);
      }
      folder.i.push(...ids);
      campaign.save({ journalfolder: JSON.stringify(tree) });
      try { window.d20?.journal?.refreshJournalList?.(); } catch { /* le Journal se redessinera seul */ }
      reply({ ok: true, moved: ids.length });
    } catch (error) {
      reply({ ok: false, error: error?.message || String(error) });
    }
  });
}());
