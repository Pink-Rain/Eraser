// Dessin des tokens d'Eraser : cadre doré (joueurs), cuivré (PNJs), argenté
// (créatures) et devantures de magasins. Une seule source pour l'application
// (éditeur de token) et le compagnon Roll20 (tokens automatiques) : ce fichier est
// un script classique, chargé comme content script et importé par l'application.
(function (root) {
  'use strict';
  const SIZE = 512;
  const CENTER = SIZE / 2;
  const OUTER = 250;
  const RING = 34;
  const INNER = OUTER - RING;
  const metals = {
    character: ["#fff4b8", "#e8c052", "#a6721b", "#5e3c0c"],
    npc: ["#ffd6b8", "#d98a55", "#98491f", "#52220c"],
    creature: ["#ffffff", "#d8dde3", "#8e97a2", "#464e58"]
  };
  const wood = ["#e0ae76", "#a76c37", "#6d401b", "#3a200c"];
  const shopFronts = {
    market: { stripes: ["#b3261e", "#f4e9d8"], background: "#ead7b4", sign: "🧺", label: "Marché" },
    bookshop: { stripes: ["#1f4e8c", "#f1ead9"], background: "#d9e2ef", sign: "📚", label: "Librairie" },
    antique: { stripes: ["#5b2a6e", "#e8c96a"], background: "#e7dcc9", sign: "🏺", label: "Antiquaire" },
    armory: { stripes: ["#5d6670", "#8e1b1b"], background: "#cfd3d8", sign: "⚔️", label: "Armurerie" },
    "black-market": { stripes: ["#1d1a22", "#4b2a5e"], background: "#3a3340", sign: "🗝️", label: "Marché noir" },
    alchemist: { stripes: ["#2f6b3a", "#efe6cf"], background: "#d5e6cf", sign: "⚗️", label: "Alchimiste" },
    tavern: { stripes: ["#b8621b", "#f2dfb8"], background: "#e9cfa2", sign: "🍺", label: "Taverne" }
  };
  function ringPath(ctx, outer, inner) {
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, outer, 0, Math.PI * 2);
    ctx.arc(CENTER, CENTER, inner, 0, Math.PI * 2, true);
  }
  function metalGradient(ctx, metal) {
    const gradient = ctx.createLinearGradient(CENTER - OUTER, CENTER - OUTER, CENTER + OUTER, CENTER + OUTER);
    gradient.addColorStop(0, metal[0]);
    gradient.addColorStop(0.25, metal[1]);
    gradient.addColorStop(0.5, metal[2]);
    gradient.addColorStop(0.72, metal[1]);
    gradient.addColorStop(0.9, metal[0]);
    gradient.addColorStop(1, metal[2]);
    return gradient;
  }
  function drawFrame(ctx, metal) {
    const shade = ctx.createRadialGradient(CENTER, CENTER, INNER - 30, CENTER, CENTER, INNER);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, INNER, 0, Math.PI * 2);
    ctx.fill();
    ringPath(ctx, OUTER, INNER);
    ctx.fillStyle = metalGradient(ctx, metal);
    ctx.fill("evenodd");
    ctx.lineWidth = 3;
    ctx.strokeStyle = metal[3];
    for (const radius of [OUTER - 1.5, INNER + 1.5]) {
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = metal[0];
    for (const radius of [OUTER - 7, INNER + 7]) {
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    const middle = OUTER - RING / 2;
    for (let index = 0; index < 32; index += 1) {
      if (index % 8 === 0) continue;
      const angle = index / 32 * Math.PI * 2 - Math.PI / 2;
      const x = CENTER + Math.cos(angle) * middle;
      const y = CENTER + Math.sin(angle) * middle;
      const bead = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
      bead.addColorStop(0, metal[0]);
      bead.addColorStop(1, metal[2]);
      ctx.fillStyle = bead;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = metal[3];
      ctx.stroke();
    }
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(CENTER + Math.cos(angle) * middle, CENTER + Math.sin(angle) * middle);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(0, -11);
      ctx.lineTo(15, 0);
      ctx.lineTo(0, 11);
      ctx.closePath();
      const gem = ctx.createLinearGradient(-15, -11, 15, 11);
      gem.addColorStop(0, metal[0]);
      gem.addColorStop(0.5, metal[1]);
      gem.addColorStop(1, metal[3]);
      ctx.fillStyle = gem;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = metal[3];
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawShopFront(ctx, shopKey) {
    const front = shopFronts[shopKey];
    drawFrame(ctx, wood);
    const start = Math.PI * 1.1;
    const end = Math.PI * 1.9;
    const stripes = 9;
    const outer = OUTER + 2;
    const inner = INNER - 44;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
    for (let index = 0; index < stripes; index += 1) {
      const from = start + (end - start) * index / stripes;
      const to = start + (end - start) * (index + 1) / stripes;
      const middle = (from + to) / 2;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, outer, from, to);
      ctx.lineTo(CENTER + Math.cos(to) * inner, CENTER + Math.sin(to) * inner);
      ctx.quadraticCurveTo(CENTER + Math.cos(middle) * (inner - 26), CENTER + Math.sin(middle) * (inner - 26), CENTER + Math.cos(from) * inner, CENTER + Math.sin(from) * inner);
      ctx.closePath();
      ctx.fillStyle = front.stripes[index % 2];
      ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(40,20,8,0.75)";
    for (let index = 0; index < stripes; index += 1) {
      const from = start + (end - start) * index / stripes;
      const to = start + (end - start) * (index + 1) / stripes;
      const middle = (from + to) / 2;
      ctx.beginPath();
      ctx.moveTo(CENTER + Math.cos(from) * inner, CENTER + Math.sin(from) * inner);
      ctx.quadraticCurveTo(CENTER + Math.cos(middle) * (inner - 26), CENTER + Math.sin(middle) * (inner - 26), CENTER + Math.cos(to) * inner, CENTER + Math.sin(to) * inner);
      ctx.stroke();
    }
    ctx.lineWidth = 7;
    ctx.strokeStyle = wood[3];
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, outer - 2, start, end);
    ctx.stroke();
    const signY = CENTER + OUTER - 22;
    ctx.beginPath();
    ctx.arc(CENTER, signY, 34, 0, Math.PI * 2);
    const plate = ctx.createRadialGradient(CENTER - 8, signY - 8, 4, CENTER, signY, 34);
    plate.addColorStop(0, wood[0]);
    plate.addColorStop(1, wood[2]);
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = wood[3];
    ctx.stroke();
    ctx.font = "34px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(front.sign, CENTER, signY + 2);
  }
  function drawToken(ctx, style, image, placement, editing) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const height = image ? placement.width * ((image.naturalHeight || image.height) / (image.naturalWidth || image.width)) : 0;
    const left = placement.x - placement.width / 2;
    const top = placement.y - height / 2;
    if (editing && image) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(image, left, top, placement.width, height);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, INNER + 1, 0, Math.PI * 2);
    ctx.clip();
    if (style.kind === "shop") {
      ctx.fillStyle = shopFronts[style.shopKey].background;
      ctx.fillRect(0, 0, SIZE, SIZE);
      if (!image) {
        ctx.globalAlpha = 0.28;
        ctx.font = "170px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(shopFronts[style.shopKey].sign, CENTER, CENTER + 20);
        ctx.globalAlpha = 1;
      }
    } else if (!image) {
      ctx.fillStyle = "#d9d2c5";
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    if (image) ctx.drawImage(image, left, top, placement.width, height);
    ctx.restore();
    if (style.kind === "shop") drawShopFront(ctx, style.shopKey);
    else drawFrame(ctx, metals[style.kind]);
    if (editing && image) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeRect(left, top, placement.width, height);
      ctx.setLineDash([]);
      for (const [x, y] of corners(placement, height)) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#7f3430";
        ctx.lineWidth = 3;
        ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.strokeRect(x - 9, y - 9, 18, 18);
      }
      ctx.restore();
    }
  }
  function corners(placement, height) {
    const halfWidth = placement.width / 2;
    const halfHeight = height / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [placement.x + dx * halfWidth, placement.y + dy * halfHeight]);
  }
  function coverPlacement(image) {
    const diameter = INNER * 2;
    const ratio = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
    const width = ratio >= 1 ? diameter * ratio : diameter;
    return { x: CENTER, y: CENTER, width };
  }

  /**
   * Le token par défaut : l'avatar centré pour couvrir le cercle, dans son cadre.
   * `image` peut être nul (magasin sans vendeur). Renvoie un canvas 512 × 512.
   */
  function renderDefaultToken(style, image) {
    const canvas = typeof OffscreenCanvas === 'function' && typeof document === 'undefined'
      ? new OffscreenCanvas(SIZE, SIZE)
      : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
    const context = canvas.getContext('2d');
    drawToken(context, style, image, image ? coverPlacement(image) : { x: CENTER, y: CENTER, width: INNER * 2 }, false);
    return canvas;
  }

  root.EraserTokenArt = { SIZE, CENTER, INNER, shopFronts, drawToken, corners, coverPlacement, renderDefaultToken };
}(typeof globalThis !== 'undefined' ? globalThis : window));
