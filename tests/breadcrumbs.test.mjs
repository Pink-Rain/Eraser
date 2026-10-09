import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { breadcrumbsFor, childrenOf, sectionsOf } = await vite.ssrLoadModule("/lib/breadcrumbs.ts");

const labels = (crumbs) => crumbs.map((crumb) => [crumb.label, crumb.href ?? null, crumb.path]);

test("Fil d'Ariane : chaque étape au-dessus de la page, avec son adresse (page ou dossier)", () => {
  const names = (id) => (id === "CAMP-1" ? "Les Cendres" : undefined);
  assert.deepEqual(breadcrumbsFor("/", names), []);
  assert.deepEqual(labels(breadcrumbsFor("/personnage/PER-1", names)), [["Personnages", null, "/personnage"]]);
  assert.deepEqual(labels(breadcrumbsFor("/campagne/CAMP-1/pnjs", names)), [["Campagnes", null, "/campagne"], ["Campagne - Les Cendres", "/campagne/CAMP-1", "/campagne/CAMP-1"]]);
  assert.deepEqual(breadcrumbsFor("/campagne/CAMP-1/magasin-et-fouille/sauvegardes", names).map((crumb) => crumb.label), ["Campagnes", "Campagne - Les Cendres", "Magasins"]);
  assert.deepEqual(labels(breadcrumbsFor("/regles/classes/CLA-1", names)), [["Règles", null, "/regles"], ["Classes", "/regles/classes", "/regles/classes"]]);
  assert.deepEqual(labels(breadcrumbsFor("/ressources/index-des-etats?x=1", names)), [["Index", "/ressources", "/ressources"]]);
  // Un identifiant brut n'est jamais affiché comme étape.
  assert.deepEqual(breadcrumbsFor("/reference/states/ETA-1", names).map((crumb) => crumb.label), ["Référence"]);
  assert.equal(breadcrumbsFor("/campagne/CAMP-9/pnjs", names)[1].label, "Campagne - …");
});

test("Contenu d'une étape, comme dans l'explorateur : les pages autorisées juste en dessous", () => {
  // Un joueur : ses personnages, sa campagne, les règles ; pas d'index.
  const targets = [
    { label: "Accueil", href: "/" },
    { label: "Classes", href: "/regles/classes" },
    { label: "Combat", href: "/regles/combat" },
    { label: "Campagne - Les Cendres", href: "/campagne/CAMP-1" },
    { label: "Andrea Le Barbu", href: "/personnage/PER-1" },
    { label: "Meerymah", href: "/personnage/PER-2" },
    { label: "Berserker", href: "/regles/classes/CLA-1" },
  ];
  assert.deepEqual(childrenOf("/personnage", targets).map((item) => item.label), ["Andrea Le Barbu", "Meerymah"]);
  assert.deepEqual(childrenOf("/regles", targets).map((item) => item.label), ["Classes", "Combat"]);
  assert.deepEqual(childrenOf("/regles/classes", targets).map((item) => item.label), ["Berserker"]);
  assert.deepEqual(childrenOf("/campagne", targets).map((item) => item.label), ["Les Cendres"]);
  assert.deepEqual(childrenOf("/personnage/PER-1", targets), []);
  const sections = sectionsOf(targets);
  assert.deepEqual(sections.map((section) => [section.label, section.href ?? null, section.children.length]), [["Règles", null, 2], ["Campagnes", null, 1], ["Personnages", null, 2]]);
});
