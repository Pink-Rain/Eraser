import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"

function roll20Runtime(source) {
  const handlers = {}
  const objects = new Map()
  const chatMessages = []
  const campaign = { playerpageid: "page-1", journalfolder: "[]" }
  let sequence = 0
  const createObj = (type, initial) => {
    const id = `${type}-${++sequence}`
    const values = { ...initial }
    const object = { id, get: (key, callback) => { const value = values[key]; if (callback) callback(value); return value }, set: (key, value) => typeof key === "string" ? (values[key] = value) : Object.assign(values, key), remove: () => objects.delete(id), values, type }
    objects.set(id, object)
    return object
  }
  const context = {
    state: {}, console, log() {}, sendChat: (_speaker, message) => chatMessages.push(message), playerIsGM: () => true,
    on: (event, callback) => { handlers[event] = callback }, createObj,
    getObj: (type, id) => objects.get(id)?.type === type ? objects.get(id) : null,
    findObjs: (query) => [...objects.values()].filter((object) => object.type === query._type && Object.entries(query).every(([key, value]) => key === "_type" || object.values[key.replace(/^_/, "")] === value)),
    Campaign: () => ({ get: (key) => campaign[key], set: (key, value) => { campaign[key] = value } }), setDefaultTokenForCharacter() {},
    decodeURIComponent, encodeURIComponent, parseInt, isNaN, JSON, Object, String, Number, Error, setTimeout: (callback) => callback(), Date,
  }
  vm.createContext(context)
  vm.runInContext(source, context)
  handlers.ready()
  return { handlers, objects, chatMessages, campaign }
}

function encodePayload(value) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url") }

