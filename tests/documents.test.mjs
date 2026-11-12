import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les documents d'une campagne (éditeur : extension Eraser Doc) : leur nettoyage (pages comprises), leur marque
// dans un inventaire, leurs destinataires, leur PDF, et le cadrage des tokens par défaut envoyés à Roll20.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, logLevel: "error" });
after(async () => { await vite.close(); });
const model = await vite.ssrLoadModule("/lib/document-model.ts");
const pdf = await vite.ssrLoadModule("/lib/document-pdf.ts");
const modifiers = await vite.ssrLoadModule("/lib/item-modifiers.ts");
const framing = await vite.ssrLoadModule("/lib/portrait-framing-shared.ts");
await vite.ssrLoadModule("/integrations/roll20/extension/token-art.js");

const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDqaKKK+ZPoT//Z", "base64"));

test("un document illisible ou hors bornes est ramené à un document sûr", () => {
  const content = model.cleanDocumentContent({ height: 99999, zones: [{ id: "<script>", x: "12", size: -4, font: "comic", align: "diagonal", color: "red", paragraphs: [[{ text: "Salut", bold: true, color: "#AABBCC" }, { text: " toi", bold: true, color: "#aabbcc" }], "pas une liste"] }, null] });
  assert.equal(content.height, 4000);
  assert.equal(content.zones.length, 1);
  const zone = content.zones[0];
  assert.notEqual(zone.id, "<script>");
  assert.equal(zone.x, 12);
  assert.equal(zone.size, 6);
  assert.equal(zone.font, "fell");
  assert.equal(zone.align, "left");
  assert.equal(zone.color, model.DEFAULT_INK);
  // Deux morceaux voisins de même style n'en font qu'un.
  assert.deepEqual(zone.paragraphs, [[{ text: "Salut toi", bold: true, color: "#aabbcc" }], []]);
  assert.deepEqual(model.cleanDocumentBackground({ kind: "url", url: "javascript:alert(1)" }), { kind: "builtin", key: "parchemin" });
  assert.deepEqual(model.cleanDocumentBackground({ kind: "builtin", key: "livre" }), { kind: "builtin", key: "livre" });
});

test("lignes, images, calques de dessin et modes de fusion sont gardés, l'ordre des calques complété", () => {
  const content = model.cleanDocumentContent({
    height: 1000,
    zones: [{ id: "z1", blend: "overlay", paragraphs: [[{ text: "Titre" }]] }, { id: "z2", blend: "inventé", paragraphs: [] }],
    lines: [{ id: "l1", x1: 10, y1: 20, x2: 900, y2: 20, width: 500, color: "#AA0000", style: "dotted", blend: "screen" }, { id: "l2", style: "zigzag" }],
    shapes: [{ id: "s1", shape: "star", fill: "linear", fillColor: "#FF0000", fillColor2: "#00ff00", fillOpacity2: 0, gradientAngle: 45, strokeWidth: 0, blend: "color" }, { id: "s2", shape: "hexagone", fill: "arc-en-ciel", strokeStyle: "dashed" }],
    pictures: [{ id: "p1", kind: "drawing", asset: "dessin-1", x: 0, y: 0, width: 1000, height: 1000, blend: "soft-light" }, { id: "p2", asset: "../../etc" }, { id: "p3", asset: "photo", blend: "addition" }],
    order: ["p1", "inconnu", "l1", "z1", "p1"],
  });
  assert.deepEqual([content.shapes[0].shape, content.shapes[0].fill, content.shapes[0].fillColor, content.shapes[0].fillOpacity2, content.shapes[0].gradientAngle, content.shapes[0].strokeWidth, content.shapes[0].blend], ["star", "linear", "#ff0000", 0, 45, 0, "color"]);
  assert.deepEqual([content.shapes[1].shape, content.shapes[1].fill, content.shapes[1].strokeStyle, content.shapes[1].blend], ["rectangle", "none", "dashed", "multiply"]);
  assert.equal(content.zones[0].blend, "overlay");
  assert.equal("blend" in content.zones[1], false);
  assert.deepEqual(content.lines[0], { id: "l1", x1: 10, y1: 20, x2: 900, y2: 20, width: 80, color: "#aa0000", style: "dotted", opacity: 1, blend: "screen" });
  assert.equal(content.lines[1].style, "solid");
  assert.equal(content.lines[1].blend, "multiply");
  assert.deepEqual(content.pictures.map((picture) => [picture.id, picture.kind, picture.asset, picture.blend]), [["p1", "drawing", "dessin-1", "soft-light"], ["p3", "image", "photo", "addition"]]);
  assert.deepEqual(content.order, ["p1", "l1", "z1", "z2", "l2", "s1", "s2", "p3"]);
  assert.deepEqual(model.documentAssets(content), ["dessin-1", "photo"]);
  // Un document d'avant (zones seules) garde l'ordre de ses zones.
  const old = model.cleanDocumentContent({ height: 1000, zones: [{ id: "a", paragraphs: [] }, { id: "b", paragraphs: [] }] });
  assert.deepEqual([old.lines, old.shapes, old.pictures, old.order], [[], [], [], ["a", "b"]]);
  assert.equal(model.cleanDocumentFolder("  Lettres   du roi  "), "Lettres du roi");
  assert.equal(model.documentPartUrl("c 1", "d1", "piece-p", "2026-11-10T12:00:00Z"), "/api/campaigns/c%201/documents/d1/image?part=piece-p&v=20261110T120000Z");
});

