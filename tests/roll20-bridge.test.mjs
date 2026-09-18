import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"

test("Roll20 bridge creates and updates one Eraser NPC without duplicates", async () => {
  const source = await readFile(new URL("../integrations/roll20/eraser-bridge.mod.js", import.meta.url), "utf8")
  const handlers = {}
  const objects = new Map()
  const chatMessages = []
  const defaultTokens = []
  let sequence = 0
  const createObj = (type, initial) => {
    const id = `${type}-${++sequence}`
    const values = { ...initial }
    const object = { id, get: (key, callback) => { const value = values[key]; if (callback) callback(value); return value }, set: (patch) => Object.assign(values, patch), remove: () => objects.delete(id), values, type }
    objects.set(id, object)
    return object
  }
  const context = {
    state: {}, console, log() {}, sendChat: (_speaker, message) => chatMessages.push(message), playerIsGM: () => true,
    on: (event, callback) => { handlers[event] = callback }, createObj,
    getObj: (type, id) => objects.get(id)?.type === type ? objects.get(id) : null,
    findObjs: (query) => [...objects.values()].filter((object) => object.type === query._type && Object.entries(query).every(([key, value]) => key === "_type" || object.values[key.replace(/^_/, "")] === value)),
    Campaign: () => ({ get: () => "page-1" }), setDefaultTokenForCharacter: (character, token) => { defaultTokens.push({ ...token.values }); character.values._defaulttoken = JSON.stringify(token.values) },
    decodeURIComponent, encodeURIComponent, parseInt, isNaN, JSON, Object, String, Number, Error, setTimeout: (callback) => callback(),
  }
  vm.createContext(context)
  vm.runInContext(source, context)
  handlers.ready()
  const encodePayload = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
  const npc = { id: "npc-1", name: "Saren", currentHp: 12, totalHp: 20, speed: 6, portrait: "portrait-saren-v1", portraitUrl: "https://example.test/saren.jpg", inventory: [] }
  const encoded = encodePayload({ campaign: { id: "camp-1", name: "Test" }, kind: "npc", value: npc, syncId: "sync-1" })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-import ${encoded}` })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-import ${encoded}` })
  const characters = [...objects.values()].filter((object) => object.type === "character")
  assert.equal(characters.length, 1)
  assert.equal(characters[0].values.name, "Saren")
  assert.doesNotMatch(characters[0].values.bio, /<img/)
  assert.equal(characters[0].values.gmnotes, "")
  assert.equal([...objects.values()].filter((object) => object.type === "attribute" && object.values.name === "pv").length, 1)
  const importMessage = chatMessages.find((message) => message.includes("ERASER_ACK:sync-1:"))
  const importMetadata = JSON.parse(Buffer.from(importMessage.match(/ERASER_ACK:sync-1:([A-Za-z0-9_-]+)/)[1], "base64url").toString("utf8"))
  assert.equal(importMetadata.characterId, characters[0].id)
  assert.equal(importMetadata.needsAvatar, true)
  assert.equal(importMetadata.token, true)
  assert.equal(importMetadata.updated, 0)
  assert.equal(defaultTokens.length, 0)

  characters[0].set({ avatar: "https://files.d20.io/images/123456/original.jpg?1" })
  const existingToken = createObj("graphic", { represents: characters[0].id, imgsrc: "https://files.d20.io/images/old/thumb.jpg?1", showplayers_bar1: false, playersedit_bar1: true, bar1_num_permission: "everyone", showname: false, showplayers_name: false, playersedit_name: true })
  const hpAttribute = [...objects.values()].find((object) => object.type === "attribute" && object.values.name === "pv")
  const tokenCommand = encodePayload({ ...importMetadata, syncId: "token-1" })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-token ${tokenCommand}` })
  const avatarCommand = encodePayload({ ...importMetadata, syncId: "avatar-1" })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-avatar ${avatarCommand}` })
  assert.equal(defaultTokens.length, 0)
  assert.equal(existingToken.values.imgsrc, "https://files.d20.io/images/123456/thumb.jpg?1")
  assert.equal(existingToken.values.bar1_link, hpAttribute.id)
  assert.equal(existingToken.values.bar1_value, "12")
  assert.equal(existingToken.values.bar1_max, "20")
  assert.equal(existingToken.values.showplayers_bar1, false)
  assert.equal(existingToken.values.playersedit_bar1, true)

  const uiReady = encodePayload({ ...importMetadata, avatar: true, syncId: "ui-ready-1" })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-ui-ready ${uiReady}` })
  characters[0].set({ inplayerjournals: "player-custom" })
  const resync = encodePayload({ campaign: { id: "camp-1", name: "Test" }, kind: "npc", value: npc, syncId: "sync-2" })
  handlers["chat:message"]({ type: "api", playerid: "gm", content: `!eraser-import ${resync}` })
  const resyncMessage = chatMessages.find((message) => message.includes("ERASER_ACK:sync-2:"))
  const resyncMetadata = JSON.parse(Buffer.from(resyncMessage.match(/ERASER_ACK:sync-2:([A-Za-z0-9_-]+)/)[1], "base64url").toString("utf8"))
  assert.equal(resyncMetadata.needsAvatar, false)
  assert.equal(resyncMetadata.initializeToken, false)
  assert.equal(characters[0].values.inplayerjournals, "player-custom")
  assert.equal(existingToken.values.showplayers_bar1, false)
  assert.equal(existingToken.values.playersedit_bar1, true)
  handlers["chat:message"]({ type: "api", playerid: "gm", content: "!eraser-push-hp" })
  const hpMessage = chatMessages.find((message) => message.includes("ERASER_HP:"))
  const hpPayload = JSON.parse(Buffer.from(hpMessage.match(/ERASER_HP:([A-Za-z0-9_-]+)/)[1], "base64url").toString("utf8"))
  assert.deepEqual(hpPayload.hitPoints, [{ id: "npc-1", currentHp: 12, totalHp: 20 }])
  handlers["chat:message"]({ type: "api", playerid: "gm", content: "!eraser-reset-all reset-test" })
  assert.equal(chatMessages.some((message) => message.includes("ERASER_ACK:reset-test:")), true)
  assert.equal([...objects.values()].filter((object) => object.type === "character").length, 0)
  assert.equal(chatMessages.some((message) => message.includes("Erreur")), false)
})
