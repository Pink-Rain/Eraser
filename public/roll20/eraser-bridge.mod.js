/* Eraser Bridge for Roll20 — eraser-jdr.chatgpt.site
 * 0.5.0 : modèle PNJ simplifié, inventaire réel et payload schema 2
 * (setDefaultTokenForCharacter). Plus aucune automatisation de fiche.
 * 0.6.0 : « Synchroniser une session » ouvre le choix de session du compagnon.
 * 0.7.0 : portrait (avatar) et token rond séparés, fiches des personnages joueurs,
 * dossier du Journal au nom de la session synchronisée.
 */
var EraserBridge = EraserBridge || (function () {
  'use strict';
  var VERSION = '0.7.0';
  var SCRIPT = 'Eraser';
  var BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var PORTRAIT_WINDOW_MS = 90000;
  var pendingPortrait = null; // { characterId, eraserId, hash, role, tokenFollows, bar, doneId, expires }

  // Propriétés de graphic reprises depuis un jeton par défaut existant (réglages du MJ conservés).
  var TOKEN_KEYS = [
    'name', 'imgsrc', 'width', 'height', 'rotation', 'isdrawing', 'flipv', 'fliph', 'gmnotes', 'controlledby', 'represents',
    'bar1_value', 'bar1_max', 'bar1_link', 'bar2_value', 'bar2_max', 'bar2_link', 'bar3_value', 'bar3_max', 'bar3_link',
    'bar1_num_permission', 'bar2_num_permission', 'bar3_num_permission', 'bar_location', 'compact_bar',
    'aura1_radius', 'aura1_color', 'aura1_square', 'aura2_radius', 'aura2_color', 'aura2_square', 'tint_color', 'statusmarkers',
    'showname', 'showplayers_name', 'showplayers_bar1', 'showplayers_bar2', 'showplayers_bar3', 'showplayers_aura1', 'showplayers_aura2',
    'playersedit_name', 'playersedit_bar1', 'playersedit_bar2', 'playersedit_bar3', 'playersedit_aura1', 'playersedit_aura2',
    'light_radius', 'light_dimradius', 'light_otherplayers', 'light_hassight', 'light_angle', 'light_losangle', 'light_multiplier',
    'adv_fow_view_distance', 'has_bright_light_vision', 'has_night_vision', 'night_vision_distance', 'night_vision_tint', 'night_vision_effect',
    'emits_bright_light', 'bright_light_distance', 'emits_low_light', 'low_light_distance', 'dim_light_opacity', 'lightColor',
    'has_limit_field_of_vision', 'limit_field_of_vision_center', 'limit_field_of_vision_total',
    'has_limit_field_of_night_vision', 'limit_field_of_night_vision_center', 'limit_field_of_night_vision_total',
    'has_directional_bright_light', 'directional_bright_light_center', 'directional_bright_light_total',
    'has_directional_dim_light', 'directional_dim_light_center', 'directional_dim_light_total',
    'tooltip', 'show_tooltip', 'lockMovement'
  ];

  function freshState() {
    return { version: VERSION, campaign: null, npcs: {}, shops: {}, characters: {}, chunks: {}, portraits: {}, tokens: {}, tokenHashes: {}, tokenImages: {}, names: {}, placeholder: '' };
  }

  function ensureState() {
    var s = state.EraserBridge = state.EraserBridge || freshState();
    ['npcs', 'shops', 'characters', 'chunks', 'portraits', 'tokens', 'tokenHashes', 'tokenImages', 'names'].forEach(function (key) { s[key] = s[key] || {}; });
    s.placeholder = s.placeholder || '';
    s.version = VERSION;
  }

  function whisper(message) { sendChat(SCRIPT, '/w gm ' + message, null, { noarchive: true }); }

  function html(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- encodage base64url UTF-8 (identique côté extension) ---------- */
  function base64Decode(value) {
    var input = String(value || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    while (input.length % 4) input += '=';
    var output = '';
    for (var i = 0; i < input.length; i += 4) {
      var a = BASE64.indexOf(input.charAt(i)), b = BASE64.indexOf(input.charAt(i + 1));
      var c = input.charAt(i + 2) === '=' ? 64 : BASE64.indexOf(input.charAt(i + 2));
      var d = input.charAt(i + 3) === '=' ? 64 : BASE64.indexOf(input.charAt(i + 3));
      output += String.fromCharCode((a << 2) | (b >> 4));
      if (c !== 64) output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
      if (d !== 64) output += String.fromCharCode(((c & 3) << 6) | d);
    }
    return output;
  }
  function base64Encode(value) {
    var output = '';
    for (var i = 0; i < value.length; i += 3) {
      var a = value.charCodeAt(i);
      var b = i + 1 < value.length ? value.charCodeAt(i + 1) : NaN;
      var c = i + 2 < value.length ? value.charCodeAt(i + 2) : NaN;
      output += BASE64.charAt(a >> 2);
      output += BASE64.charAt(((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4));
      output += isNaN(b) ? '=' : BASE64.charAt(((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6));
      output += isNaN(c) ? '=' : BASE64.charAt(c & 63);
    }
    return output;
  }
  function utf8Encode(v) { return encodeURIComponent(v).replace(/%([0-9A-F]{2})/g, function (_m, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  function utf8Decode(v) { var e = ''; for (var i = 0; i < v.length; i += 1) e += '%' + ('0' + v.charCodeAt(i).toString(16)).slice(-2); return decodeURIComponent(e); }
  function decode(value) { return JSON.parse(utf8Decode(base64Decode(value))); }
  function encode(value) { return base64Encode(utf8Encode(JSON.stringify(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }

  function hash(value) {
    var h = 5381, s = String(value || '');
    for (var i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return s ? 'h' + (h >>> 0).toString(36) + '_' + s.length : '';
  }

  /* ---------- images de bibliothèque ---------- */
  // Roll20 n'accepte en imgsrc que la version "thumb" d'une image de bibliothèque.
  function cleanImgsrc(url) {
    var parts = String(url || '').match(/(.*\/images\/.*)(thumb|med|original|max|mini)([^?]*)(\?[^?]+)?$/);
    if (!parts) return '';
    return parts[1] + 'thumb' + parts[3] + (parts[4] ? parts[4] : '?' + Math.round(Math.random() * 9999999));
  }
  function avatarFromImgsrc(imgsrc) { return String(imgsrc).replace(/\/thumb(\.[a-z0-9]+)/i, '/med$1'); }
  function sameImage(a, b) { return String(a || '').split('?')[0].replace(/\/(thumb|med|max|original|mini)\./, '/x.') === String(b || '').split('?')[0].replace(/\/(thumb|med|max|original|mini)\./, '/x.'); }

  /* ---------- fiches ---------- */
  function notesForNpc(npc) {
    var inventory = (npc.inventory || []).map(function (item) { return html(item.quantity || 1) + '× ' + html(item.name) + (item.notes ? ' — ' + html(item.notes) : ''); }).join('<br>');
    var playerNotes = html(npc.playerNotes || '').replace(/\n/g, '<br>');
    return (playerNotes ? '<p>' + playerNotes + '</p>' : '') + (inventory ? '<hr><p><strong>Inventaire</strong><br>' + inventory + '</p>' : '');
  }
  function gmNotesForNpc(npc) {
    return npc.gmNotes ? '<p>' + html(npc.gmNotes).replace(/\n/g, '<br>') + '</p>' : '';
  }

  function upsertAttribute(characterId, name, current, max) {
    var attribute = findObjs({ _type: 'attribute', _characterid: characterId, name: name })[0];
    var values = { current: String(current == null ? '' : current) };
    if (max !== undefined) values.max = String(max == null ? '' : max);
    if (attribute) attribute.set(values);
    else attribute = createObj('attribute', Object.assign({ characterid: characterId, name: name }, values));
    return attribute;
  }

  function hpAttribute(character) {
    return findObjs({ _type: 'attribute', _characterid: character.id, name: 'pv' })[0] || upsertAttribute(character.id, 'pv', 0, 0);
  }

  function eraserIdForCharacter(characterId) {
    ensureState();
    var s = state.EraserBridge;
    var found = '';
    [s.npcs, s.characters, s.shops].forEach(function (map) {
      if (!found) found = Object.keys(map).filter(function (id) { return map[id] === characterId; })[0] || '';
    });
    return found;
  }

  // Un seul endroit décide s'il faut renvoyer le portrait ou le token : leur adresse change
  // quand l'image change dans Eraser.
  function imageNeeds(eraserId, portraitUrl, tokenUrl) {
    var s = state.EraserBridge;
    var portraitHash = hash(portraitUrl || '');
    var tokenHash = hash(tokenUrl || '');
    return {
      portraitHash: portraitHash,
      tokenHash: tokenHash,
      needsAvatar: Boolean(portraitUrl) && s.portraits[eraserId] !== portraitHash,
      needsToken: Boolean(tokenUrl) && s.tokenHashes[eraserId] !== tokenHash
    };
  }

  /* ---------- dossiers du Journal ---------- */
  function journalTree() {
    var raw = Campaign().get('journalfolder');
    try { var tree = typeof raw === 'string' && raw ? JSON.parse(raw) : raw; return Array.isArray(tree) ? tree : []; }
    catch (_error) { return []; }
  }
  function removeFromTree(nodes, id) {
    for (var index = nodes.length - 1; index >= 0; index -= 1) {
      var node = nodes[index];
      if (node === id) nodes.splice(index, 1);
      else if (node && typeof node === 'object' && Array.isArray(node.i)) removeFromTree(node.i, id);
    }
  }
  // Range la fiche dans le dossier (créé à la racine au besoin), en la retirant d'ailleurs.
  function moveToFolder(characterId, folderName) {
    var name = String(folderName || '').trim();
    if (!name) return;
    var tree = journalTree();
    removeFromTree(tree, characterId);
    var folder = tree.filter(function (node) { return node && typeof node === 'object' && node.n === name && Array.isArray(node.i); })[0];
    if (!folder) {
      folder = { n: name, i: [], id: '-Eraser' + hash(name + Date.now()).replace(/[^A-Za-z0-9]/g, '') };
      tree.push(folder);
    }
    folder.i.push(characterId);
    Campaign().set('journalfolder', JSON.stringify(tree));
  }

  function characterWithEraserId(eraserId) {
    var marker = findObjs({ _type: 'attribute', name: 'eraser_id', current: eraserId })[0];
    if (!marker) return null;
    return getObj('character', marker.get('_characterid') || marker.get('characterid'));
  }

  function removeLegacyNpcAttributes(characterId) {
    ['rapidite', 'combat', 'tir', 'magie', 'force_mentale'].forEach(function (name) {
      findObjs({ _type: 'attribute', _characterid: characterId, name: name }).forEach(function (attribute) { attribute.remove(); });
    });
  }

  function upsertNpc(npc) {
    var s = state.EraserBridge;
    var character = s.npcs[npc.id] && getObj('character', s.npcs[npc.id]);
    if (!character) character = characterWithEraserId(npc.id);
    var created = false;
    if (!character) {
      character = createObj('character', { name: npc.name, inplayerjournals: '', controlledby: '' });
      s.tokens[npc.id] = false;
      s.portraits[npc.id] = '';
      created = true;
    }
    s.npcs[npc.id] = character.id;
    var values = { name: npc.name, bio: notesForNpc(npc), gmnotes: gmNotesForNpc(npc) };
    if (created) values.inplayerjournals = '';
    character.set(values);
    if (!created) removeLegacyNpcAttributes(character.id);
    upsertAttribute(character.id, 'eraser_id', npc.id);
    upsertAttribute(character.id, 'pv', npc.currentHp, npc.totalHp);
    [['constitution', npc.constitution], ['force', npc.strength], ['dexterite', npc.dexterity], ['intelligence', npc.intelligence], ['sagesse', npc.wisdom], ['charisme', npc.charisma]]
      .forEach(function (entry) { upsertAttribute(character.id, entry[0], entry[1]); });
    var needs = imageNeeds(npc.id, npc.portraitUrl, npc.tokenUrl);
    return {
      character: character,
      meta: {
        characterId: character.id,
        eraserId: npc.id,
        portraitHash: needs.portraitHash,
        tokenHash: needs.tokenHash,
        needsAvatar: needs.needsAvatar,
        needsToken: needs.needsToken,
        created: created
      }
    };
  }

  // Personnage joueur : créé une fois, puis seuls le nom et les PV suivent Eraser.
  // Journaux, contrôle et dossier choisis par le MJ ne sont jamais touchés.
  function upsertPlayer(player) {
    var s = state.EraserBridge;
    var character = s.characters[player.id] && getObj('character', s.characters[player.id]);
    if (!character) character = characterWithEraserId(player.id);
    var created = false;
    if (!character) {
      character = createObj('character', { name: player.name, inplayerjournals: '', controlledby: '' });
      s.tokens[player.id] = false;
      s.portraits[player.id] = '';
      created = true;
    }
    s.characters[player.id] = character.id;
    character.set({ name: player.name });
    upsertAttribute(character.id, 'eraser_id', player.id);
    upsertAttribute(character.id, 'pv', player.currentHp, player.totalHp);
    var needs = imageNeeds(player.id, player.portraitUrl, player.tokenUrl);
    return {
      character: character,
      meta: { characterId: character.id, eraserId: player.id, portraitHash: needs.portraitHash, tokenHash: needs.tokenHash, needsAvatar: needs.needsAvatar, needsToken: needs.needsToken, created: created }
    };
  }

  function shopBio(shop) {
    var seller = shop.seller ? '<p><strong>Vendeur·euse :</strong> ' + html(shop.seller.name) + '</p>' : '';
    var items = (shop.items || []).map(function (item) {
      var detail = [item.price, item.description, item.effect].filter(Boolean).join(' — ');
      return '<li><strong>' + html(item.name) + '</strong>' + (detail ? ' — ' + html(detail) : '') + '</li>';
    }).join('');
    return seller + '<p>' + html(shop.cityName || '') + ' · ' + html(shop.size || '') + '</p><ul>' + items + '</ul>';
  }

  function upsertShop(shop) {
    var s = state.EraserBridge;
    var character = s.shops[shop.id] && getObj('character', s.shops[shop.id]);
    if (!character) {
      character = createObj('character', { name: 'Boutique — ' + shop.name, inplayerjournals: 'all', controlledby: '' });
      s.shops[shop.id] = character.id;
    }
    character.set({ name: 'Boutique — ' + shop.name, bio: shopBio(shop), gmnotes: '', inplayerjournals: 'all' });
    upsertAttribute(character.id, 'eraser_id', shop.id);
    var needs = imageNeeds(shop.id, shop.portraitUrl, shop.tokenUrl);
    return {
      character: character,
      meta: { characterId: character.id, eraserId: shop.id, portraitHash: needs.portraitHash, tokenHash: needs.tokenHash, needsAvatar: needs.needsAvatar, needsToken: needs.needsToken, bar: false }
    };
  }

  /* ---------- jeton par défaut ---------- */
  function scratchPageId() {
    var id = Campaign().get('playerpageid');
    if (id && getObj('page', id)) return id;
    var page = findObjs({ _type: 'page' })[0];
    return page ? page.id : '';
  }

  function parseToken(json) {
    if (!json) return null;
    try {
      var raw = typeof json === 'string' ? JSON.parse(json) : json;
      if (!raw || !raw.imgsrc) return null;
      var picked = {};
      TOKEN_KEYS.forEach(function (key) { if (raw[key] !== undefined && raw[key] !== null) picked[key] = raw[key]; });
      return picked;
    } catch (_e) { return null; }
  }

  // L'API ne peut écrire un jeton par défaut qu'à partir d'un graphic réel :
  // on le crée sur le calque MJ, on l'enregistre, on le supprime immédiatement.
  function writeDefaultToken(character, props) {
    if (typeof setDefaultTokenForCharacter !== 'function') throw new Error('Cette version de Roll20 ne fournit pas setDefaultTokenForCharacter.');
    var pageid = scratchPageId();
    if (!pageid) throw new Error('Aucune page Roll20 disponible pour préparer le jeton.');
    var graphic = createObj('graphic', Object.assign({}, props, { subtype: 'token', pageid: pageid, layer: 'gmlayer', left: 35, top: 35 }));
    if (!graphic) throw new Error('Roll20 a refusé l’image du jeton (elle doit venir de ta bibliothèque).');
    try { setDefaultTokenForCharacter(character, graphic); }
    finally { graphic.remove(); }
  }

  // options.image : image de bibliothèque à imposer (nouveau portrait)
  function syncDefaultToken(character, eraserId, options, done) {
    ensureState();
    options = options || {};
    var s = state.EraserBridge;
    character.get('_defaulttoken', function (json) {
      try {
        var existing = parseToken(json);
        // Un magasin n'a pas de PV : pas de barre liée.
        var withBar = options.bar !== false;
        var hp = withBar ? hpAttribute(character) : null;
        var name = character.get('name') || '';
        var initialize = !existing || !s.tokens[eraserId];
        // Le token rond d'Eraser passe avant l'avatar.
        var image = cleanImgsrc(options.image) || cleanImgsrc(s.tokenImages[eraserId]) || cleanImgsrc(character.get('avatar')) || (existing && cleanImgsrc(existing.imgsrc)) || cleanImgsrc(s.placeholder);
        if (!image) return done(null, { token: false, reason: 'aucune image dans ta bibliothèque Roll20 pour ce jeton' });

        var props;
        var changed = initialize;
        if (initialize) {
          props = {
            name: name,
            imgsrc: image,
            width: existing && existing.width || 70,
            height: existing && existing.height || 70,
            represents: character.id,
            // Réglages de départ (premier import uniquement) :
            // Nom affiché · Nom : Voir oui / Modifier oui
            // Barre 1 : Voir oui / Modifier oui / texte visible pour les éditeurs
            showname: true,
            showplayers_name: true,
            playersedit_name: true,
            showplayers_bar1: true,
            playersedit_bar1: true,
            bar1_num_permission: 'editors'
          };
          if (hp) { props.bar1_link = hp.id; props.bar1_value = String(hp.get('current')); props.bar1_max = String(hp.get('max')); }
        } else {
          props = existing;
          props.imgsrc = cleanImgsrc(props.imgsrc) || image;
          if (props.represents !== character.id) { props.represents = character.id; changed = true; }
          if (options.image && !sameImage(props.imgsrc, options.image)) { props.imgsrc = cleanImgsrc(options.image); changed = true; }
          // Nom : mis à jour seulement si le MJ ne l'a pas personnalisé.
          if (props.name !== name && (!props.name || props.name === s.names[eraserId])) { props.name = name; changed = true; }
          if (hp && !props.bar1_link) { props.bar1_link = hp.id; changed = true; }
          if (hp && props.bar1_link === hp.id) { props.bar1_value = String(hp.get('current')); props.bar1_max = String(hp.get('max')); }
        }

        if (changed) writeDefaultToken(character, props);
        s.tokens[eraserId] = true;
        s.names[eraserId] = props.name;
        done(null, { token: true, tokenUpdated: changed, initialized: initialize });
      } catch (error) { done(error); }
    });
  }

  /* ---------- portraits : capture de l'image déposée par l'extension ---------- */
  function armPortrait(payload) {
    ensureState();
    if (!getObj('character', payload.characterId)) throw new Error('Fiche Roll20 introuvable pour le portrait.');
    pendingPortrait = {
      characterId: payload.characterId,
      eraserId: payload.eraserId,
      hash: payload.hash || payload.portraitHash,
      role: payload.role === 'token' ? 'token' : 'avatar',
      tokenFollows: Boolean(payload.tokenFollows),
      bar: payload.bar !== false,
      doneId: payload.doneId,
      expires: Date.now() + PORTRAIT_WINDOW_MS
    };
    return { armed: true };
  }

  function claimGraphic(graphic) {
    if (!pendingPortrait) return;
    if (Date.now() > pendingPortrait.expires) { pendingPortrait = null; return; }
    if (graphic.get('represents')) return;
    var image = cleanImgsrc(graphic.get('imgsrc'));
    if (!image) return; // upload pas fini : on attendra change:graphic:imgsrc
    var job = pendingPortrait;
    pendingPortrait = null;
    setTimeout(function () { try { graphic.remove(); } catch (_e) { /* déjà supprimé */ } }, 0);

    var character = getObj('character', job.characterId);
    if (!character) return complete(job.doneId, new Error('Fiche disparue pendant l’upload.'));
    var s = state.EraserBridge;
    if (job.role === 'token') {
      // Le token rond devient l'image du jeton par défaut ; le portrait reste celui de la fiche.
      s.tokenImages[job.eraserId] = image;
      s.tokenHashes[job.eraserId] = job.hash;
      return syncDefaultToken(character, job.eraserId, { image: image, bar: job.bar }, function (error, result) {
        complete(job.doneId, error, Object.assign({ tokenImage: true }, result || {}));
      });
    }
    character.set('avatar', avatarFromImgsrc(image));
    s.portraits[job.eraserId] = job.hash;
    // Le token arrive juste après, ou existe déjà : le jeton ne prend pas l'avatar.
    if (job.tokenFollows || s.tokenImages[job.eraserId]) return complete(job.doneId, null, { avatar: true });
    syncDefaultToken(character, job.eraserId, { image: image, bar: job.bar }, function (error, result) {
      complete(job.doneId, error, Object.assign({ avatar: true }, result || {}));
    });
  }

  /* ---------- échanges avec l'extension ---------- */
  function acknowledge(syncId, metadata) {
    var suffix = metadata ? ':' + encode(metadata) : '';
    whisper('<span data-eraser-event="ack">ERASER_ACK:' + html(syncId || 'unknown') + suffix + '</span>');
  }
  function complete(syncId, error, metadata) {
    if (error) acknowledge(syncId, { error: error.message || String(error) });
    else acknowledge(syncId, metadata || {});
  }

  function importEntity(payload, done) {
    ensureState();
    if (payload.campaign) {
      if (state.EraserBridge.campaign && state.EraserBridge.campaign.id !== payload.campaign.id) throw new Error('Cette partie est déjà liée à une autre campagne Eraser. Utilise « Effacer les imports » avant de changer.');
      state.EraserBridge.campaign = payload.campaign;
    }
    if (payload.kind === 'shop') {
      var shop = upsertShop(payload.value);
      if (payload.folder) moveToFolder(shop.character.id, payload.folder);
      return done(null, shop.meta);
    }
    if (payload.kind === 'character') {
      // Les personnages joueurs restent toujours là où le MJ les a rangés.
      var player = upsertPlayer(payload.value);
      if (player.meta.needsAvatar || player.meta.needsToken) return done(null, player.meta);
      return syncDefaultToken(player.character, payload.value.id, {}, function (error, token) {
        if (error) return done(null, Object.assign(player.meta, { token: false, reason: error.message || String(error) }));
        done(null, Object.assign(player.meta, token));
      });
    }
    if (payload.kind !== 'npc') return done(null, {});
    var result = upsertNpc(payload.value);
    if (payload.folder) moveToFolder(result.character.id, payload.folder);
    // Le portrait doit d'abord arriver : le jeton sera construit à sa réception.
    if (result.meta.needsAvatar || result.meta.needsToken) return done(null, result.meta);
    syncDefaultToken(result.character, payload.value.id, {}, function (error, token) {
      if (error) return done(null, Object.assign(result.meta, { token: false, reason: error.message || String(error) }));
      done(null, Object.assign(result.meta, token));
    });
  }

  function rebuildToken(payload, done) {
    ensureState();
    var character = getObj('character', payload.characterId);
    if (!character) return done(new Error('Fiche Roll20 introuvable.'));
    syncDefaultToken(character, payload.eraserId || eraserIdForCharacter(character.id), { bar: payload.bar }, done);
  }

  function rebuildAllTokens() {
    ensureState();
    var s = state.EraserBridge;
    var ids = Object.keys(s.npcs).concat(Object.keys(s.characters));
    var ok = 0, skipped = [];
    (function next() {
      var eraserId = ids.shift();
      if (!eraserId) return whisper('Jetons par défaut vérifiés : ' + ok + ' OK' + (skipped.length ? '<br>Sans image : ' + skipped.map(html).join(', ') : ''));
      var character = getObj('character', s.npcs[eraserId] || s.characters[eraserId]);
      if (!character) return next();
      syncDefaultToken(character, eraserId, {}, function (error, result) {
        if (!error && result && result.token) ok += 1;
        else skipped.push(character.get('name'));
        next();
      });
    }());
  }

  function resetAllImports() {
    ensureState();
    var s = state.EraserBridge;
    var ids = Object.keys(s.npcs).map(function (id) { return s.npcs[id]; }).concat(Object.keys(s.shops).map(function (id) { return s.shops[id]; }));
    var removed = 0;
    ids.forEach(function (characterId) {
      findObjs({ _type: 'graphic', represents: characterId }).forEach(function (graphic) { graphic.remove(); });
      var character = getObj('character', characterId);
      if (character) { character.remove(); removed += 1; }
    });
    var placeholder = s.placeholder;
    state.EraserBridge = freshState();
    state.EraserBridge.placeholder = placeholder;
    pendingPortrait = null;
    return removed;
  }

  function menu() {
    ensureState();
    var s = state.EraserBridge;
    var linked = s.campaign ? html(s.campaign.name) : 'Aucune campagne liée';
    whisper('<div style="border:1px solid #6f5530;background:#f4ead6;padding:10px;border-radius:7px"><b>Eraser Bridge ' + VERSION + '</b><br><span style="font-size:11px">' + linked + '</span><hr>'
      + '<a href="!eraser-sync">Tout synchroniser</a><br>'
      + '<a href="!eraser-sync-session">Synchroniser une session</a><br>'
      + '<a href="!eraser-push-hp">Renvoyer les PV vers Eraser</a><br>'
      + '<a href="!eraser-tokens">Revérifier les jetons par défaut</a><br>'
      + '<a href="!eraser-placeholder">Image par défaut = jeton sélectionné</a>' + (s.placeholder ? ' ✓' : '') + '<br>'
      + '<a href="!eraser-reset-all reset-menu">Effacer les imports Eraser</a></div>');
  }

  function exportHp() {
    ensureState();
    var npcs = state.EraserBridge.npcs;
    var hitPoints = Object.keys(npcs).map(function (eraserId) {
      var hp = findObjs({ _type: 'attribute', _characterid: npcs[eraserId], name: 'pv' })[0];
      return hp ? { id: eraserId, currentHp: Number(hp.get('current')) || 0, totalHp: Number(hp.get('max')) || 0 } : null;
    }).filter(Boolean);
    whisper('<span data-eraser-event="hp">ERASER_HP:' + encode({ hitPoints: hitPoints }) + '</span>');
  }

  function argument(content, prefix) { return content.slice(prefix.length).trim(); }

  function handle(message) {
    if (message.type !== 'api' || !playerIsGM(message.playerid)) return;
    var content = message.content || '';
    if (content.indexOf('!eraser') !== 0) return;
    try {
      if (content === '!eraser' || content === '!eraser-status') return menu();
      if (content.indexOf('!eraser-ping ') === 0) return acknowledge(argument(content, '!eraser-ping '), { version: VERSION });
      if (content === '!eraser-sync') return whisper('<span data-eraser-event="sync">ERASER_SYNC_REQUEST</span>');
      if (content === '!eraser-sync-session') return whisper('<span data-eraser-event="sync-session">ERASER_SYNC_SESSION_REQUEST</span>');
      if (content === '!eraser-push-hp') return exportHp();
      if (content === '!eraser-tokens') return rebuildAllTokens();
      if (content === '!eraser-placeholder') {
        var selected = (message.selected || []).map(function (entry) { return getObj('graphic', entry._id); }).filter(Boolean)[0];
        var src = selected && cleanImgsrc(selected.get('imgsrc'));
        if (!src) return whisper('Sélectionne d’abord un jeton dont l’image vient de ta bibliothèque.');
        state.EraserBridge.placeholder = src;
        return whisper('Image par défaut enregistrée pour les PNJ sans portrait.');
      }
      if (content === '!eraser-reset') { state.EraserBridge = freshState(); return whisper('Liaison locale effacée.'); }
      if (content.indexOf('!eraser-reset-all ') === 0) return acknowledge(argument(content, '!eraser-reset-all ') || 'reset', { reset: true, removed: resetAllImports() });
      if (content.indexOf('!eraser-expect-portrait ') === 0) {
        var armPayload = decode(argument(content, '!eraser-expect-portrait '));
        return acknowledge(armPayload.syncId, armPortrait(armPayload));
      }
      if (content === '!eraser-cancel-portrait') { pendingPortrait = null; return; }
      if (content.indexOf('!eraser-token ') === 0) {
        var tokenPayload = decode(argument(content, '!eraser-token '));
        return rebuildToken(tokenPayload, function (error, result) { complete(tokenPayload.syncId, error, result); });
      }
      if (content.indexOf('!eraser-import ') === 0) {
        var direct = decode(argument(content, '!eraser-import '));
        return importEntity(direct, function (error, result) { complete(direct.syncId, error, result); });
      }
      if (content.indexOf('!eraser-chunk ') === 0) {
        var parts = content.split(/\s+/);
        var position = parts[2].split('/');
        var chunks = state.EraserBridge.chunks;
        chunks[parts[1]] = chunks[parts[1]] || { total: Number(position[1]), parts: [] };
        chunks[parts[1]].parts[Number(position[0])] = parts.slice(3).join('');
        return;
      }
      if (content.indexOf('!eraser-chunk-done ') === 0) {
        var doneId = argument(content, '!eraser-chunk-done ');
        var batch = state.EraserBridge.chunks[doneId];
        if (!batch || batch.parts.filter(Boolean).length !== batch.total) throw new Error('Import incomplet : un morceau de données manque.');
        var payload = decode(batch.parts.join(''));
        delete state.EraserBridge.chunks[doneId];
        return importEntity(payload, function (error, result) { complete(payload.syncId || doneId, error, result); });
      }
      if (content === '!eraser-import-done') return whisper('Synchronisation Eraser terminée. <b>!eraser</b> pour le menu.');
    } catch (error) {
      whisper('<b>Erreur :</b> ' + html(error.message || error));
    }
  }

  on('ready', function () {
    ensureState();
    on('chat:message', handle);
    on('add:graphic', function (graphic) { setTimeout(function () { claimGraphic(graphic); }, 50); });
    on('change:graphic:imgsrc', claimGraphic);
    // Filet de sécurité manuel : si le MJ pose lui-même un avatar sur une fiche Eraser,
    // le jeton par défaut suit automatiquement.
    on('change:character:avatar', function (character) {
      var eraserId = eraserIdForCharacter(character.id);
      var image = cleanImgsrc(character.get('avatar'));
      // Un token rond venu d'Eraser reste l'image du jeton.
      if (!eraserId || !image || state.EraserBridge.tokenImages[eraserId] || state.EraserBridge.shops[eraserId]) return;
      syncDefaultToken(character, eraserId, { image: image }, function (error) {
        if (error) whisper('Jeton de ' + html(character.get('name')) + ' : ' + html(error.message));
      });
    });
    log('Eraser Bridge ' + VERSION + ' prêt.');
  });

  return { menu: menu, version: VERSION };
}());
