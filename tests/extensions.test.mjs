import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { createServer } from "vite";

import { packExtension } from "../scripts/pack-extension.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
const extensions = await vite.ssrLoadModule("/lib/extensions.ts");
const install = await vite.ssrLoadModule("/lib/extensions-install.ts");

// Un faux GitHub : les Releases de chaque dépôt et les fichiers qu'elles joignent.
const releases = new Map();
const assets = new Map();
const github = createHttpServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const match = /^\/repos\/(.+)\/releases$/.exec(url.pathname);
  if (match) {
    const list = releases.get(decodeURIComponent(match[1]));
    if (!list) { response.writeHead(404).end("{}"); return; }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(list));
    return;
  }
  const asset = assets.get(url.pathname);
  if (!asset) { response.writeHead(404).end(); return; }
  response.writeHead(200).end(asset);
});
await new Promise((resolve) => github.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${github.address().port}`;
const directory = await mkdtemp(join(tmpdir(), "eraser-extensions-"));
process.env.ERASER_EXTENSIONS_DIR = directory;
process.env.ERASER_EXTENSIONS_RELEASES_URL = `${base}/repos/{repo}/releases`;

after(async () => {
  await vite.close();
  github.close();
  await rm(directory, { recursive: true, force: true });
});

const map = { id: "map", name: "Eraser Map", description: "", repository: "Pink-Rain/Eraser_map" };
const serverModule = "export default { async fetch(request, eraser) { return new Response(`${eraser.extension.version} ${eraser.account.uid} ${eraser.path.join('/')} ${new URL(request.url).search}`) } }";

/** Publie une version dans le faux GitHub (la plus récente en tête, comme GitHub). */
function publish(repository, version, { api = 1, id = "map", corruptPack = false, files: extra = {} } = {}) {
  const files = new Map(Object.entries({
    "main.js": `export function mount(element) { element.textContent = "${version}" }`,
    "main.css": ".x{}",
    "server.mjs": serverModule,
    "chunks/part.js": "export const part = 1",
    ...extra,
  }).map(([path, content]) => [path, Buffer.from(content)]));
  const { manifest, pack } = packExtension({ id, version, api, entry: "main.js", styles: ["main.css"], server: "server.mjs", files });
  const prefix = `/download/${repository}/${version}`;
  assets.set(`${prefix}/eraser-extension.json`, Buffer.from(JSON.stringify(manifest)));
  assets.set(`${prefix}/eraser-extension.pack.gz`, corruptPack ? Buffer.concat([pack, Buffer.from("!")]) : pack);
  const list = releases.get(repository) ?? [];
  list.unshift({ tag_name: `v${version}`, draft: false, assets: ["eraser-extension.json", "eraser-extension.pack.gz"].map((name) => ({ name, browser_download_url: `${base}${prefix}/${name}` })) });
  releases.set(repository, list);
  return manifest;
}

test("les extensions liées : identifiants stables, dépôts du propriétaire", () => {
  assert.deepEqual(extensions.linkedExtensions.map((entry) => [entry.id, entry.repository]), [
    ["doc", "Pink-Rain/Eraser_doc"],
    ["map", "Pink-Rain/Eraser_map"],
    ["page", "Pink-Rain/Eraser_page"],
  ]);
  assert.equal(extensions.linkedExtension("map")?.name, "Eraser Map");
  assert.equal(extensions.linkedExtension("autre"), null);
});

test("qui ouvre une extension : réglé dans le code, selon la vue ; un admin ouvre tout", () => {
  assert.deepEqual(extensions.linkedExtensions.map((entry) => [entry.id, entry.openTo]), [["doc", ["mj", "admin"]], ["map", ["joueur", "mj", "admin"]], ["page", ["admin"]]]);
  // Un MJ qui regarde « en joueur » voit ce que voit un joueur.
  assert.equal(extensions.extensionOpenFor("map", { role: "joueur", accountRole: "mj" }), true);
  assert.equal(extensions.extensionOpenFor("doc", { role: "joueur", accountRole: "mj" }), false);
  assert.equal(extensions.extensionOpenFor("page", { role: "mj", accountRole: "mj" }), false);
  assert.equal(extensions.extensionOpenFor("page", { role: "joueur", accountRole: "admin" }), true);
  assert.equal(extensions.extensionOpenFor("autre", { role: "admin", accountRole: "admin" }), true);
});

test("versions et chemins : préversions avant la version finale, rien hors du dossier", () => {
  assert.equal(extensions.compareVersions("0.1.0", "0.1.1"), -1);
  assert.equal(extensions.compareVersions("1.0.0-alpha.3", "1.0.0"), -1);
  assert.equal(extensions.compareVersions("1.0.0-alpha.10", "1.0.0-alpha.9"), 1);
  assert.equal(extensions.compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(extensions.safeExtensionPath("assets/carte.png"), "assets/carte.png");
  for (const bad of ["../x.js", "a/../../x.js", "/etc/passwd", "C:/x.js", "a\\b.js", "a//b.js", "./a.js", ""]) assert.equal(extensions.safeExtensionPath(bad), null, bad);
});

test("le manifeste : complet, ou refusé", () => {
  const good = { id: "map", version: "0.1.0", api: 1, entry: "main.js", styles: ["main.css"], server: "server.mjs", pack: "eraser-extension.pack.gz", sha256: "a".repeat(64) };
  assert.deepEqual(extensions.parseExtensionManifest(good), good);
  assert.equal(extensions.parseExtensionManifest({ ...good, version: "v0.1.0" })?.version, "0.1.0");
  assert.equal(extensions.parseExtensionManifest({ ...good, server: undefined })?.server, null);
  assert.equal(extensions.parseExtensionManifest({ ...good, pack: undefined })?.pack, "eraser-extension.pack.gz");
  for (const patch of [{ entry: "../main.js" }, { styles: ["/x.css"] }, { server: "../s.mjs" }, { sha256: "abc" }, { id: "Map!" }, { api: 0 }, { version: "un" }, { pack: "../p.gz" }]) {
    assert.equal(extensions.parseExtensionManifest({ ...good, ...patch }), null, JSON.stringify(patch));
  }
});

test("le paquet : fabriqué par scripts/pack-extension.mjs, relu à l'identique, refusé s'il sort de son dossier", () => {
  const files = new Map([["main.js", Buffer.from("a")], ["img/x.png", Buffer.from([0, 1, 2, 255])]]);
  const { manifest, pack } = packExtension({ id: "doc", version: "1.2.3", api: 1, entry: "main.js", files });
  assert.equal(manifest.pack, "eraser-extension.pack.gz");
  assert.equal(manifest.server, null);
  const read = install.parseExtensionPack(gunzipSync(pack).toString("utf8"));
  assert.deepEqual([...read.keys()].sort(), ["img/x.png", "main.js"]);
  assert.deepEqual([...read.get("img/x.png")], [0, 1, 2, 255]);
  assert.equal(install.parseExtensionPack(JSON.stringify({ format: "eraser-extension-pack", files: { "../evil.js": "" } })), null);
  assert.equal(install.parseExtensionPack(JSON.stringify({ format: "autre", files: { "main.js": "" } })), null);
  assert.throws(() => packExtension({ id: "doc", version: "1.2.3", api: 1, entry: "absent.js", files }), /absent\.js/);
});

test("un dépôt sans version publiée, un dépôt introuvable : rien n'est installé", async () => {
  releases.set("Pink-Rain/Eraser_map", []);
  let check = await install.updateExtension(map, { force: true });
  assert.equal(check.published.status, "none");
  assert.equal(check.installed, null);
  const doc = { id: "doc", name: "Eraser Doc", description: "", repository: "Pink-Rain/Inconnu" };
  check = await install.updateExtension(doc, { force: true });
  assert.equal(check.published.status, "unreachable");
  assert.match(check.published.error, /introuvable/);
  assert.equal(await install.readInstalledExtension("doc"), null);
});

test("installation, mise à jour, garde de la version précédente, refus d'un paquet altéré ou trop récent", async () => {
  publish("Pink-Rain/Eraser_map", "0.1.0");
  let check = await install.updateExtension(map, { force: true });
  assert.equal(check.error, null);
  assert.equal(check.installed?.version, "0.1.0");
  const installed = await install.readInstalledExtension("map");
  assert.equal(installed.entry, "main.js");
  assert.deepEqual(installed.styles, ["main.css"]);
  assert.ok(await install.extensionFile("map", "0.1.0", "chunks/part.js"));
  assert.equal(await install.extensionFile("map", "0.1.0", "../current.json"), null);
  assert.equal(await install.extensionFile("map", "..", "map/current.json"), null);

  // Déjà à jour : rien n'est retéléchargé.
  check = await install.updateExtension(map, { force: true });
  assert.equal(check.installed?.version, "0.1.0");

  publish("Pink-Rain/Eraser_map", "0.2.0");
  check = await install.updateExtension(map, { force: true });
  assert.equal(check.installed?.version, "0.2.0");
  publish("Pink-Rain/Eraser_map", "0.3.0");
  await install.updateExtension(map, { force: true });
  // La version servie et la précédente restent (une page ouverte avant la mise à jour) ; les autres partent.
  assert.deepEqual((await readdir(join(directory, "map"))).filter((name) => !name.endsWith(".json")).sort(), ["0.2.0", "0.3.0"]);

  publish("Pink-Rain/Eraser_map", "0.4.0", { corruptPack: true });
  check = await install.updateExtension(map, { force: true });
  assert.match(check.error, /empreinte/);
  assert.equal((await install.readInstalledExtension("map")).version, "0.3.0");

  publish("Pink-Rain/Eraser_map", "0.5.0", { api: 99 });
  check = await install.updateExtension(map, { force: true });
  assert.equal(check.needsNewerEraser, true);
  assert.equal((await install.readInstalledExtension("map")).version, "0.3.0");

  publish("Pink-Rain/Eraser_map", "0.6.0", { id: "doc" });
  check = await install.updateExtension(map, { force: true });
  assert.equal(check.published.status, "invalid");
  assert.equal((await install.readInstalledExtension("map")).version, "0.3.0");
});

test("la partie serveur d'une extension répond avec ce qu'Eraser lui prête", async () => {
  const installed = await install.readInstalledExtension("map");
  const response = await install.runExtensionServer(installed, new Request("http://127.0.0.1/api/extensions/map/serveur/a/b?x=1"), {
    extension: { id: "map", version: installed.version },
    account: { uid: "u1" },
    path: ["a", "b"],
  });
  assert.equal(await response.text(), "0.3.0 u1 a/b ?x=1");
  const withoutServer = await install.runExtensionServer({ ...installed, server: null }, new Request("http://127.0.0.1/"), {});
  assert.equal(withoutServer.status, 404);
});

test("versions installées gardées en mémoire pour la coque, à jour après chaque installation", async () => {
  // Premier appel : la lecture du disque part en arrière-plan.
  install.knownInstalledVersions();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(install.knownInstalledVersions(), [{ id: "map", version: "0.3.0" }]);
  publish("Pink-Rain/Eraser_map", "0.7.0");
  await install.updateExtension(map, { force: true });
  assert.deepEqual(install.knownInstalledVersions(), [{ id: "map", version: "0.7.0" }]);
});

test("« Chercher les mises à jour » relit GitHub une fois par minute au plus", async () => {
  // GitHub vient d'être lu (test précédent) : une version publiée juste après attend la minute.
  publish("Pink-Rain/Eraser_map", "0.8.0");
  let check = await install.updateExtension(map, { force: true, forceFloorMs: 60_000 });
  assert.equal(check.installed?.version, "0.7.0");
  // L'admin (« Vérifier les mises à jour ») relit tout de suite.
  check = await install.updateExtension(map, { force: true });
  assert.equal(check.installed?.version, "0.8.0");
});

test("ce qu'Eraser prête aux extensions se charge dans le navigateur : aucun code du serveur", async () => {
  const { readFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const resolveFile = (base) => [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => existsSync(join(root, candidate)));
  const server = /^(lib\/(shared-store|google-sheets|server-auth|site-auth|accounts-remote|custom-pages-store|page-folders-store|app-menu-store|custom-pages-server|extensions-install|extensions-sync|extensions-store)\.ts|db\/|desktop\/)/;
  const lending = await readFile(join(root, "components/eraser/extension-modules.ts"), "utf8");
  const lent = [...lending.matchAll(/^import \* as \w+ from "@\/([^"]+)"/gm)].map((match) => match[1]);
  assert.ok(lent.includes("lib/custom-pages") && lent.includes("components/ui/button"));
  for (const id of lent) {
    const start = resolveFile(id);
    assert.ok(start, id);
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const file = stack.pop();
      const source = await readFile(join(root, file), "utf8");
      // Une instruction par import (le code n'a pas de points-virgules) ; les imports de types
      // disparaissent à la compilation : seuls les autres comptent.
      const statements = source.split(/\n(?=(?:import|export)\b)/).filter((chunk) => /^(?:import|export)\b/.test(chunk) && !/^(?:import|export)\s+type\b/.test(chunk));
      for (const statement of statements) {
        const match = /from\s+"@\/([^"]+)"/.exec(statement);
        if (!match) continue;
        const next = resolveFile(match[1]);
        if (!next || seen.has(next)) continue;
        assert.ok(!server.test(next), `${id} tire ${next}, du code du serveur`);
        seen.add(next);
        stack.push(next);
      }
    }
  }
});
