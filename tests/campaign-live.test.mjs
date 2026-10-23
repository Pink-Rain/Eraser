import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const live = await vite.ssrLoadModule("/lib/campaign-live.ts");
const roll20 = await vite.ssrLoadModule("/lib/roll20-url.ts");
const chat = await vite.ssrLoadModule("/lib/chat-time.ts");

const note = (patch = {}) => ({
  id: "N-1", campaignId: "CAM-1", sessionId: "S-1", private: false, characterId: "", type: "resume", title: "", text: "Le groupe arrive à Valmor.",
  moment: "", links: [], quest: null, authorName: "Compte", authorUid: "U-1", createdAt: "2026-10-23T18:00:00.000Z", updatedAt: "2026-10-23T18:00:00.000Z", ...patch,
});

test("une note publique de la campagne passe ; privée ou d'une autre campagne, non", () => {
  assert.equal(live.campaignLiveFromPayload({ campaignId: "CAM-1", message: { kind: "note", note: note() } })?.message.note.id, "N-1");
  assert.equal(live.campaignLiveFromPayload({ campaignId: "CAM-1", message: { kind: "note", note: note({ private: true }) } }), null);
  assert.equal(live.campaignLiveFromPayload({ campaignId: "CAM-1", message: { kind: "note", note: note({ campaignId: "CAM-2" }) } }), null);
  assert.equal(live.campaignLiveFromPayload({ campaignId: "CAM-1", message: { kind: "inconnu" } }), null);
  assert.deepEqual(live.campaignLiveFromPayload({ campaignId: "CAM-1", message: { kind: "session", sessionId: "S-2" } }), { campaignId: "CAM-1", message: { kind: "session", sessionId: "S-2" } });
});

test("une note reçue remplace l'ancienne, s'ajoute à sa place, et une copie plus vieille ne l'écrase pas", () => {
  const first = note();
  const later = note({ text: "Modifiée", updatedAt: "2026-10-23T18:05:00.000Z" });
  assert.equal(live.upsertSessionNote([first], later)[0].text, "Modifiée");
  assert.equal(live.upsertSessionNote([later], first)[0].text, "Modifiée");
  const earlier = note({ id: "N-0", createdAt: "2026-10-23T17:00:00.000Z" });
  assert.deepEqual(live.upsertSessionNote([first], earlier).map((entry) => entry.id), ["N-0", "N-1"]);
});

test("le lien Roll20 : https sur roll20.net seulement, vide pour l'effacer", () => {
  assert.equal(roll20.cleanRoll20Url(" https://app.roll20.net/join/123/abc "), "https://app.roll20.net/join/123/abc");
  assert.equal(roll20.cleanRoll20Url("app.roll20.net/campaigns/details/123"), "https://app.roll20.net/campaigns/details/123");
  assert.equal(roll20.cleanRoll20Url(""), "");
  for (const bad of ["http://app.roll20.net/join/1", "https://roll20.net.evil.com/x", "javascript:alert(1)", "https://example.com"]) {
    assert.throws(() => roll20.cleanRoll20Url(bad), /INVALID_ROLL20_URL/);
  }
});

test("le chat date ses messages en JJ/MM/AA", () => {
  const { date, time } = chat.chatMessageTime("2026-10-23T18:05:00.000Z");
  assert.match(date, /^\d{2}\/\d{2}\/\d{2}$/);
  assert.match(time, /^\d{2}:\d{2}$/);
  assert.deepEqual(chat.chatMessageTime("pas une date"), { time: "", date: "", title: "" });
});
