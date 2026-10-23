import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les documents d'une campagne (page Document) : leur nettoyage, leur marque dans un inventaire,
// leur PDF, et le cadrage des tokens par défaut envoyés à Roll20.
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

test("les fonds fournis arrivent avec leurs zones prêtes à remplir", () => {
  for (const key of model.builtinBackgroundKeys) {
    const content = model.documentFromBuiltin(key);
    assert.equal(content.height, 1000);
    assert.ok(content.zones.length >= 2, key);
    assert.ok(content.zones.every((zone) => zone.paragraphs.length && zone.x >= 0 && zone.x + zone.width <= 1000), key);
  }
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