test("l'éditeur des documents est dans l'extension Eraser Doc, paramètres compris", () => {
  assert.equal(model.documentStudioHref("CAMP 1"), "/extension/doc/campagne/CAMP%201");
  assert.equal(model.documentStudioHref("c1", { document: "doc-2" }), "/extension/doc/campagne/c1?document=doc-2");
  assert.equal(model.documentStudioHref("c1", { nouveau: true, session: "s-3" }), "/extension/doc/campagne/c1?nouveau=1&session=s-3");
});

test("un document donné garde sa marque, même quand l'enclume réécrit l'exemplaire", () => {
  const marked = model.documentItemModifiers("CAMP-1", "doc-42");
  assert.deepEqual(model.documentOfItem(marked), { campaignId: "CAMP-1", documentId: "doc-42" });
  assert.equal(model.documentOfItem(""), null);
  assert.equal(model.documentOfItem('[{"target":"document","value":"../../etc"}]'), null);
  // L'enclume envoie ses liens sans la marque : elle est reprise de l'exemplaire.
  const rewritten = modifiers.keepItemCharges("", marked);
  assert.deepEqual(model.documentOfItem(rewritten), { campaignId: "CAMP-1", documentId: "doc-42" });
  assert.equal(modifiers.keepItemCharges("", ""), "");
});

test("le PDF d'un document : une page à l'image du JPEG, table des renvois juste", () => {
  assert.deepEqual(pdf.jpegSize(jpeg), { width: 6, height: 4, components: 3 });
  const bytes = pdf.pdfFromJpeg(jpeg, "Lettre du baron — été");
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/MediaBox \[0 0 595\.28 396\.85\]/);
  assert.match(text, /\/Width 6 \/Height 4 \/ColorSpace \/DeviceRGB/);
  // Chaque objet est bien à l'octet annoncé par la table « xref ».
  const start = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(start).startsWith("xref"));
  const offsets = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `objet ${index + 1}`));
  assert.throws(() => pdf.pdfFromJpeg(new Uint8Array([1, 2, 3]), "x"), /INVALID_JPEG/);
});

test("les pages après la première : chacune son fond et son contenu nettoyés, des identifiants uniques, 30 pages au plus", () => {
  const pages = model.cleanDocumentPages([
    { id: "p2", background: { kind: "builtin", key: "livre" }, content: { height: 800, zones: [{ id: "z1", paragraphs: [[{ text: "Suite" }]] }] } },
    { id: "p2", background: { kind: "url", url: "javascript:alert(1)" }, content: null },
    "pas une page",
    { id: "<script>", background: { kind: "upload" }, content: { height: 1000 } },
  ]);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages[0].background, { kind: "builtin", key: "livre" });
  assert.equal(pages[0].content.height, 800);
  assert.equal(pages[0].content.zones[0].paragraphs[0][0].text, "Suite");
  // Deux pages ne partagent jamais un identifiant, et un identifiant douteux est remplacé.
  assert.equal(new Set(pages.map((page) => page.id)).size, 3);
  assert.notEqual(pages[1].id, "p2");
  assert.match(pages[2].id, /^[\w-]+$/);
  assert.deepEqual(pages[1].background, { kind: "builtin", key: "parchemin" });
  assert.deepEqual(pages[2].background, { kind: "upload" });
  assert.deepEqual(model.cleanDocumentPages("rien"), []);
  assert.equal(model.cleanDocumentPages(Array.from({ length: 50 }, (_, index) => ({ id: `p${index}` }))).length, model.MAX_DOCUMENT_PAGES - 1);
  // Une page nettoyée l'est une fois pour toutes.
  assert.deepEqual(model.cleanDocumentPages(pages), pages);
  assert.equal(model.documentPageCount({ pages }), 4);
  assert.equal(model.documentPageCount({}), 1);
  // Les pièces de toutes les pages sont gardées avec le document.
  const first = model.cleanDocumentContent({ height: 1000, pictures: [{ id: "a", asset: "sceau" }] });
  const second = model.cleanDocumentPages([{ id: "p2", content: { height: 1000, pictures: [{ id: "b", asset: "carte" }, { id: "c", asset: "sceau" }] } }]);
  assert.deepEqual(model.documentAssets(first, second), ["sceau", "carte"]);
  assert.deepEqual(model.documentAssets(first), ["sceau"]);
  // Le rendu d'une page : la première garde son adresse d'avant.
  assert.equal(model.documentImageUrl("c1", "d1", "2026-11-11T10:00:00Z"), "/api/campaigns/c1/documents/d1/image?v=20261111T100000Z");
  assert.equal(model.documentImageUrl("c1", "d1", "2026-11-11T10:00:00Z", 3), "/api/campaigns/c1/documents/d1/image?v=20261111T100000Z&page=3");
  assert.equal(model.documentImageUrl("c1", "d1", "", 2), "/api/campaigns/c1/documents/d1/image?page=2");
  assert.equal(model.documentImageUrl("c1", "d1", "", 1), "/api/campaigns/c1/documents/d1/image");
  assert.equal(model.documentPartUrl("c1", "d1", "fond-p2", "v1"), "/api/campaigns/c1/documents/d1/image?part=fond-p2&v=v1");
});

