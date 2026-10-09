import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { breadcrumbsFor } = await vite.ssrLoadModule("/lib/breadcrumbs.ts");

test("Fil d'Ariane : les pages au-dessus de celle affichée, cliquables quand elles existent", () => {
  const names = (id) => (id === "CAMP-1" ? "Les Cendres" : undefined);
  assert.deepEqual(breadcrumbsFor("/", names), []);
  assert.deepEqual(breadcrumbsFor("/personnage/PER-1", names), [{ label: "Personnages" }]);
  assert.deepEqual(breadcrumbsFor("/campagne/CAMP-1/pnjs", names), [{ label: "Campagnes", href: "/campagne" }, { label: "Campagne - Les Cendres", href: "/campagne/CAMP-1" }]);
  assert.deepEqual(breadcrumbsFor("/campagne/CAMP-1/magasin-et-fouille/sauvegardes", names).map((crumb) => crumb.label), ["Campagnes", "Campagne - Les Cendres", "Magasins"]);
  assert.deepEqual(breadcrumbsFor("/regles/classes/CLA-1", names), [{ label: "Règles" }, { label: "Classes", href: "/regles/classes" }]);
  assert.deepEqual(breadcrumbsFor("/ressources/index-des-etats?x=1", names), [{ label: "Index", href: "/ressources" }]);
  // Un identifiant brut n'est jamais affiché comme étape.
  assert.deepEqual(breadcrumbsFor("/reference/states/ETA-1", names), [{ label: "Référence" }]);
  assert.equal(breadcrumbsFor("/campagne/CAMP-9/pnjs", names)[1].label, "Campagne - …");
});
