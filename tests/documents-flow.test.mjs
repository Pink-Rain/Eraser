import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Un document de plusieurs pages enregistré pour de vrai (lib/campaign-documents.ts, sur un Google
// Sheets en mémoire et des visuels en mémoire) : la colonne « Pages (JSON) » s'ajoute à une feuille
// d'avant, chaque page garde son fond, son rendu et son impression, et le PDF les met toutes.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-documents-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const mediaFake = `${root}tests/fakes/shared-media.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true, hmr: false }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: /^@\/lib\/google-drive$/, replacement: `${root}tests/fakes/objects-drive.ts` },
    { find: /^@\/lib\/shared-media$/, replacement: mediaFake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const shared = await vite.ssrLoadModule(mediaFake);
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");
const documents = await vite.ssrLoadModule("/lib/campaign-documents.ts");

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDqaKKK+ZPoT//Z", "base64");
const file = (name, type = "image/jpeg") => new File([jpeg], name, { type });
// La feuille telle que l'avaient les versions d'avant les pages (sans « Pages (JSON) »).
const oldHeaders = ["ID", "ID campagne", "ID session", "Titre", "Fond (JSON)", "Contenu (JSON)", "Version du rendu", "Créé par", "Créé le", "Modifié le", "Dossier", "Modèle"];
const content = (text) => ({ version: 1, height: 1000, zones: [{ id: `z-${text}`, paragraphs: [[{ text }]] }], lines: [], shapes: [], pictures: [], order: [] });

test("un document de trois pages : fonds, rendus et impressions de chaque page, PDF de trois pages", async () => {
  google.addSpreadsheet("docs", [{ title: "Documents", grid: [oldHeaders] }]);
  await jdr.saveJdrSheet({ key: "campaign_documents", spreadsheetId: "docs", name: "Documents de campagne", tabName: "Documents", webViewLink: "" });
  const pages = [
    { id: "p2", background: { kind: "upload" }, content: { ...content("Deux"), pictures: [{ id: "img", kind: "image", asset: "carte", x: 0, y: 0, width: 100, height: 100 }] } },
    { id: "p3", background: { kind: "builtin", key: "livre" }, content: content("Trois") },
  ];
  // Le fond importé d'une page nouvelle doit arriver avec elle.
  await assert.rejects(documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages }, {}, "mj"), /DOCUMENT_BACKGROUND_MISSING/);
  const saved = await documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages }, {
    render: file("r1.webp", "image/webp"), print: file("i1.jpg"),
    pageBackgrounds: new Map([["p2", file("fond.webp", "image/webp")], ["inconnue", file("x.webp", "image/webp")]]),
    pageRenders: new Map([[2, file("r2.webp", "image/webp")], [3, file("r3.webp", "image/webp")], [9, file("r9.webp", "image/webp")]]),
    pagePrints: new Map([[2, file("i2.jpg")], [3, file("i3.jpg")]]),
    pieces: new Map([["carte", file("carte.png", "image/png")], ["intrus", file("intrus.png", "image/png")]]),
  }, "mj");
  assert.deepEqual(saved.pages.map((page) => page.id), ["p2", "p3"]);
  assert.ok(saved.renderVersion);
  // La colonne des pages s'ajoute à droite de la feuille d'avant.
  const sheet = google.grid("docs", "Documents");
  assert.equal(sheet[0][12], "Pages (JSON)");
  assert.deepEqual(JSON.parse(sheet[1][12]).map((page) => page.id), ["p2", "p3"]);
  // Les images des pages qui existent, et seulement celles-là.
  const keys = [...shared.media.keys()].map((key) => key.replace("campaigns/CAMP/documents/lettre/", "")).sort();
  assert.deepEqual(keys, ["fond-p2", "impression", "impression-2", "impression-3", "piece-carte", "rendu", "rendu-2", "rendu-3"]);
  // Relu : les pages reviennent, et le PDF a une page par page.
  const read = await documents.getCampaignDocument("CAMP", "lettre");
  assert.deepEqual(read.pages, saved.pages);
  const pdf = Buffer.from(await documents.documentPdf("CAMP", "lettre", "Lettre", 3)).toString("latin1");
  assert.match(pdf, /\/Count 3/);
  assert.ok(await documents.readDocumentRender("CAMP", "lettre", 2));

  // Une version de l'éditeur qui ne connaît pas les pages (pas de `pages`) ne les efface pas ;
  // une page déjà enregistrée sur son fond importé n'a pas à le renvoyer.
  const kept = await documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre (2)", background: { kind: "builtin", key: "parchemin" }, content: content("Un bis") }, { render: file("r1.webp", "image/webp") }, "mj");
  assert.deepEqual(kept.pages.map((page) => page.id), ["p2", "p3"]);
  const reordered = await documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages: [pages[1], pages[0]] }, {}, "mj");
  assert.deepEqual(reordered.pages.map((page) => page.id), ["p3", "p2"]);
  // Revenue à une seule page : la case des pages se vide.
  const single = await documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages: [] }, {}, "mj");
  assert.deepEqual(single.pages, []);
  assert.equal(google.grid("docs", "Documents")[1][12] ?? "", "");
  // Une page retirée puis remise (une autre page, pour Eraser) renvoie son fond importé.
  await assert.rejects(documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages }, {}, "mj"), /DOCUMENT_BACKGROUND_MISSING/);
  await documents.saveCampaignDocument("CAMP", { id: "lettre", title: "Lettre", background: { kind: "builtin", key: "parchemin" }, content: content("Un"), pages }, { pageBackgrounds: new Map([["p2", file("fond.webp", "image/webp")]]) }, "mj");
  // Rangé sans être redessiné, il garde ses pages.
  const placed = await documents.updateCampaignDocumentPlace("CAMP", "lettre", { folder: "Courrier" });
  assert.deepEqual(placed.pages.map((page) => page.id), ["p2", "p3"]);
});