test("« Donner à… » : les joueurs, puis les marchands (les magasins sauvegardés), puis les PNJ", () => {
  const players = [{ id: "c2", name: "Zélie", ownerUid: "u1" }, { id: "c1", name: "Arno" }];
  const npcs = [{ id: "n1", name: "Orla" }, { id: "n2", name: "Bertrand" }, { id: "n3", name: "  " }, { id: "n4", name: "Édouard" }];
  const shops = [{ id: "s1", name: "La Forge", npcId: "n2", cityName: "Brumeval" }, { id: "s2", name: "Bazar sans vendeur", npcId: "", cityName: "" }, { id: "s3", name: "  ", npcId: "inconnu", cityName: "Ost" }];
  const recipients = model.documentRecipients(players, npcs, shops);
  // Les joueurs gardent l'ordre de la campagne ; les magasins et les PNJ sont rangés par nom.
  assert.deepEqual(recipients.players, [{ id: "c2", name: "Zélie" }, { id: "c1", name: "Arno" }]);
  assert.deepEqual(recipients.merchants, [
    { id: "s2", name: "Bazar sans vendeur" },
    { id: "s1", name: "La Forge", detail: "Bertrand · Brumeval" },
    { id: "s3", name: "Magasin", detail: "Ost" },
  ]);
  // Un vendeur reste aussi un PNJ, à qui on peut donner le document directement.
  assert.deepEqual(recipients.npcs.map((npc) => npc.name), ["Bertrand", "Édouard", "Orla"]);
  assert.deepEqual(model.documentRecipients([], [], []), { players: [], merchants: [], npcs: [] });
});

test("un document en vente : une ligne de magasin à son prix, reconnue à l'achat", () => {
  const line = model.documentShopLine({ id: "lettre-1", title: "Lettre du baron" }, "  5   PO ", 2);
  assert.equal(line.id, "document:lettre-1");
  assert.equal(line.source, model.DOCUMENT_SHOP_SOURCE);
  assert.deepEqual([line.name, line.price, line.quantity, line.type, line.rarity], ["Lettre du baron", "5 PO", 2, model.DOCUMENT_ITEM_TYPE, "common"]);
  assert.equal(model.documentOfShopItem(line), "lettre-1");
  // Un item de l'index, même nommé comme un document, n'en est pas un.
  assert.equal(model.documentOfShopItem({ id: "document:lettre-1" }), null);
  assert.equal(model.documentOfShopItem({ id: "../etc", source: "document" }), null);
  assert.equal(model.documentShopLine({ id: "d", title: "" }, "", 500).quantity, 99);
  assert.equal(model.cleanDocumentPrice("2 PA\n5 PC"), "2 PA 5 PC");
  assert.equal(model.cleanDocumentPrice(42), "");
});

test("un document n'est dans le journal que de la session où le MJ l'a révélé", () => {
  assert.equal(model.documentInJournal({ sessionId: "s1", journal: "s1" }), true);
  assert.equal(model.documentInJournal({ sessionId: "s2", journal: "s1" }), false);
  assert.equal(model.documentInJournal({ sessionId: "", journal: "" }), false);
  assert.equal(model.documentInJournal({ sessionId: "s1" }), false);
});

