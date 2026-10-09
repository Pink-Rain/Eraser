/* eslint-disable @typescript-eslint/no-require-imports */
"use strict"

/**
 * Le statut Discord « Joue à Eraser - JDR », avec l'icône d'Eraser.
 *
 * Discord ouvert sur l'ordinateur écoute une connexion locale (sous Windows, le canal
 * nommé « discord-ipc-0 » à « -9 ») ; on s'y présente avec l'identifiant de l'application
 * Discord « Eraser - JDR », puis on donne l'activité. Rien ne part sur Internet depuis
 * Eraser : c'est Discord qui affiche le statut. Sans Discord, ou s'il refuse, rien ne se
 * passe et on réessaie plus tard, sans bruit.
 *
 * Trame : opcode (int32 LE), longueur (int32 LE), puis le JSON. 0 = présentation,
 * 1 = commande, 2 = fermeture, 3 = ping, 4 = pong.
 */
const net = require("node:net")
const { randomUUID } = require("node:crypto")

/** L'application Discord « Eraser - JDR » (identifiant public, pas un secret). */
const DISCORD_CLIENT_ID = "1558145913233477672"
const RETRY_MS = 60_000

let socket = null
let retryTimer = null
let stopped = false
let activity = null
const startedAt = Date.now()

function pipePath(index) {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${index}`
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp"
  return `${base.replace(/\/$/, "")}/discord-ipc-${index}`
}

function frame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8")
  const header = Buffer.alloc(8)
  header.writeInt32LE(opcode, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function connectTo(index) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(pipePath(index))
    const fail = (error) => { client.destroy(); reject(error) }
    client.once("connect", () => { client.off("error", fail); resolve(client) })
    client.once("error", fail)
  })
}

async function openSocket() {
  for (let index = 0; index < 10; index += 1) {
    try { return await connectTo(index) } catch { /* canal suivant */ }
  }
  return null
}

function scheduleRetry() {
  if (stopped || retryTimer) return
  retryTimer = setTimeout(() => { retryTimer = null; void connect() }, RETRY_MS)
  retryTimer.unref?.()
}

function sendActivity() {
  if (!socket || !activity) return
  try {
    socket.write(frame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity }, nonce: randomUUID() }))
  } catch { /* la connexion est tombée : la reconnexion renverra l'activité */ }
}

async function connect() {
  if (stopped || socket) return
  const client = await openSocket()
  if (!client) { scheduleRetry(); return }
  socket = client
  let buffer = Buffer.alloc(0)
  client.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length >= 8) {
      const opcode = buffer.readInt32LE(0)
      const length = buffer.readInt32LE(4)
      if (buffer.length < 8 + length) break
      const body = buffer.subarray(8, 8 + length).toString("utf8")
      buffer = buffer.subarray(8 + length)
      let message = null
      try { message = JSON.parse(body) } catch { /* trame illisible : ignorée */ }
      if (opcode === 3) { try { client.write(frame(4, message ?? {})) } catch { /* ignoré */ } continue }
      // Discord est prêt : l'activité peut partir.
      if (message?.evt === "READY") sendActivity()
    }
  })
  const drop = () => {
    if (socket === client) socket = null
    client.destroy()
    scheduleRetry()
  }
  client.on("error", drop)
  client.on("close", drop)
  try { client.write(frame(0, { v: 1, client_id: DISCORD_CLIENT_ID })) } catch { drop() }
}

/** Montre « Eraser - JDR » dans le statut Discord tant qu'Eraser est ouvert. */
function startDiscordPresence() {
  stopped = false
  activity = {
    details: "Carnet de campagne",
    timestamps: { start: Math.floor(startedAt / 1000) },
    assets: { large_image: "eraser", large_text: "Eraser - JDR" },
    instance: false,
  }
  void connect().catch(() => scheduleRetry())
}

function stopDiscordPresence() {
  stopped = true
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  const client = socket
  socket = null
  if (!client) return
  try { client.write(frame(2, {})) } catch { /* ignoré */ }
  client.destroy()
}

module.exports = { startDiscordPresence, stopDiscordPresence, DISCORD_CLIENT_ID }
