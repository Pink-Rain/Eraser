import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les notifications d'objets reçus, sur un serveur partagé en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const fake = `${root}tests/fakes/shared-store.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^@\/lib\/(shared-store|identity-links|chat-accounts|google-sheets)$/, replacement: fake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); });
const shared = await vite.ssrLoadModule(fake);
const notifications = await vite.ssrLoadModule("/lib/item-notifications.ts");

beforeEach(() => shared.reset());

test("Une alerte relevée n'est effacée qu'une fois montrée", async () => {
  await notifications.notifyItemReceived({ uid: "mj-1", displayName: "Le MJ" }, { name: "Épée", quantity: 1, targetId: "PERSO-1", targetMode: "character", slotId: "CASE-1" });
  const [first] = await notifications.listItemNotifications("joueuse-1", "PERSO-1");
  assert.equal(first.itemName, "Épée");
  // La page qui l'a relevée s'est fermée avant de la montrer : l'alerte attend toujours.
  const again = await notifications.listItemNotifications("joueuse-1", "PERSO-1");
  assert.deepEqual(again.map((item) => item.id), [first.id]);
  await notifications.acknowledgeItemNotifications("joueuse-1", [first.id]);
  assert.deepEqual(await notifications.listItemNotifications("joueuse-1", "PERSO-1"), []);
});