test("le PDF d'un document de plusieurs pages : une page par JPEG, chacune à ses proportions", () => {
  const tall = Uint8Array.from(jpeg);
  // Le même JPEG, déclaré 6 × 12 (marqueur SOF) : une page deux fois plus haute que large.
  const sof = [...tall].findIndex((byte, index) => byte === 0xff && tall[index + 1] === 0xc0);
  tall[sof + 5] = 0; tall[sof + 6] = 12;
  const bytes = pdf.pdfFromJpegs([jpeg, tall, jpeg], "Grimoire");
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /\/Type \/Pages \/Kids \[3 0 R 6 0 R 9 0 R\] \/Count 3/);
  assert.deepEqual([...text.matchAll(/\/MediaBox \[0 0 595\.28 ([\d.]+)\]/g)].map((match) => match[1]), ["396.85", "1190.56", "396.85"]);
  const start = Number(/startxref\n(\d+)/.exec(text)[1]);
  const offsets = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
  assert.equal(offsets.length, 12);
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `objet ${index + 1}`));
  assert.match(text, /\/Size 13 \/Root 1 0 R \/Info 12 0 R/);
  assert.throws(() => pdf.pdfFromJpegs([], "x"), /INVALID_JPEG/);
});

test("relief et métal d'une zone : gardés s'ils sont choisis, réglages bornés ; sinon rien", () => {
  const [gold, flat, odd] = model.cleanDocumentContent({ height: 1000, zones: [
    { id: "titre", relief: "raised", reliefLight: -45, reliefDepth: 99, reliefSoftness: -3, reliefContrast: 0.8, metal: "gold", paragraphs: [[{ text: "Le Grimoire" }]] },
    { id: "texte", paragraphs: [] },
    { id: "bizarre", relief: "volcan", reliefDepth: 4, metal: "plomb", paragraphs: [] },
  ] }).zones;
  assert.deepEqual([gold.relief, gold.reliefLight, gold.reliefDepth, gold.reliefSoftness, gold.reliefContrast, gold.metal], ["raised", 315, 30, 0, 0.8, "gold"]);
  for (const zone of [flat, odd]) for (const key of ["relief", "reliefLight", "reliefDepth", "reliefSoftness", "reliefContrast", "metal"]) assert.equal(key in zone, false, key);
  assert.equal(model.cleanDocumentZone({ id: "z", relief: "engraved", paragraphs: [] }, 1000).reliefLight, 315);
  assert.deepEqual([...model.documentReliefs], ["raised", "engraved"]);
  assert.deepEqual([...model.documentMetals], ["gold", "silver", "bronze", "copper"]);
});

test("couverture et image de fin : le rôle d'une page est gardé, et lu page par page", () => {
  const cover = model.cleanDocumentContent({ height: 1000, role: "cover" });
  assert.equal(cover.role, "cover");
  assert.equal("role" in model.cleanDocumentContent({ height: 1000, role: "préface" }), false);
  const pages = model.cleanDocumentPages([{ id: "p2", content: { height: 1000 } }, { id: "p3", content: { height: 1000, role: "end" } }]);
  assert.deepEqual(model.documentPageRolesOf({ content: cover, pages }), ["cover", "", "end"]);
  assert.deepEqual(model.documentPageRolesOf({ content: model.cleanDocumentContent({}) }), [""]);
});

test("un fond de la bibliothèque et ses mots-clés", () => {
  assert.deepEqual(model.cleanDocumentBackground({ kind: "library", id: "fond-1" }), { kind: "library", id: "fond-1" });
  assert.deepEqual(model.cleanDocumentBackground({ kind: "library", id: "../x" }), { kind: "builtin", key: "parchemin" });
  assert.deepEqual(model.cleanBackgroundKeywords(["  Couverture ", "couverture", "Fin", "", 3, "Très   ancien"]), ["Couverture", "Fin", "Très ancien"]);
  assert.equal(model.cleanBackgroundKeywords(Array.from({ length: 30 }, (_, index) => `mot ${index}`)).length, 12);
  assert.equal(model.keywordKey(" COUVERTURE "), model.keywordKey(model.COVER_KEYWORD));
  assert.equal(model.keywordKey("Énigme"), "enigme");
  assert.equal(model.documentLibraryImageUrl("fond-1"), "/api/documents/fonds/fond-1/image");
});

test("le token par défaut du compagnon Roll20 reprend le cadrage enregistré dans Eraser", () => {
  const art = globalThis.EraserTokenArt;
  const image = { naturalWidth: 800, naturalHeight: 1200 };
  const placement = { x: 230, y: 300, width: 620 };
  // Le cadrage ne dépend pas du cadre : retrouvé dans un cercle de 172 px (Sceau du Liche).
  const saved = framing.framingFromPlacement(placement, 1200 / 800, art.SIZE, 172);
  const back = art.framedPlacement(image, saved, 172);
  assert.ok(Math.abs(back.x - placement.x) < 0.01 && Math.abs(back.y - placement.y) < 0.01 && Math.abs(back.width - placement.width) < 0.01, JSON.stringify(back));
  // Sans cadrage : l'avatar couvre le cercle, comme avant.
  assert.deepEqual(art.framedPlacement(image, null, 172), art.coverPlacement(image, 172));
  assert.equal(typeof art.renderFramedToken, "function");
});