test("Roll20 bridge 0.7.0 syncs schema-2 NPC fields without duplicates", async () => {
  const source = await readFile(new URL("../integrations/roll20/eraser-bridge.mod.js", import.meta.url), "utf8")
  const { handlers, objects, chatMessages } = roll20Runtime(source)
  const npc = {
    id: "npc-1", name: "Saren", portraitUrl: "", currentHp: 12, totalHp: 20,
    constitution: 31, strength: 32, dexterity: 33, intelligence: 34, wisdom: 35, charisma: 36,
    playerNotes: "Visible par les joueurs", gmNotes: "Secret MJ",
    inventory: [{ id: "item-1", name: "Potion", quantity: 2, notes: "Rouge" }],
  }
  const sendNpc = (syncId) => handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-import ${encodePayload({ campaign: { id: "camp-1", name: "Test" }, kind: "npc", value: npc, syncId })}` })
  sendNpc("sync-1")
  const character = [...objects.values()].find((object) => object.type === "character")
  assert.ok(character)
  assert.equal(character.values.inplayerjournals, "")
  assert.match(character.values.bio, /Visible par les joueurs/)
  assert.match(character.values.bio, /Potion/)
  assert.doesNotMatch(character.values.bio, /Secret MJ/)
  assert.match(character.values.gmnotes, /Secret MJ/)

  const attributes = () => [...objects.values()].filter((object) => object.type === "attribute" && object.values.characterid === character.id)
  assert.deepEqual(new Set(attributes().map((attribute) => attribute.values.name)), new Set(["eraser_id", "pv", "constitution", "force", "dexterite", "intelligence", "sagesse", "charisme"]))
  assert.equal(attributes().find((attribute) => attribute.values.name === "pv").values.max, "20")

  for (const name of ["rapidite", "combat", "tir", "magie", "force_mentale"]) {
    const legacy = { characterid: character.id, name, current: "99" }
    const id = `attribute-legacy-${name}`
    objects.set(id, { id, type: "attribute", values: legacy, get: (key) => legacy[key], set: (patch) => Object.assign(legacy, patch), remove: () => objects.delete(id) })
  }
  character.set({ inplayerjournals: "player-custom", controlledby: "player-1" })
  sendNpc("sync-2")
  assert.equal([...objects.values()].filter((object) => object.type === "character").length, 1)
  assert.equal(character.values.inplayerjournals, "player-custom")
  assert.equal(character.values.controlledby, "player-1")
  assert.equal(attributes().some((attribute) => ["rapidite", "combat", "tir", "magie", "force_mentale"].includes(attribute.values.name)), false)

  handlers["chat:message"]({ type: "api", playerid: "gm", content: "!eraser-push-hp" })
  const hpMessage = chatMessages.find((message) => message.includes("ERASER_HP:"))
  const hpPayload = JSON.parse(Buffer.from(hpMessage.match(/ERASER_HP:([A-Za-z0-9_-]+)/)[1], "base64url").toString("utf8"))
  assert.deepEqual(hpPayload.hitPoints, [{ id: "npc-1", currentHp: 12, totalHp: 20 }])
  assert.equal(chatMessages.some((message) => message.includes("Erreur")), false)
})

test("public Roll20 Mod is identical and companion enforces schema 2", async () => {
  const [source, publicSource, content, manifest] = await Promise.all([
    readFile(new URL("../integrations/roll20/eraser-bridge.mod.js", import.meta.url), "utf8"),
    readFile(new URL("../public/roll20/eraser-bridge.mod.js", import.meta.url), "utf8"),
    readFile(new URL("../integrations/roll20/extension/content.js", import.meta.url), "utf8"),
    readFile(new URL("../integrations/roll20/extension/manifest.json", import.meta.url), "utf8"),
  ])
  assert.equal(publicSource, source)
  assert.match(source, /VERSION = '0\.7\.0'/)
  assert.match(content, /payload\?\.schema !== 2/)
  assert.equal(JSON.parse(manifest).version, "0.7.0")
})

test("Roll20 bridge offers session sync from its menu", async () => {
  const source = await readFile(new URL("../integrations/roll20/eraser-bridge.mod.js", import.meta.url), "utf8")
  const { handlers, chatMessages } = roll20Runtime(source)
  handlers["chat:message"]({ type: "api", playerid: "gm", content: "!eraser" })
  assert.match(chatMessages.at(-1), /!eraser-sync-session/)
  handlers["chat:message"]({ type: "api", playerid: "gm", content: "!eraser-sync-session" })
  assert.match(chatMessages.at(-1), /ERASER_SYNC_SESSION_REQUEST/)
  assert.doesNotMatch(chatMessages.at(-1), /ERASER_SYNC_REQUEST/)
})

test("Roll20 bridge files session NPCs in a folder and leaves player sheets alone", async () => {
  const source = await readFile(new URL("../integrations/roll20/eraser-bridge.mod.js", import.meta.url), "utf8")
  const { handlers, objects, chatMessages, campaign } = roll20Runtime(source)
  const send = (payload) => handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-import ${encodePayload(payload)}` })
  const npc = { id: "npc-9", name: "Garde", portraitUrl: "", tokenUrl: "", currentHp: 5, totalHp: 5, constitution: 1, strength: 1, dexterity: 1, intelligence: 1, wisdom: 1, charisma: 1, playerNotes: "", gmNotes: "", inventory: [] }

  // Un PNJ déjà rangé ailleurs est déplacé dans le dossier de la session.
  send({ campaign: { id: "camp-1", name: "Test" }, kind: "npc", value: npc, syncId: "a" })
  const npcSheet = [...objects.values()].find((object) => object.type === "character" && object.values.name === "Garde")
  campaign.journalfolder = JSON.stringify([{ n: "Ancien dossier", i: [npcSheet.id], id: "old" }])
  send({ campaign: { id: "camp-1", name: "Test" }, kind: "npc", value: npc, folder: "1 - Le renouveau", syncId: "b" })
  const tree = JSON.parse(campaign.journalfolder)
  assert.deepEqual(tree.find((node) => node.n === "Ancien dossier").i, [])
  assert.deepEqual(tree.find((node) => node.n === "1 - Le renouveau").i, [npcSheet.id])

  // Un joueur : créé une fois, jamais déplacé, réglages du MJ conservés.
  const player = { id: "char-1", name: "Aelis", portraitUrl: "", tokenUrl: "https://example.test/token?v=1", currentHp: 8, totalHp: 12 }
  send({ campaign: { id: "camp-1", name: "Test" }, kind: "character", value: player, folder: "1 - Le renouveau", syncId: "c" })
  const playerSheet = [...objects.values()].find((object) => object.type === "character" && object.values.name === "Aelis")
  assert.ok(playerSheet)
  assert.equal(JSON.stringify(JSON.parse(campaign.journalfolder)).includes(playerSheet.id), false)
  playerSheet.set({ controlledby: "player-7", inplayerjournals: "player-7" })
  send({ campaign: { id: "camp-1", name: "Test" }, kind: "character", value: { ...player, name: "Aelis la Rôdeuse" }, syncId: "d" })
  assert.equal([...objects.values()].filter((object) => object.type === "character" && object.values.controlledby === "player-7").length, 1)
  assert.equal(playerSheet.values.controlledby, "player-7")
  assert.equal(playerSheet.values.inplayerjournals, "player-7")
  assert.equal(playerSheet.values.name, "Aelis la Rôdeuse")
  const acknowledgement = chatMessages.filter((message) => message.includes("ERASER_ACK:d:")).at(-1)
  const meta = JSON.parse(Buffer.from(acknowledgement.match(/ERASER_ACK:d:([A-Za-z0-9_-]+)/)[1], "base64url").toString("utf8"))
  assert.equal(meta.needsToken, true)
  assert.equal(chatMessages.some((message) => message.includes("Erreur")), false)
})
