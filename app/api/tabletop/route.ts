import { NextResponse } from "next/server"

import {
  addTabletopToken,
  copyTabletopMapToPage,
  createTabletopFolder,
  createTabletopMap,
  deleteTabletopFolder,
  isTabletopWorkbookReady,
  listTabletopFolders,
  listTabletopMaps,
  listTabletopTokens,
  moveTabletopToken,
  prepareTabletopWorkbookInBackground,
  removeTabletopToken,
  renameTabletopFolder,
  saveTabletopActivity,
  updateTabletopMap,
  updateTabletopTokenAppearance,
  updateTabletopTokenStates,
} from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { copyTabletopBackground } from "@/lib/tabletop-backgrounds"
import {
  authorizeTabletopMap,
  canAccessTabletopPage,
  canManageTabletopPage,
  canManageTabletop,
  getTabletopNpcDetail,
  getTabletopShopDetail,
  getTabletopSnapshotForAccount,
  getTabletopSpeakerName,
  listTabletopLibraryForAccount,
  listTabletopMapsForAccount,
  listTabletopSourcePages,
  updateTabletopEntityHp,
} from "@/lib/tabletop-access"
import type { TabletopActivityKind } from "@/lib/tabletop-schema"

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  const mapId = text(url.searchParams.get("mapId"), 200)
  const roomKey = text(url.searchParams.get("roomKey"), 200)
  const pageLinked = text(url.searchParams.get("pageLinked"), 200) || "bac-a-sable"
  try {
    const storageReady = await isTabletopWorkbookReady()
    if (!storageReady) {
      // Preparing the workbook is installation bootstrap, not a user action:
      // it uses the shared Drive account and links the existing workbook
      // rather than creating a second one. Gating it on the manage role left
      // a player's own installation stuck on "préparation" forever, since no
      // one with that role ever opens the tabletop from their machine.
      if (url.searchParams.get("prepare") === "1") prepareTabletopWorkbookInBackground()
      return NextResponse.json({ preparing: true }, { status: 202 })
    }
    if (url.searchParams.get("sources") === "1") {
      if (!canManageTabletop(account)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      return NextResponse.json({ sourcePages: await listTabletopSourcePages(account) })
    }
    if (url.searchParams.get("folders") === "1") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      return NextResponse.json({ folders: await listTabletopFolders(pageLinked) })
    }
    const shopId = text(url.searchParams.get("shopId"), 200)
    if (mapId && shopId) {
      const shop = await getTabletopShopDetail(account, mapId, shopId, roomKey)
      if (!shop) return NextResponse.json({ error: "Magasin introuvable." }, { status: 404 })
      return NextResponse.json({ shop })
    }
    const npcId = text(url.searchParams.get("npcId"), 200)
    if (mapId && npcId) {
      const npc = await getTabletopNpcDetail(account, mapId, npcId, roomKey)
      if (!npc) return NextResponse.json({ error: "PNJ introuvable." }, { status: 404 })
      return NextResponse.json({ npc })
    }
    if (url.searchParams.get("bootstrap") === "1") {
      const requestedMapId = text(url.searchParams.get("requestedMapId"), 200)
      const pageAccess = await canAccessTabletopPage(account, pageLinked)
      let maps = pageAccess ? await listTabletopMapsForAccount(account, pageLinked) : []
      const selectedMapId = requestedMapId || maps[0]?.id || ""
      const [snapshot, folders] = await Promise.all([
        selectedMapId ? getTabletopSnapshotForAccount(account, selectedMapId, roomKey) : Promise.resolve(null),
        pageAccess && canManageTabletop(account) ? listTabletopFolders(pageLinked, maps) : Promise.resolve([]),
      ])
      if (!pageAccess && !snapshot) return NextResponse.json({ error: "Lien de table requis." }, { status: 403 })
      if (!maps.length && snapshot) maps = [snapshot.map]
      const entities = snapshot?.entities ?? (pageAccess ? await listTabletopLibraryForAccount(account, pageLinked) : [])
      return NextResponse.json({ maps, snapshot, entities, folders })
    }
    if (!mapId) {
      if (!canManageTabletop(account) || !await canAccessTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      return NextResponse.json({ maps: await listTabletopMapsForAccount(account, pageLinked) })
    }
    const snapshot = await getTabletopSnapshotForAccount(account, mapId, roomKey)
    if (!snapshot) return NextResponse.json({ error: "Tabletop introuvable ou lien invalide." }, { status: 404 })
    return NextResponse.json({ snapshot })
  } catch {
    return NextResponse.json({ error: "Le tabletop n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const action = text(body.action, 40)
    const mapId = text(body.mapId, 200)
    const roomKey = text(body.roomKey, 200)
    const pageLinked = text(body.pageLinked, 200) || "bac-a-sable"

    if (action === "create-map") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const map = await createTabletopMap(pageLinked, account.uid, text(body.name, 120) || "Nouvelle carte", text(body.folder, 80) || "Sans dossier")
      return NextResponse.json({ map })
    }

    if (action === "create-folder") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const folder = await createTabletopFolder(pageLinked, text(body.name, 80))
      return NextResponse.json({ folder, folders: await listTabletopFolders(pageLinked) })
    }

    if (action === "rename-folder") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const folder = await renameTabletopFolder(pageLinked, text(body.folderId, 200), text(body.currentName, 80), text(body.name, 80))
      return NextResponse.json({ folder, maps: await listTabletopMaps(pageLinked), folders: await listTabletopFolders(pageLinked) })
    }

    if (action === "delete-folder") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      await deleteTabletopFolder(pageLinked, text(body.folderId, 200), text(body.currentName, 80))
      return NextResponse.json({ ok: true, maps: await listTabletopMaps(pageLinked), folders: await listTabletopFolders(pageLinked) })
    }

    if (action === "import-map") {
      if (!await canManageTabletopPage(account, pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const sourceMap = await authorizeTabletopMap(account, text(body.sourceMapId, 200))
      if (!sourceMap) return NextResponse.json({ error: "Carte source introuvable." }, { status: 404 })
      const library = await listTabletopLibraryForAccount(account, pageLinked)
      const folder = text(body.folder, 80) || "Importées"
      await createTabletopFolder(pageLinked, folder)
      let map = await copyTabletopMapToPage(sourceMap.id, pageLinked, account.uid, folder, new Set(library.map((entity) => `${entity.kind}:${entity.id}`)))
      if (!map) throw new Error("TABLETOP_MAP_NOT_FOUND")
      if (sourceMap.backgroundUrl.startsWith("/api/tabletop/background/") && await copyTabletopBackground(sourceMap.id, map.id).catch(() => false)) {
        map = await updateTabletopMap(map.id, { backgroundUrl: `/api/tabletop/background/${encodeURIComponent(map.id)}` }) || map
      }
      return NextResponse.json({ map, folders: await listTabletopFolders(pageLinked) })
    }

    const map = await authorizeTabletopMap(account, mapId, roomKey)
    if (!map) return NextResponse.json({ error: "Tabletop introuvable ou lien invalide." }, { status: 404 })

    if (action === "update-map") {
      if (!await canManageTabletopPage(account, map.pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const updated = await updateTabletopMap(map.id, {
        name: body.name === undefined ? undefined : text(body.name, 120),
        width: body.width === undefined ? undefined : number(body.width, map.width),
        height: body.height === undefined ? undefined : number(body.height, map.height),
        gridSize: body.gridSize === undefined ? undefined : number(body.gridSize, map.gridSize),
        distancePerGrid: body.distancePerGrid === undefined ? undefined : number(body.distancePerGrid, map.distancePerGrid),
        distanceUnit: body.distanceUnit === undefined ? undefined : text(body.distanceUnit, 20),
        folder: body.folder === undefined ? undefined : text(body.folder, 80),
      })
      if (!updated) throw new Error("TABLETOP_MAP_NOT_FOUND")
      return NextResponse.json({ map: updated })
    }

    if (action === "add-token") {
      const entityKind = body.entityKind === "npc" || body.entityKind === "character" || body.entityKind === "shop" ? body.entityKind : null
      const entityId = text(body.entityId, 200)
      if (!entityKind || !entityId) throw new Error("INVALID_TABLETOP_ENTITY")
      const entity = (await listTabletopLibraryForAccount(account, map.pageLinked)).find((candidate) => candidate.kind === entityKind && candidate.id === entityId && candidate.controllable)
      if (!entity) return NextResponse.json({ error: "Ce pion ne peut pas être ajouté." }, { status: 403 })
      const token = await addTabletopToken(
        map.id,
        entityKind,
        entityId,
        Math.max(0, Math.min(map.width, number(body.x, map.width / 2))),
        Math.max(0, Math.min(map.height, number(body.y, map.height / 2))),
      )
      return NextResponse.json({ token, entity })
    }

    if (action === "add-marker") {
      if (!await canManageTabletopPage(account, map.pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const entityId = crypto.randomUUID()
      const label = text(body.label, 120)
      const icon = text(body.icon, 20) || "✦"
      const color = /^#[0-9a-f]{6}$/i.test(text(body.color, 20)) ? text(body.color, 20) : "#7f3430"
      const token = await addTabletopToken(map.id, "marker", entityId, Math.max(0, Math.min(map.width, number(body.x, map.width / 2))), Math.max(0, Math.min(map.height, number(body.y, map.height / 2))), label, icon, 1, number(body.iconScale, 1), color)
      const entity = { id: entityId, kind: "marker" as const, name: label || "Repère", subtitle: "Repère de carte", portrait: "", currentHp: 0, totalHp: 0, speed: 0, ownerUid: account.uid, controllable: true }
      return NextResponse.json({ token, entity })
    }

    if (action === "move-token") {
      const tokenId = text(body.tokenId, 200)
      const token = (await listTabletopTokens(map.id)).find((candidate) => candidate.id === tokenId)
      const canMove = token && (await canManageTabletopPage(account, map.pageLinked) || (await listTabletopLibraryForAccount(account, map.pageLinked)).some((entity) => entity.kind === token.entityKind && entity.id === token.entityId && entity.controllable))
      if (!token || !canMove) return NextResponse.json({ error: "Ce pion ne peut pas être déplacé." }, { status: 403 })
      const moved = await moveTabletopToken(
        map.id,
        token.id,
        Math.max(0, Math.min(map.width, number(body.x, token.x))),
        Math.max(0, Math.min(map.height, number(body.y, token.y))),
      )
      if (!moved) throw new Error("TABLETOP_TOKEN_NOT_FOUND")
      return NextResponse.json({ token: moved })
    }

    if (action === "save-positions") {
      const positions = Array.isArray(body.positions) ? body.positions.slice(0, 50) : []
      const tabletopTokens = await listTabletopTokens(map.id)
      const isManager = await canManageTabletopPage(account, map.pageLinked)
      const movable = isManager ? null : new Set((await listTabletopLibraryForAccount(account, map.pageLinked)).filter((entity) => entity.controllable).map((entity) => `${entity.kind}:${entity.id}`))
      const patches: Array<{ tokenId: string; x: number; y: number }> = []
      for (const candidate of positions) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue
        const position = candidate as Record<string, unknown>
        const token = tabletopTokens.find((item) => item.id === text(position.tokenId, 200))
        if (!token || (!isManager && !movable?.has(`${token.entityKind}:${token.entityId}`))) continue
        patches.push({ tokenId: token.id, x: Math.max(0, Math.min(map.width, number(position.x, token.x))), y: Math.max(0, Math.min(map.height, number(position.y, token.y))) })
      }
      const saved = await updateTabletopTokenStates(map.id, patches)
      return NextResponse.json({ ok: true, saved: saved.length, savedTokenIds: saved.map((token) => token.id) })
    }

    if (action === "save-token-state") {
      const candidates = Array.isArray(body.patches) ? body.patches.slice(0, 100) : []
      const tabletopTokens = await listTabletopTokens(map.id)
      const isManager = await canManageTabletopPage(account, map.pageLinked)
      const movable = isManager ? null : new Set((await listTabletopLibraryForAccount(account, map.pageLinked)).filter((entity) => entity.controllable).map((entity) => `${entity.kind}:${entity.id}`))
      const patches: Array<{ tokenId: string; x?: number; y?: number; scale?: number; iconScale?: number; label?: string; icon?: string; color?: string }> = []
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue
        const patch = candidate as Record<string, unknown>
        const token = tabletopTokens.find((item) => item.id === text(patch.tokenId, 200))
        if (!token || (!isManager && !movable?.has(`${token.entityKind}:${token.entityId}`))) continue
        const next: (typeof patches)[number] = { tokenId: token.id }
        if (patch.x !== undefined) next.x = Math.max(0, Math.min(map.width, number(patch.x, token.x)))
        if (patch.y !== undefined) next.y = Math.max(0, Math.min(map.height, number(patch.y, token.y)))
        if (patch.scale !== undefined) next.scale = number(patch.scale, token.scale)
        if (patch.iconScale !== undefined) next.iconScale = number(patch.iconScale, token.iconScale)
        if (isManager && token.entityKind === "marker") {
          if (patch.label !== undefined) next.label = text(patch.label, 120)
          if (patch.icon !== undefined) next.icon = text(patch.icon, 20) || "✦"
          if (patch.color !== undefined && /^#[0-9a-f]{6}$/i.test(text(patch.color, 20))) next.color = text(patch.color, 20)
        }
        if (Object.keys(next).length > 1) patches.push(next)
      }
      const saved = await updateTabletopTokenStates(map.id, patches)
      return NextResponse.json({ ok: true, saved: saved.length, savedTokenIds: saved.map((token) => token.id) })
    }

    if (action === "resize-token") {
      const tokenId = text(body.tokenId, 200)
      const token = (await listTabletopTokens(map.id)).find((candidate) => candidate.id === tokenId)
      const canResize = token && (await canManageTabletopPage(account, map.pageLinked) || (await listTabletopLibraryForAccount(account, map.pageLinked)).some((entity) => entity.kind === token.entityKind && entity.id === token.entityId && entity.controllable))
      if (!token || !canResize) return NextResponse.json({ error: "Ce pion ne peut pas être redimensionné." }, { status: 403 })
      const updated = await updateTabletopTokenAppearance(map.id, token.id, { scale: number(body.scale, token.scale), iconScale: body.iconScale === undefined ? token.iconScale : number(body.iconScale, token.iconScale) })
      if (!updated) throw new Error("TABLETOP_TOKEN_NOT_FOUND")
      return NextResponse.json({ token: updated })
    }

    if (action === "update-marker") {
      if (!await canManageTabletopPage(account, map.pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const tokenId = text(body.tokenId, 200)
      const token = (await listTabletopTokens(map.id)).find((candidate) => candidate.id === tokenId && candidate.entityKind === "marker")
      if (!token) return NextResponse.json({ error: "Repère introuvable." }, { status: 404 })
      const updated = await updateTabletopTokenAppearance(map.id, token.id, {
        label: text(body.label, 120),
        icon: text(body.icon, 20) || "✦",
        iconScale: number(body.iconScale, token.iconScale),
        color: /^#[0-9a-f]{6}$/i.test(text(body.color, 20)) ? text(body.color, 20) : token.color,
      })
      if (!updated) throw new Error("TABLETOP_TOKEN_NOT_FOUND")
      return NextResponse.json({ token: updated })
    }

    if (action === "remove-token") {
      if (!await canManageTabletopPage(account, map.pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const tokenId = text(body.tokenId, 200)
      if (!await removeTabletopToken(map.id, tokenId)) throw new Error("TABLETOP_TOKEN_NOT_FOUND")
      return NextResponse.json({ ok: true, tokenId })
    }

    if (action === "update-hp") {
      const entityKind = body.entityKind === "npc" || body.entityKind === "character" ? body.entityKind : null
      const entityId = text(body.entityId, 200)
      const isOnMap = entityKind && (await listTabletopTokens(map.id)).some((token) => token.entityKind === entityKind && token.entityId === entityId)
      if (!entityKind || !isOnMap) throw new Error("INVALID_TABLETOP_ENTITY")
      const entity = await updateTabletopEntityHp(account, map.pageLinked, entityKind, entityId, { currentHp: body.currentHp, totalHp: body.totalHp })
      if (!entity) return NextResponse.json({ error: "Ces points de vie ne peuvent pas être modifiés." }, { status: 403 })
      return NextResponse.json({ entity })
    }

    if (action === "activity") {
      const kind: TabletopActivityKind | null = body.kind === "chat" || body.kind === "dice" ? body.kind : null
      if (!kind) throw new Error("INVALID_TABLETOP_ACTIVITY")
      const authorName = await getTabletopSpeakerName(account, map.pageLinked, text(body.speakerId, 200))
      const activity = {
        id: text(body.id, 200) || crypto.randomUUID(),
        mapId: map.id,
        kind,
        authorUid: account.uid,
        authorName,
        text: text(body.text, 1200),
        diceExpression: kind === "dice" ? text(body.diceExpression, 40) : "",
        diceResult: kind === "dice" ? text(body.diceResult, 500) : "",
        createdAt: new Date().toISOString(),
        audience: body.audience === "gm" || body.audience === "character" ? body.audience : "public" as "public" | "gm" | "character",
        recipientId: text(body.recipientId, 200),
        recipientName: text(body.recipientName, 120),
      }
      if (kind === "chat" && !activity.text) throw new Error("EMPTY_TABLETOP_MESSAGE")
      await saveTabletopActivity(activity)
      return NextResponse.json({ activity })
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "La modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
