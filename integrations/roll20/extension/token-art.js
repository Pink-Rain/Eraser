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

  /* ---------- cadres anciens et abîmés ---------- */

  // Hasard reproductible : un même cadre a toujours les mêmes éraflures.
  function seeded(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Or terni, cuivre vert-de-grisé, argent noirci. */
  const agedMetals = {
    character: { base: ["#dcc07a", "#b08d45", "#77592a", "#3d2c12"], patina: "rgba(70,48,14,0.38)", scratch: "rgba(255,240,200,0.28)" },
    npc: { base: ["#d6a07a", "#a2663f", "#6c3d20", "#35190b"], patina: "rgba(58,122,96,0.5)", scratch: "rgba(255,225,200,0.25)" },
    creature: { base: ["#d0d3d6", "#9da2a7", "#62676d", "#2b2f33"], patina: "rgba(18,20,24,0.4)", scratch: "rgba(255,255,255,0.3)" },
  };

  /** Un bord irrégulier : ondulation légère et éclats. */
  function roughCircle(ctx, radius, rand, amplitude, chips, reverse) {
    const phases = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
    const steps = 200;
    for (let index = 0; index <= steps; index += 1) {
      const step = reverse ? steps - index : index;
      const angle = (step / steps) * Math.PI * 2;
      let offset = (Math.sin(angle * 3 + phases[0]) * 0.5 + Math.sin(angle * 7 + phases[1]) * 0.3 + Math.sin(angle * 17 + phases[2]) * 0.2) * amplitude;
      for (const chip of chips) {
        const distance = Math.abs(Math.atan2(Math.sin(angle - chip.angle), Math.cos(angle - chip.angle)));
        if (distance < chip.width) offset -= chip.depth * (1 - distance / chip.width);
      }
      const x = CENTER + Math.cos(angle) * (radius + offset);
      const y = CENTER + Math.sin(angle) * (radius + offset);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Le temps sur l'image : un léger voile sépia et des bords assombris. */
  function ageInside(ctx, radius) {
    ctx.save();
    ctx.beginPath(); ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgba(112,72,28,0.14)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const shade = ctx.createRadialGradient(CENTER, CENTER, radius * 0.55, CENTER, CENTER, radius);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(30,18,6,0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();
  }

  /**
   * « Ancien » : un anneau de métal martelé, sobre, usé et ébréché.
   * « Relique » : deux fins anneaux fendus, rongés par la patine, clous aux angles.
   */
  function drawWornFrame(ctx, kind, variant) {
    const metal = agedMetals[kind] || agedMetals.npc;
    const rand = seeded(kind.length * 977 + (variant === "relic" ? 31 : 7));
    const outer = variant === "relic" ? OUTER - 6 : OUTER - 2;
    const inner = variant === "relic" ? INNER + 8 : INNER + 4;
    ageInside(ctx, inner + 1);
    const chips = Array.from({ length: variant === "relic" ? 11 : 7 }, () => ({ angle: rand() * Math.PI * 2, width: 0.04 + rand() * 0.08, depth: 3 + rand() * (variant === "relic" ? 9 : 6) }));

    ctx.save();
    ctx.beginPath();
    roughCircle(ctx, outer, rand, variant === "relic" ? 2.2 : 1.4, chips, false);
    roughCircle(ctx, inner, rand, 1, [], true);
    const gradient = ctx.createLinearGradient(CENTER - OUTER, CENTER - OUTER, CENTER + OUTER, CENTER + OUTER);
    gradient.addColorStop(0, metal.base[0]); gradient.addColorStop(0.35, metal.base[1]);
    gradient.addColorStop(0.7, metal.base[2]); gradient.addColorStop(1, metal.base[1]);
    ctx.fillStyle = gradient;
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fill("evenodd");
    ctx.shadowColor = "transparent";
    ctx.clip("evenodd");

    // Martelage : petites facettes claires et sombres.
    for (let index = 0; index < 260; index += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = inner + rand() * (outer - inner);
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,245,220,0.10)" : "rgba(20,10,0,0.12)";
      ctx.beginPath(); ctx.arc(CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius, 1.5 + rand() * 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Patine en taches.
    for (let index = 0; index < (variant === "relic" ? 16 : 9); index += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = inner + rand() * (outer - inner);
      const x = CENTER + Math.cos(angle) * radius;
      const y = CENTER + Math.sin(angle) * radius;
      const size = 10 + rand() * (variant === "relic" ? 26 : 18);
      const blot = ctx.createRadialGradient(x, y, 0, x, y, size);
      blot.addColorStop(0, metal.patina); blot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = blot;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    // Éraflures le long de l'anneau.
    ctx.lineCap = "round";
    for (let index = 0; index < 55; index += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = inner + 3 + rand() * (outer - inner - 6);
      const length = 0.03 + rand() * 0.12;
      ctx.strokeStyle = rand() > 0.35 ? metal.scratch : "rgba(20,10,0,0.3)";
      ctx.lineWidth = 0.6 + rand() * 1.1;
      ctx.beginPath(); ctx.arc(CENTER, CENTER, radius, angle, angle + length); ctx.stroke();
    }
    if (variant === "relic") {
      // Sillon entre les deux anneaux, et fêlures.
      const middle = (inner + outer) / 2;
      ctx.strokeStyle = "rgba(20,10,4,0.75)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CENTER, CENTER, middle, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,235,200,0.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CENTER, CENTER, middle + 2, 0, Math.PI * 2); ctx.stroke();
      for (let index = 0; index < 4; index += 1) {
        const angle = rand() * Math.PI * 2;
        ctx.strokeStyle = "rgba(15,8,2,0.85)"; ctx.lineWidth = 1.6;
        ctx.beginPath();
        let radius = inner - 2;
        let wander = angle;
        ctx.moveTo(CENTER + Math.cos(wander) * radius, CENTER + Math.sin(wander) * radius);
        while (radius < outer + 2) {
          radius += 4 + rand() * 5;
          wander += (rand() - 0.5) * 0.05;
          ctx.lineTo(CENTER + Math.cos(wander) * radius, CENTER + Math.sin(wander) * radius);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // Arêtes sombres, sans éclat.
    ctx.save();
    ctx.lineWidth = 2; ctx.strokeStyle = metal.base[3];
    ctx.beginPath(); roughCircle(ctx, inner, seeded(kind.length * 977 + (variant === "relic" ? 31 : 7)), 0.6, [], false); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,240,210,0.35)";
    ctx.beginPath(); ctx.arc(CENTER, CENTER, inner + 3, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    if (variant === "relic") {
      for (let index = 0; index < 4; index += 1) {
        const angle = Math.PI / 4 + index * Math.PI / 2;
        const x = CENTER + Math.cos(angle) * ((inner + outer) / 2);
        const y = CENTER + Math.sin(angle) * ((inner + outer) / 2);
        const head = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6);
        head.addColorStop(0, "#8b8378"); head.addColorStop(1, "#2a241d");
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------- échoppes de marché ---------- */

  /** La fenêtre de l'échoppe, où se tient le vendeur (ou le fond du magasin). */
  const STALL_WINDOW = { x: 86, y: 146, width: 340, height: 232 };
  const oldWood = { light: "#a47a4c", base: "#80592f", dark: "#4f341a", line: "rgba(40,24,10,0.55)" };

  /** Une toile ou un toit différent par type de magasin, en couleurs passées. */
  const stallStyles = {
    market: { canopy: "scallop", colors: ["#9a3f2c", "#e2d3b3"], background: "#d9c7a2" },
    bookshop: { canopy: "straight", colors: ["#3f5873", "#d8cdb2"], background: "#ccd2d6" },
    antique: { canopy: "tent", colors: ["#654566", "#c3a35c"], background: "#d8cbb4" },
    armory: { canopy: "shingle", colors: ["#5a4636", "#7a2b22"], background: "#c3c2bd" },
    "black-market": { canopy: "tattered", colors: ["#2d292e", "#4a3a50"], background: "#4a4248" },
    alchemist: { canopy: "bunting", colors: ["#5d7651", "#b39d57", "#7a3a2d", "#4e687a"], background: "#cfd8c2" },
    tavern: { canopy: "thatch", colors: ["#b8934f", "#8a6931"], background: "#d8bf92" },
  };

  function woodGrain(ctx, x, y, width, height, rand, vertical) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.strokeStyle = "rgba(40,22,8,0.22)"; ctx.lineWidth = 1;
    const count = Math.max(2, Math.round((vertical ? width : height) / 9));
    for (let index = 0; index < count; index += 1) {
      ctx.beginPath();
      if (vertical) {
        const base = x + (index + 0.5) * (width / count);
        ctx.moveTo(base, y);
        for (let step = 0; step <= 8; step += 1) ctx.lineTo(base + Math.sin(step * 1.3 + index) * (1 + rand() * 1.5), y + (step / 8) * height);
      } else {
        const base = y + (index + 0.5) * (height / count);
        ctx.moveTo(x, base);
        for (let step = 0; step <= 12; step += 1) ctx.lineTo(x + (step / 12) * width, base + Math.sin(step * 1.1 + index) * (1 + rand() * 1.2));
      }
      ctx.stroke();
    }
    // Nœuds du bois.
    for (let index = 0; index < 2; index += 1) {
      ctx.fillStyle = "rgba(40,22,8,0.25)";
      ctx.beginPath(); ctx.ellipse(x + rand() * width, y + rand() * height, 2 + rand() * 3, 4 + rand() * 4, vertical ? 0 : Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function plank(ctx, x, y, width, height, rand, vertical, tone) {
    ctx.fillStyle = tone || oldWood.base;
    ctx.fillRect(x, y, width, height);
    const light = ctx.createLinearGradient(x, y, vertical ? x + width : x, vertical ? y : y + height);
    light.addColorStop(0, "rgba(255,230,190,0.16)"); light.addColorStop(1, "rgba(30,16,4,0.22)");
    ctx.fillStyle = light;
    ctx.fillRect(x, y, width, height);
    woodGrain(ctx, x, y, width, height, rand, vertical);
    ctx.strokeStyle = oldWood.line; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  }

  /** Toile rayée qui se resserre vers le haut : de (topLeft, topRight) en haut à (left, right) en bas. */
  function stripedCloth(ctx, colors, top, bottom, topLeft, topRight, left, right, stripes) {
    for (let index = 0; index < stripes; index += 1) {
      const fromTop = topLeft + ((topRight - topLeft) * index) / stripes;
      const toTop = topLeft + ((topRight - topLeft) * (index + 1)) / stripes;
      const fromBottom = left + ((right - left) * index) / stripes;
      const toBottom = left + ((right - left) * (index + 1)) / stripes;
      ctx.beginPath();
      ctx.moveTo(fromTop, top); ctx.lineTo(toTop, top); ctx.lineTo(toBottom, bottom); ctx.lineTo(fromBottom, bottom); ctx.closePath();
      ctx.fillStyle = colors[index % 2];
      ctx.fill();
      // Pli de la toile : plus clair au centre de la bande.
      const fold = ctx.createLinearGradient(fromBottom, 0, toBottom, 0);
      fold.addColorStop(0, "rgba(0,0,0,0.16)"); fold.addColorStop(0.5, "rgba(255,255,255,0.08)"); fold.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = fold; ctx.fill();
    }
  }

  function scallops(ctx, colors, y, left, right, count, depth, offset) {
    const width = (right - left) / count;
    for (let index = 0; index < count; index += 1) {
      const x = left + index * width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + width / 2, y + depth * 2, x + width, y);
      ctx.closePath();
      ctx.fillStyle = colors[(index + (offset || 0)) % 2];
      ctx.fill();
      ctx.strokeStyle = "rgba(40,20,10,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function drawCanopy(ctx, style, rand) {
    const [first, second] = style.colors;
    const outline = "rgba(40,22,10,0.7)";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
    if (style.canopy === "scallop") {
      stripedCloth(ctx, [first, second], 22, 62, 96, 416, 28, 484, 8);
      ctx.shadowColor = "transparent";
      plank(ctx, 24, 60, 464, 16, rand, false, oldWood.dark);
      stripedCloth(ctx, [first, second], 76, 126, 28, 484, 28, 484, 8);
      scallops(ctx, [first, second], 126, 28, 484, 8, 14);
    } else if (style.canopy === "straight") {
      stripedCloth(ctx, [first, second], 30, 126, 100, 412, 22, 490, 9);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = first; ctx.fillRect(22, 124, 468, 18);
      ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.strokeRect(22, 124, 468, 18);
      // Franges.
      ctx.strokeStyle = second; ctx.lineWidth = 2;
      for (let x = 28; x < 488; x += 9) { ctx.beginPath(); ctx.moveTo(x, 142); ctx.lineTo(x + (rand() - 0.5) * 2, 152 + rand() * 5); ctx.stroke(); }
    } else if (style.canopy === "tent") {
      const stripes = 8;
      for (let index = 0; index < stripes; index += 1) {
        ctx.beginPath();
        ctx.moveTo(256, 10);
        ctx.lineTo(18 + (476 * index) / stripes, 118);
        ctx.lineTo(18 + (476 * (index + 1)) / stripes, 118);
        ctx.closePath();
        ctx.fillStyle = [first, second][index % 2]; ctx.fill();
      }
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#6d5324"; ctx.beginPath(); ctx.arc(256, 12, 7, 0, Math.PI * 2); ctx.fill();
      scallops(ctx, [second, first], 118, 18, 494, 8, 14);
    } else if (style.canopy === "shingle") {
      ctx.beginPath(); ctx.moveTo(62, 24); ctx.lineTo(450, 24); ctx.lineTo(496, 136); ctx.lineTo(16, 136); ctx.closePath();
      ctx.fillStyle = oldWood.dark; ctx.fill();
      ctx.shadowColor = "transparent";
      for (let row = 0; row < 5; row += 1) {
        const y = 32 + row * 22;
        const inset = 46 - row * 9.5;
        const left = 16 + inset, right = 496 - inset;
        const count = 12;
        for (let index = 0; index < count; index += 1) {
          const x = left + ((right - left) * (index + (row % 2 ? 0.5 : 0))) / count;
          if (x > right - 4) continue;
          const width = (right - left) / count;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + 18); ctx.quadraticCurveTo(x + width / 2, y + 26, x, y + 18); ctx.closePath();
          ctx.fillStyle = rand() > 0.5 ? first : "#4a392b"; ctx.fill();
          ctx.strokeStyle = "rgba(20,10,4,0.6)"; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
      // Bannière de l'armurier.
      ctx.beginPath(); ctx.moveTo(226, 134); ctx.lineTo(286, 134); ctx.lineTo(286, 186); ctx.lineTo(256, 172); ctx.lineTo(226, 186); ctx.closePath();
      ctx.fillStyle = second; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
    } else if (style.canopy === "tattered") {
      ctx.beginPath(); ctx.moveTo(84, 26); ctx.lineTo(428, 26); ctx.lineTo(492, 116);
      for (let x = 492; x >= 20; x -= 14) ctx.lineTo(x, 116 + rand() * 38);
      ctx.lineTo(20, 116); ctx.closePath();
      ctx.fillStyle = first; ctx.fill();
      ctx.shadowColor = "transparent";
      // Pièces cousues.
      for (let index = 0; index < 3; index += 1) {
        const x = 70 + rand() * 320, y = 40 + rand() * 60;
        ctx.fillStyle = second; ctx.fillRect(x, y, 34, 24);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(210,190,150,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, 28, 18); ctx.setLineDash([]);
      }
      // Trous.
      for (let index = 0; index < 4; index += 1) {
        ctx.save(); ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath(); ctx.ellipse(60 + rand() * 390, 70 + rand() * 50, 3 + rand() * 6, 2 + rand() * 4, rand() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (style.canopy === "bunting") {
      ctx.beginPath(); ctx.moveTo(40, 52); ctx.lineTo(472, 52); ctx.lineTo(472, 112); ctx.quadraticCurveTo(256, 150, 40, 112); ctx.closePath();
      ctx.fillStyle = first; ctx.fill();
      ctx.shadowColor = "transparent";
      plank(ctx, 26, 38, 460, 16, rand, false, oldWood.dark);
      // Guirlande de fanions.
      ctx.strokeStyle = "#3b2a18"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(40, 122); ctx.quadraticCurveTo(256, 170, 472, 122); ctx.stroke();
      for (let index = 0; index < 12; index += 1) {
        const t = (index + 0.5) / 12;
        const x = 40 + t * 432;
        const sag = (1 - t) * (1 - t) * 122 + 2 * (1 - t) * t * 170 + t * t * 122;
        ctx.beginPath(); ctx.moveTo(x - 14, sag - 2); ctx.lineTo(x + 14, sag - 2); ctx.lineTo(x, sag + 26); ctx.closePath();
        ctx.fillStyle = style.colors[1 + (index % 3)]; ctx.fill();
        ctx.strokeStyle = "rgba(30,16,6,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      }
    } else {
      // Chaume de la taverne.
      ctx.beginPath(); ctx.moveTo(70, 22); ctx.lineTo(442, 22); ctx.lineTo(498, 132); ctx.lineTo(14, 132); ctx.closePath();
      ctx.fillStyle = second; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save(); ctx.clip();
      for (let index = 0; index < 900; index += 1) {
        const y = 22 + rand() * 118;
        const spread = 56 * (1 - (y - 22) / 110);
        const x = 14 + spread + rand() * (484 - 2 * spread);
        ctx.strokeStyle = rand() > 0.5 ? first : "#d8b86c";
        ctx.lineWidth = 1 + rand();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 4, y + 10 + rand() * 12); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "#5a4520"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(16, 132);
      for (let x = 16; x <= 496; x += 10) ctx.lineTo(x, 132 + rand() * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStall(ctx, shopKey) {
    const style = stallStyles[shopKey] || stallStyles.market;
    const rand = seeded(shopKey.length * 131 + shopKey.charCodeAt(0));
    const area = STALL_WINDOW;
    // Le temps sur la scène.
    ctx.save();
    ctx.beginPath(); ctx.rect(area.x, area.y, area.width, area.height); ctx.clip();
    ctx.fillStyle = "rgba(112,72,28,0.12)"; ctx.fillRect(0, 0, SIZE, SIZE);
    const shade = ctx.createLinearGradient(0, area.y, 0, area.y + 60);
    shade.addColorStop(0, "rgba(20,10,0,0.5)"); shade.addColorStop(1, "rgba(20,10,0,0)");
    ctx.fillStyle = shade; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();
    // Poteaux.
    plank(ctx, 64, 110, 24, 372, rand, true, oldWood.base);
    plank(ctx, 424, 110, 24, 372, rand, true, oldWood.base);
    // Comptoir : plateau et façade en planches.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    plank(ctx, 38, 362, 436, 24, rand, false, oldWood.light);
    ctx.restore();
    const planks = 7;
    for (let index = 0; index < planks; index += 1) {
      const x = 50 + (412 * index) / planks;
      plank(ctx, x, 386, 412 / planks, 100, rand, true, index % 2 ? oldWood.base : "#8a6236");
      ctx.fillStyle = "#2a1c10";
      ctx.beginPath(); ctx.arc(x + 412 / planks / 2, 394, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 412 / planks / 2, 478, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // Écriteau du métier.
    ctx.save();
    ctx.translate(256, 434); ctx.rotate(-0.03);
    ctx.fillStyle = "#d9c79d";
    ctx.beginPath(); ctx.moveTo(-54, -24); ctx.lineTo(54, -26); ctx.lineTo(56, 24); ctx.lineTo(-55, 25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#4b3219"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.font = "34px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000";
    ctx.fillText(shopFronts[shopKey] ? shopFronts[shopKey].sign : "🧺", 0, 2);
    ctx.restore();
    drawCanopy(ctx, style, rand);
    // Usure générale : taches et poussière, seulement sur ce qui est dessiné.
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    for (let index = 0; index < 140; index += 1) {
      const x = rand() * SIZE, y = rand() * SIZE;
      if (x > area.x && x < area.x + area.width && y > area.y && y < area.y + area.height - 20) continue;
      const size = 2 + rand() * 9;
      const spot = ctx.createRadialGradient(x, y, 0, x, y, size);
      spot.addColorStop(0, rand() > 0.3 ? "rgba(40,24,8,0.22)" : "rgba(255,240,210,0.18)"); spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** Les cadres proposés dans l'éditeur, par type de token. Le premier est celui par défaut. */
  const frameOptions = {
    character: [{ id: "ornate", label: "Orné" }, { id: "worn", label: "Ancien" }, { id: "relic", label: "Relique" }],
    npc: [{ id: "ornate", label: "Orné" }, { id: "worn", label: "Ancien" }, { id: "relic", label: "Relique" }],
    creature: [{ id: "ornate", label: "Orné" }, { id: "worn", label: "Ancien" }, { id: "relic", label: "Relique" }],
    shop: [{ id: "round", label: "Médaillon" }, { id: "stall", label: "Échoppe" }],
  };

  function frameOf(style) {
    const options = frameOptions[style.kind] || frameOptions.npc;
    return options.some((option) => option.id === style.frame) ? style.frame : options[0].id;
  }

  function isStall(style) {
    return style.kind === "shop" && frameOf(style) === "stall";
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
    const frame = frameOf(style);
    const stall = isStall(style);
    ctx.save();
    ctx.beginPath();
    if (stall) ctx.rect(STALL_WINDOW.x, STALL_WINDOW.y, STALL_WINDOW.width, STALL_WINDOW.height);
    else ctx.arc(CENTER, CENTER, INNER + 1, 0, Math.PI * 2);
    ctx.clip();
    if (style.kind === "shop") {
      ctx.fillStyle = stall ? (stallStyles[style.shopKey] || stallStyles.market).background : shopFronts[style.shopKey].background;
      ctx.fillRect(0, 0, SIZE, SIZE);
      if (!image) {
        ctx.globalAlpha = 0.28;
        ctx.font = "170px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(shopFronts[style.shopKey].sign, CENTER, stall ? STALL_WINDOW.y + STALL_WINDOW.height / 2 : CENTER + 20);
        ctx.globalAlpha = 1;
      }
    } else if (!image) {
      ctx.fillStyle = "#d9d2c5";
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    if (image) ctx.drawImage(image, left, top, placement.width, height);
    ctx.restore();
    if (stall) drawStall(ctx, style.shopKey);
    else if (style.kind === "shop") drawShopFront(ctx, style.shopKey);
    else if (frame === "worn" || frame === "relic") drawWornFrame(ctx, style.kind, frame);
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
  /** L'image est d'abord posée pour couvrir tout le cercle, ou toute la fenêtre de l'échoppe. */
  function coverPlacement(image, style) {
    const ratio = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
    if (style && isStall(style)) {
      const area = STALL_WINDOW;
      const width = Math.max(area.width, area.height * ratio);
      return { x: area.x + area.width / 2, y: area.y + area.height / 2, width };
    }
    const diameter = INNER * 2;
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
    drawToken(context, style, image, image ? coverPlacement(image, style) : { x: CENTER, y: CENTER, width: INNER * 2 }, false);
    return canvas;
  }

  root.EraserTokenArt = { SIZE, CENTER, INNER, shopFronts, frameOptions, frameOf, drawToken, corners, coverPlacement, renderDefaultToken };
}(typeof globalThis !== 'undefined' ? globalThis : window));
