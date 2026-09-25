/*
 * 通过 Claude 的眼睛 · Through Claude's Eyes
 * A paper cut-out stop-motion film, cut frame by frame in code.
 *
 * Every frame is a pure function of its frame number: Film.render(ctx, F).
 * Nothing is tweened between frames and nothing is stored between calls, so
 * the live player, frame stepping, onion skin and the offline video render
 * all see exactly the same 1080 "photographs" at 12 frames per second.
 */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, FPS = 12;
  const SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif';
  const SANS = '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  const MONO = '"Courier Prime", "Courier New", monospace';
  const BRUSH = '"Ma Shan Zheng", "STKaiti", "KaiTi", "Kaiti SC", serif';

  // Paper stock, named after Chinese mineral pigments.
  const C = {
    xuan: '#F1E7D2',      // 宣纸 rice paper
    page: '#EEDFC1',      // the desk page
    strip: '#F8F1E2',     // caption strips
    back: '#E4D7BC',      // back side of a sheet
    ink: '#26211E',       // 墨 ink
    cinnabar: '#C4412F',  // 朱砂
    gamboge: '#E9A92C',   // 藤黄
    azurite: '#2F5E8C',   // 石青
    azuriteLt: '#86A9C6',
    malachite: '#4E9A78', // 石绿
    pine: '#2E6A55',
    indigo: '#1C2340',    // 靛
    ochre: '#A0613A',     // 赭石
    kraft: '#C79E6E',
    rouge: '#B5495B',     // 胭脂
    moon: '#E4ECE6',      // 月白
    cloud: '#FAF6EC',
  };

  // ───────────────────────── small math ─────────────────────────
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (f, a, b) => clamp((f - a) / (b - a));
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const backOut = (t) => { const s = 1.9; t -= 1; return 1 + (s + 1) * t * t * t + s * t * t; };
  const TAU = Math.PI * 2;

  function hash(a, b, c) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h ^= Math.imul((c | 0) + 0x2545f491, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const rnd = (a, b = 0, c = 0) => hash(a, b, c) / 4294967296;
  const srnd = (a, b = 0, c = 0) => rnd(a, b, c) * 2 - 1;
  function sid(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hex(c) { return '#' + ((1 << 24) | (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])).toString(16).slice(1); }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); }
  const shade = (h, amt) => (amt < 0 ? mix(h, '#000000', -amt) : mix(h, '#ffffff', amt));
  const qbez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  const qbezD = (a, b, c, t) => 2 * (1 - t) * (b - a) + 2 * t * (c - b);

  // The animator's hands are never perfectly steady: a static piece shivers a
  // fraction of a pixel between exposures ("boil").
  function boil(id, f, amp = 1) {
    return { x: srnd(id, f, 1) * 0.55 * amp, y: srnd(id, f, 2) * 0.55 * amp, r: srnd(id, f, 3) * 0.0016 * amp };
  }
  // A moving piece lands a little off its ideal spot every frame.
  const wob = (id, f, p, amp = 0.018) => (p > 0 && p < 1 ? clamp(p + srnd(id, f, 7) * amp, 0, 1) : p);

  // A piece being set down: one frame in the hand (lifted, off-mark), one
  // frame almost down, then resting. Returns null before it enters.
  function placed(id, f, at, dist = 70, dir = null) {
    const t = f - at;
    if (t < -1) return null;
    if (t >= 1) return { dx: 0, dy: 0, rot: 0, lift: 0 };
    const a = dir == null ? rnd(id, 91) * TAU : dir + srnd(id, 91) * 0.7, k = t === -1 ? 1 : 0.22;
    return {
      dx: Math.cos(a) * dist * k,
      dy: Math.sin(a) * dist * k - (t === -1 ? 24 : 4),
      rot: srnd(id, 92) * (t === -1 ? 0.14 : 0.035),
      lift: t === -1 ? 1 : 0.3,
    };
  }
  const blink = (f, half = 6) => Math.floor(f / half) % 2 === 0;

  // ───────────────────────── canvases & paper ─────────────────────────
  let RES = 1;
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * RES));
    c.height = Math.max(1, Math.ceil(h * RES));
    const x = c.getContext('2d');
    x.setTransform(RES, 0, 0, RES, 0, 0);
    return { c, x, w, h };
  }
  const MX = document.createElement('canvas').getContext('2d');
  function measure(font, text) {
    MX.font = font;
    const m = MX.measureText(text);
    return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent, adv: m.width };
  }

  let TEX, GRAIN, LIGHT;
  // Rice-paper grain: soft blotches, fine tooth, and fibres. Tiles seamlessly.
  function makeTex(n, seed) {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d'), r = mulberry(seed);
    const G = 16, grid = Array.from({ length: G * G }, r);
    const g = (i, j) => grid[(j % G) * G + (i % G)];
    const img = x.createImageData(n, n);
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const gx = (px / n) * G, gy = (py / n) * G, x0 = Math.floor(gx), y0 = Math.floor(gy);
        let tx = gx - x0, ty = gy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const coarse = lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
        const v = 128 + (coarse - 0.5) * 34 + (r() - 0.5) * 26;
        const k = (py * n + px) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
        img.data[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 760; i++) {
      const x0 = r() * n, y0 = r() * n, a = r() * TAU, len = 6 + r() * 24, bend = (r() - 0.5) * 9;
      const light = r() < 0.55;
      x.strokeStyle = light ? `rgba(255,255,255,${0.1 + r() * 0.14})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
      x.lineWidth = 0.5 + r() * 0.9;
      for (const ox of [-n, 0, n]) {
        for (const oy of [-n, 0, n]) {
          const sx = x0 + ox, sy = y0 + oy;
          if (sx < -40 || sx > n + 40 || sy < -40 || sy > n + 40) continue;
          x.beginPath();
          x.moveTo(sx, sy);
          x.quadraticCurveTo(
            sx + (Math.cos(a) * len) / 2 - Math.sin(a) * bend, sy + (Math.sin(a) * len) / 2 + Math.cos(a) * bend,
            sx + Math.cos(a) * len, sy + Math.sin(a) * len);
          x.stroke();
        }
      }
    }
    return c;
  }
  function makeGrain(n, seed) {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d'), r = mulberry(seed), img = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 128 + (r() + r() + r() - 1.5) * 92;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  // Rostrum lighting: a warm key light high on the left, falling off to the corners.
  function makeLight() {
    const b = mk(W, H), x = b.x;
    const g = x.createRadialGradient(W * 0.4, H * 0.34, 60, W * 0.5, H * 0.52, W * 0.8);
    g.addColorStop(0, 'rgba(255,238,210,0.10)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(12,7,2,0.42)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    return b;
  }
  function pat(x, img, seed = 0) {
    const p = x.createPattern(img, 'repeat');
    if (seed && p.setTransform) p.setTransform(new DOMMatrix([1, 0, 0, 1, seed % 509, (seed >>> 9) % 499]));
    return p;
  }
  const scaleOf = (x) => { const m = x.getTransform(); return Math.hypot(m.a, m.b); };

  // Fill a cut-paper shape: drop shadow on the sheet below, then paper tooth.
  // `lift` raises it off the table (in the animator's hand).
  function paperFill(x, path, color, o = {}) {
    const lift = o.lift || 0, el = o.elev ?? 1, k = scaleOf(x);
    x.save();
    if (o.shadow !== false) {
      x.shadowColor = `rgba(18,10,4,${((o.shadowAlpha ?? 0.36) * (1 - lift * 0.3)).toFixed(3)})`;
      x.shadowBlur = (5 + 8 * el + lift * 24) * k;
      x.shadowOffsetX = (2 + 3 * el + lift * 18) * k;
      x.shadowOffsetY = (3 + 5 * el + lift * 28) * k;
    }
    x.fillStyle = color;
    x.fill(path);
    x.restore();
    if (o.tex !== 0) {
      x.save();
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = o.tex ?? 0.5;
      x.fillStyle = pat(x, TEX, o.seed || 1);
      x.fill(path);
      x.restore();
    }
    if (o.edge) {
      x.save();
      x.strokeStyle = o.edge;
      x.lineWidth = o.edgeW ?? 1.5;
      x.stroke(path);
      x.restore();
    }
  }
  // A strip of paper laid along a path (threads, lid lines, speed lines).
  function paperStroke(x, path, color, width, o = {}) {
    const k = scaleOf(x);
    x.save();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.shadowColor = `rgba(18,10,4,${o.shadowAlpha ?? 0.3})`;
    x.shadowBlur = (o.blur ?? 5) * k;
    x.shadowOffsetX = (o.off ?? 3) * k;
    x.shadowOffsetY = (o.off ?? 3) * 1.5 * k;
    x.strokeStyle = color;
    x.lineWidth = width;
    x.stroke(path);
    x.restore();
  }

  function roughPoly(pts, seed, amp, seg = 34) {
    const p = new Path2D(), r = mulberry(seed);
    let first = true;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.round(len / seg));
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let k = 0; k < n; k++) {
        const t = k / n, j = k === 0 ? 0 : (r() - 0.5) * 2 * amp;
        const px = ax + (bx - ax) * t + nx * j, py = ay + (by - ay) * t + ny * j;
        if (first) p.moveTo(px, py); else p.lineTo(px, py);
        first = false;
      }
    }
    p.closePath();
    return p;
  }
  const roughRect = (x0, y0, w, h, seed, amp = 1.5) => roughPoly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], seed, amp);
  function roughCircle(cx, cy, rad, seed, amp = 1.8, n = 56) {
    const p = new Path2D(), r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, rr = rad + (r() - 0.5) * 2 * amp;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i) p.lineTo(px, py); else p.moveTo(px, py);
    }
    p.closePath();
    return p;
  }
  // A band of paper torn along its top edge, running off both sides of frame.
  function tornBand(top, bottom, seed, amp, x0 = -80, x1 = W + 80) {
    const p = new Path2D(), r = mulberry(seed), ph = r() * 10, ph2 = r() * 10;
    p.moveTo(x0, bottom);
    for (let px = x0; px <= x1; px += 12) {
      const wave = Math.sin(px * 0.0042 + ph) * amp * 1.5 + Math.sin(px * 0.013 + ph2) * amp * 0.55;
      p.lineTo(px, top + wave + (r() - 0.5) * amp * 0.8);
    }
    p.lineTo(x1, bottom);
    p.closePath();
    return p;
  }
  // Add a clockwise polygon (so overlapping pieces union under nonzero fill).
  function addPoly(p, pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const q = area < 0 ? pts.slice().reverse() : pts;
    p.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < q.length; i++) p.lineTo(q[i][0], q[i][1]);
    p.closePath();
  }
  const PC = new Map();
  function cached(key, fn) { let v = PC.get(key); if (!v) { v = fn(); PC.set(key, v); } return v; }

  // ── sprites: pieces cut once, then moved around the table ──
  const SPR = new Map();
  function finish(b, seed, tex) {
    const { c, x, w, h } = b;
    const mask = document.createElement('canvas');
    mask.width = c.width;
    mask.height = c.height;
    mask.getContext('2d').drawImage(c, 0, 0);
    x.save();
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = tex;
    x.fillStyle = pat(x, TEX, seed);
    x.fillRect(0, 0, w, h);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'soft-light';
    const g = x.createLinearGradient(0, 0, w * 0.6, h);
    g.addColorStop(0, 'rgba(255,250,240,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mask, 0, 0);
    x.restore();
  }
  function bakeShadow(b, blur) {
    const pad = Math.ceil(blur * 2 + 4);
    const s = mk(b.w + pad * 2, b.h + pad * 2), off = s.c.width + 200;
    s.x.setTransform(1, 0, 0, 1, 0, 0);
    s.x.shadowColor = '#000';
    s.x.shadowBlur = blur * RES;
    s.x.shadowOffsetX = off;
    s.x.drawImage(b.c, pad * RES - off, pad * RES);
    return { c: s.c, pad };
  }
  // A character cut out of coloured paper. `rim` leaves a margin of a second
  // paper around it, the way a child cuts a sticker.
  function glyph(text, o) {
    const key = ['G', text, o.size, o.weight ?? 900, o.family ?? 's', o.fill, o.rim ?? '', o.rimW ?? ''].join('|');
    let s = SPR.get(key);
    if (s) return s;
    const font = `${o.weight ?? 900} ${o.size}px ${o.family ?? SERIF}`;
    const rimW = o.rim ? o.rimW ?? Math.max(3, Math.round(o.size * 0.045)) : 0;
    const m = measure(font, text);
    const pad = Math.ceil(rimW + 6);
    const gw = m.l + m.r, gh = m.a + m.d;
    const w = Math.ceil(gw + pad * 2), h = Math.ceil(gh + pad * 2);
    const b = mk(w, h), x = b.x;
    x.font = font;
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.lineJoin = 'round';
    const ox = pad + m.l, oy = pad + m.a;
    if (rimW) {
      x.strokeStyle = shade(o.rim, -0.22);
      x.lineWidth = rimW * 2 + 2;
      x.strokeText(text, ox, oy);
      x.strokeStyle = o.rim;
      x.lineWidth = rimW * 2;
      x.strokeText(text, ox, oy);
      x.fillStyle = o.rim;
      x.fillText(text, ox, oy);
    } else {
      x.strokeStyle = shade(o.fill, -0.3);
      x.lineWidth = o.edgeW ?? 2;
      x.strokeText(text, ox, oy);
    }
    x.fillStyle = o.fill;
    x.fillText(text, ox, oy);
    finish(b, sid(key), o.tex ?? 0.55);
    s = { c: b.c, w, h, gw, gh, sh: bakeShadow(b, o.blur ?? Math.max(5, o.size * 0.022)) };
    SPR.set(key, s);
    return s;
  }
  // Put a sprite on the table, centred on (px, py).
  function put(x, s, px, py, o = {}) {
    const lift = o.lift || 0, rot = o.rot || 0, a = o.alpha ?? 1;
    const sc = (o.scale ?? 1) * (1 + lift * 0.05), sx = o.sx ?? 1, sy = o.sy ?? 1;
    if (o.shadow !== false) {
      const d = o.elev ?? 1;
      const dx = 2 + 4 * d + lift * 20, dy = 4 + 6 * d + lift * 30;
      x.save();
      x.globalAlpha = a * (o.shadowAlpha ?? 0.5) * (1 - lift * 0.35);
      x.translate(px + dx, py + dy);
      x.rotate(rot);
      x.scale(sc * sx * (1 + lift * 0.03), sc * sy * (1 + lift * 0.03));
      x.drawImage(s.sh.c, -s.w / 2 - s.sh.pad, -s.h / 2 - s.sh.pad, s.w + s.sh.pad * 2, s.h + s.sh.pad * 2);
      x.restore();
    }
    x.save();
    x.globalAlpha = a;
    x.translate(px, py);
    x.rotate(rot);
    x.scale(sc * sx, sc * sy);
    x.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    x.restore();
  }

  // Full sheets of paper for the table top.
  const BG = new Map();
  function bg(x, color) {
    let b = BG.get(color);
    if (!b) {
      b = mk(W + 60, H + 60);
      const y = b.x, r = mulberry(sid(color));
      y.fillStyle = color;
      y.fillRect(0, 0, W + 60, H + 60);
      y.globalCompositeOperation = 'overlay';
      y.globalAlpha = 0.6;
      y.fillStyle = pat(y, TEX, sid(color));
      y.fillRect(0, 0, W + 60, H + 60);
      y.globalAlpha = 1;
      y.globalCompositeOperation = 'soft-light';
      for (let i = 0; i < 18; i++) {
        const cx = r() * (W + 60), cy = r() * (H + 60), rad = 120 + r() * 380;
        const g = y.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, r() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        y.fillStyle = g;
        y.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
      y.globalCompositeOperation = 'source-over';
      BG.set(color, b);
    }
    x.drawImage(b.c, -30, -30, W + 60, H + 60);
  }
  function texOverlay(x, x0, y0, w, h, alpha, seed) {
    x.save();
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = alpha;
    x.fillStyle = pat(x, TEX, seed);
    x.fillRect(x0, y0, w, h);
    x.restore();
  }
  function dim(x, a) {
    if (!(a > 0)) return;
    x.save();
    x.setTransform(RES, 0, 0, RES, 0, 0);
    x.fillStyle = `rgba(6,5,10,${a})`;
    x.fillRect(0, 0, W, H);
    x.restore();
  }
  // Claude's eye in this film: a blinking cursor cut from gamboge paper.
  function cursor(x, cx, cy, f, id, h = 132, w = 28) {
    const b = boil(id, f);
    const p = cached(`cur${w}x${h}`, () => roughRect(-w / 2, -h / 2, w, h, 17 + h, 1));
    x.save();
    x.translate(cx + b.x, cy + b.y);
    x.rotate(b.r);
    paperFill(x, p, C.gamboge, { seed: 17 });
    x.restore();
  }

  // ───────────────────────── scene nesting ─────────────────────────
  let DEPTH = 0;
  const DB = [];
  const FROZEN = new Map();
  // Render another scene into a scratch sheet (for transitions and reveals).
  function live(id, f) {
    const d = DEPTH;
    const b = DB[d] || (DB[d] = mk(W, H));
    b.x.setTransform(RES, 0, 0, RES, 0, 0);
    b.x.clearRect(0, 0, W, H);
    DEPTH++;
    try { SCENE[id].draw(b.x, f); } finally { DEPTH--; }
    return b;
  }
  function frozen(id, f) {
    const key = id + '@' + f;
    let b = FROZEN.get(key);
    if (!b) {
      b = mk(W, H);
      DEPTH++;
      try { SCENE[id].draw(b.x, f); } finally { DEPTH--; }
      FROZEN.set(key, b);
    }
    return b;
  }

  // ───────────────────────── layout (after fonts load) ─────────────────────────
  const TITLE = '通过 Claude 的眼睛';
  const MESSAGE = '你眼中的世界，是什么样子？';
  const TOKENS = ['你', '眼中', '的', '世界', '，', '是', '什么', '样子', '？'];
  const TOKEN_IDS = ['#53901', '#88412', '#9370', '#40219', '#3922', '#11537', '#56092', '#71804', '#29711'];
  const TOKEN_PAPER = [
    [C.cinnabar, C.xuan], [C.azurite, C.xuan], [C.ochre, C.xuan], [C.malachite, C.xuan], [C.moon, C.ink],
    [C.gamboge, C.ink], [C.rouge, C.xuan], ['#7FA3C4', C.ink], ['#3A4478', C.xuan],
  ];
  const L = {};

  function lineLayout(text, font, cx, baseline) {
    MX.font = font;
    const chars = [...text], total = MX.measureText(text).width, x0 = cx - total / 2;
    const out = chars.map((ch, i) => {
      const pre = MX.measureText(chars.slice(0, i).join('')).width;
      const m = measure(font, ch);
      return { ch, pen: x0 + pre, adv: m.adv, cx: x0 + pre + (m.r - m.l) / 2, cy: baseline - (m.a - m.d) / 2 };
    });
    return { chars: out, total, x0, baseline };
  }

  function layout() {
    L.title = lineLayout(TITLE, `900 150px ${SERIF}`, 960, 560);
    let k = 0;
    L.title.order = L.title.chars.map((c) => (c.ch === ' ' ? -1 : k++));
    L.title.count = k;

    L.tokFont = `500 92px ${SANS}`;
    MX.font = L.tokFont;
    let pen = 0;
    L.tok = TOKENS.map((t, i) => { const w = MX.measureText(t).width; const o = { t, i, x0: pen, w }; pen += w; return o; });
    L.tokTotal = pen;
    L.tokPad = 34;
    L.tokH = 146;
    for (const t of L.tok) {
      t.l = t.x0 - (t.i === 0 ? L.tokPad : 0);
      t.r = t.x0 + t.w + (t.i === TOKENS.length - 1 ? L.tokPad : 0);
      t.c = (t.l + t.r) / 2;         // tile centre, strip coordinates
      t.tx = t.x0 + t.w / 2 - t.c;   // text centre relative to the tile centre
    }

    // The question, typed into a chat bubble at 0.8x the token-stage size.
    const s = 0.8, bw = L.tokTotal * s + 2 * 58, bh = 160;
    L.msg = { s, bubble: { x: 1690 - bw, y: 372, w: bw, h: bh } };
    L.msg.x0 = L.msg.bubble.x + 58;
    L.msg.cy = L.msg.bubble.y + bh / 2;
  }

  // ───────────────────────── shared pieces ─────────────────────────
  function bubblePath(B, side, r = 36) {
    const p = new Path2D();
    p.roundRect(B.x, B.y, B.w, B.h, r);
    if (side === 'right') addPoly(p, [[B.x + B.w - 86, B.y + B.h - 2], [B.x + B.w + 30, B.y + B.h + 30], [B.x + B.w - 26, B.y + B.h - 44]]);
    else addPoly(p, [[B.x + 40, B.y + 2], [B.x - 30, B.y - 22], [B.x + 2, B.y + 64]]);
    return p;
  }
  function avatarYou(x, cx, cy, f, r = 40) {
    const b = boil(610, f);
    x.save();
    x.translate(cx + b.x, cy + b.y);
    paperFill(x, cached('av' + r, () => roughCircle(0, 0, r, 611, 1.2)), C.cinnabar, { seed: 611 });
    x.font = `700 ${Math.round(r * 1.05)}px ${SERIF}`;
    x.fillStyle = C.xuan;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('你', 0, 2);
    x.restore();
  }
  function avatarClaude(x, cx, cy, f, r = 40) {
    const b = boil(620, f);
    x.save();
    x.translate(cx + b.x, cy + b.y);
    paperFill(x, cached('avc' + r, () => roughCircle(0, 0, r, 621, 1.2)), C.indigo, { seed: 621 });
    const cur = cached('avcur' + r, () => roughRect(-r * 0.13, -r * 0.46, r * 0.26, r * 0.92, 622, 0.6));
    paperFill(x, cur, C.gamboge, { seed: 622, elev: 0.3 });
    x.restore();
  }
  // One token tile. `colored` shows the pigment side (after the flip).
  function tile(x, i, px, py, o = {}) {
    const t = L.tok[i], h = L.tokH, sy = o.sy ?? 1, col = !!o.colored;
    const w = col ? t.w + 28 : t.r - t.l;
    x.save();
    x.translate(px, py);
    x.rotate(o.rot || 0);
    x.scale(1, sy);
    const [paper, ink] = col ? TOKEN_PAPER[i] : [C.strip, C.ink];
    paperFill(x, cached((col ? 'tileC' : 'tile') + i, () => roughRect(-w / 2, -h / 2, w, h, 900 + i, 1.3)), paper, { seed: 900 + i, lift: o.lift });
    if (Math.abs(sy) > 0.18) {
      x.font = L.tokFont;
      x.fillStyle = ink;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(t.t, col ? 0 : t.tx, 5);
    }
    x.restore();
  }
  // A strip piece covering tokens a..b (inclusive), before it is cut apart.
  function stripPiece(x, a, b, px, py, o = {}) {
    const ta = L.tok[a], tb = L.tok[b], w = tb.r - ta.l, h = L.tokH;
    x.save();
    x.translate(px, py);
    x.rotate(o.rot || 0);
    x.scale(o.s ?? 1, o.s ?? 1);
    paperFill(x, cached(`strip${a}-${b}`, () => roughRect(-w / 2, -h / 2, w, h, 950 + a * 16 + b, 1.3)), C.strip, { seed: 950 + a, lift: o.lift });
    x.font = L.tokFont;
    x.fillStyle = C.ink;
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    const left = -w / 2 - ta.l;
    for (let i = a; i <= b; i++) x.fillText(L.tok[i].t, left + L.tok[i].x0, 5);
    x.restore();
  }
  function idTag(x, i, px, py, rot, lift) {
    const w = Math.round(measure(`700 30px ${MONO}`, TOKEN_IDS[i]).adv + 30), h = 50;
    x.save();
    x.translate(px, py);
    x.rotate(rot);
    paperFill(x, cached('tag' + i, () => roughRect(-w / 2, -h / 2, w, h, 980 + i, 1)), C.xuan, { seed: 980 + i, lift, elev: 0.7 });
    x.font = `700 30px ${MONO}`;
    x.fillStyle = C.ink;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(TOKEN_IDS[i], 0, 2);
    x.restore();
  }
  function pin(x, px, py, id) {
    const k = scaleOf(x);
    x.save();
    x.shadowColor = 'rgba(18,10,4,0.45)';
    x.shadowBlur = 5 * k;
    x.shadowOffsetX = 3 * k;
    x.shadowOffsetY = 5 * k;
    x.fillStyle = C.gamboge;
    x.beginPath();
    x.arc(px, py, 12, 0, TAU);
    x.fill();
    x.restore();
    x.fillStyle = 'rgba(255,248,230,0.8)';
    x.beginPath();
    x.arc(px - 4, py - 4, 3.6, 0, TAU);
    x.fill();
  }

  // Red-handled scissors, cut from paper, pointing up. `th` opens the blades.
  function scissors(x, px, py, th) {
    x.save();
    x.translate(px, py);
    for (const s of [-1, 1]) {
      x.save();
      x.rotate(s * th);
      const blade = cached('blade' + s, () => {
        const p = new Path2D();
        p.moveTo(0, 12);
        p.lineTo(s * 15, 6);
        p.quadraticCurveTo(s * 19, -130, 0, -236);
        p.closePath();
        return p;
      });
      paperFill(x, blade, s < 0 ? '#AFB7BC' : '#C2C9CD', { seed: 410 + s, elev: 1.4, tex: 0.25 });
      const handle = cached('handle' + s, () => {
        const p = new Path2D();
        addPoly(p, [[-6, 4], [6, 4], [-s * 30 + 12, 92], [-s * 30 - 12, 92]]);
        p.moveTo(-s * 30 + 40, 128);
        p.arc(-s * 30, 128, 40, 0, TAU);
        p.moveTo(-s * 30 + 24, 128);
        p.arc(-s * 30, 128, 24, 0, TAU, true);
        return p;
      });
      paperFill(x, handle, C.cinnabar, { seed: 420 + s, elev: 1.4 });
      x.restore();
    }
    x.fillStyle = '#5A5550';
    x.beginPath();
    x.arc(0, 0, 9, 0, TAU);
    x.fill();
    x.restore();
  }

  // A pale celadon cutting mat with a printed centimetre grid.
  const MAT = { x: 110, y: 58, w: 1700, h: 836 };
  function cuttingMat(x, oy = 0) {
    const path = cached('mat', () => roughRect(MAT.x, MAT.y, MAT.w, MAT.h, 2001, 1.2));
    x.save();
    x.translate(0, oy);
    paperFill(x, path, '#D8DDCB', { seed: 2001, elev: 0.7 });
    x.save();
    x.clip(path);
    const grid = (step, alpha, width) => {
      x.strokeStyle = `rgba(46,106,85,${alpha})`;
      x.lineWidth = width;
      x.beginPath();
      for (let gx = MAT.x + step; gx < MAT.x + MAT.w; gx += step) { x.moveTo(gx, MAT.y); x.lineTo(gx, MAT.y + MAT.h); }
      for (let gy = MAT.y + step; gy < MAT.y + MAT.h; gy += step) { x.moveTo(MAT.x, gy); x.lineTo(MAT.x + MAT.w, gy); }
      x.stroke();
    };
    grid(40, 0.13, 1.2);
    grid(200, 0.24, 2);
    x.strokeStyle = 'rgba(46,106,85,0.2)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(MAT.x, MAT.y + MAT.h);
    x.lineTo(MAT.x + MAT.h, MAT.y);
    x.stroke();
    x.fillStyle = 'rgba(46,106,85,0.5)';
    x.font = `700 17px ${MONO}`;
    x.textAlign = 'center';
    x.textBaseline = 'top';
    for (let i = 1; i * 40 < MAT.w - 20; i++) if (i % 5 === 0) x.fillText(String(i), MAT.x + i * 40, MAT.y + 8);
    x.restore();
    x.restore();
  }

  // ───────────────────────── 1 · 空白 The blank ─────────────────────────
  function sVoid(x, f) {
    bg(x, C.indigo);
    if (blink(f)) cursor(x, 960, 500, f, 1);
  }

  // ───────────────────────── 2 · 片名 Title ─────────────────────────
  function sTitle(x, f) {
    bg(x, C.indigo);
    const T = L.title;
    let last = -1;
    T.chars.forEach((c, i) => {
      const k = T.order[i];
      if (k < 0) return;
      const at = 4 + k * 3, pl = placed(300 + i, f, at, 46, -Math.PI / 2);
      if (!pl) return;
      const b = boil(300 + i, f);
      put(x, glyph(c.ch, { size: 150, fill: C.xuan }), c.cx + pl.dx + b.x, c.cy + pl.dy + b.y, { rot: pl.rot + b.r, lift: pl.lift });
      if (f >= at) last = i;
    });
    const typing = f < 4 + T.count * 3 + 3;
    const cx = last < 0 ? T.x0 - 30 : T.chars[last].pen + T.chars[last].adv + 30;
    if (typing || blink(f)) cursor(x, cx, T.baseline - 56, f, 2, 150, 26);
    const sp = placed(399, f, 42);
    if (sp) {
      const b = boil(399, f);
      put(x, glyph('一部纸片定格动画', { size: 58, weight: 700, fill: C.gamboge }), 960 + sp.dx + b.x, 712 + sp.dy + b.y, { rot: sp.rot + b.r, lift: sp.lift });
    }
    dim(x, [0.22, 0.48, 0.74, 0.92][f - 56]);
  }

  // ───────────────────────── 3 · 目 The eye ─────────────────────────
  const EYE = { cx: 960, cy: 470, w: 800, h: 340 };
  const Z0 = 90, Z1 = 106;
  function eyeLook(f) {
    if (f < 52) return 0;
    if (f < 64) return -80 * easeIO(prog(f, 52, 56));
    if (f < 76) return lerp(-80, 80, easeIO(prog(f, 64, 68)));
    return lerp(80, 0, easeIO(prog(f, 76, 80)));
  }
  function eyeOpen(f) {
    if (f >= 83 && f <= 87) return [1, 0.3, -0.86, 0.15, 0.85][f - 83];
    return 1;
  }
  function drawEye(x, f) {
    const { cx, cy, w, h } = EYE, open = eyeOpen(f), look = eyeLook(f);
    const sc = lerp(0.5, 1, backOut(prog(f, 48, 53)));
    const b = boil(510, f);
    x.save();
    x.translate(cx + b.x, cy + b.y);
    x.scale(sc, sc);
    const up = -h * open, lo = h * 0.86;
    if (open > -0.8) {
      const white = new Path2D();
      white.moveTo(-w / 2, 0);
      white.quadraticCurveTo(0, up, w / 2, 0);
      white.quadraticCurveTo(0, lo, -w / 2, 0);
      white.closePath();
      paperFill(x, white, C.xuan, { seed: 511 });
      x.save();
      x.clip(white);
      paperFill(x, cached('iris', () => roughCircle(0, 0, 150, 512, 1.5)), C.azurite, { seed: 512, elev: 0.6 });
      x.save();
      x.translate(look, 6);
      paperFill(x, cached('iris2', () => roughCircle(0, 0, 106, 513, 1.2)), '#1E3C60', { seed: 513, elev: 0.4 });
      if (f >= Z0 || f % 12 < 8) paperFill(x, cached('pupil', () => roughRect(-17, -72, 34, 144, 514, 1)), C.gamboge, { seed: 514, elev: 0.5 });
      paperFill(x, cached('glint', () => roughCircle(-70, -60, 20, 515, 1)), C.xuan, { seed: 515, elev: 0.3 });
      x.restore();
      x.restore();
    }
    const lid = new Path2D();
    const y1 = open > -0.8 ? up - 10 : lo;
    lid.moveTo(-w / 2 - 14, 2);
    lid.quadraticCurveTo(0, y1, w / 2 + 14, 2);
    paperStroke(x, lid, C.cinnabar, 14, { off: 3 });
    x.restore();
  }
  function sEye(x, f) {
    bg(x, C.indigo);
    const px = EYE.cx + eyeLook(f), py = EYE.cy + 6;
    x.save();
    if (f >= Z0) {
      const z = Math.exp(Math.log(95) * easeIn(prog(f, Z0, Z1)));
      x.translate(px, py);
      x.scale(z, z);
      x.translate(-px, -py);
    }
    if (f < 48) {
      const pl = placed(500, f, 2, 90);
      if (pl) {
        const turn = wob(501, f, easeIO(prog(f, 30, 46)), 0.03);
        const b = boil(500, f);
        put(x, glyph('目', { size: 440, fill: C.xuan }), EYE.cx + pl.dx + b.x, EYE.cy + pl.dy + b.y, { rot: -Math.PI / 2 * turn + pl.rot + b.r, lift: pl.lift });
      }
    } else {
      drawEye(x, f);
    }
    x.restore();
    if (f >= Z1 - 1) { x.fillStyle = C.gamboge; x.fillRect(-30, -30, W + 60, H + 60); }
  }

  // ───────────────────────── 4 · 一句话 The question ─────────────────────────
  const TYPE0 = 12, PEEL = 56;
  function sMessage(x, f) {
    bg(x, C.page);
    if (f >= PEEL) cuttingMat(x, 1000 * (1 - easeOut(wob(655, f, prog(f, PEEL, PEEL + 9)))));
    const M = L.msg, B = M.bubble;
    let bx = 0;
    if (f < 10) bx = (1 - backOut(prog(f, 0, 9))) * 1250;
    if (f > PEEL + 1) bx = 1600 * easeIn(prog(f, PEEL + 1, PEEL + 12));
    const lift = f < 8 ? 0.6 : 0;
    x.save();
    x.translate(bx, 0);
    avatarYou(x, B.x + B.w + 92, B.y + B.h + 6, f);
    paperFill(x, cached('bubbleQ', () => bubblePath(B, 'right')), '#D3DFE8', { seed: 601, lift });
    x.restore();
    if (f < PEEL) {
      const typed = clamp(f - TYPE0 + 1, 0, TOKENS.join('').length);
      x.font = `500 ${92 * M.s}px ${SANS}`;
      x.fillStyle = C.ink;
      x.textAlign = 'left';
      x.textBaseline = 'middle';
      const chars = [...MESSAGE];
      MX.font = x.font;
      for (let i = 0; i < typed; i++) {
        const pre = MX.measureText(chars.slice(0, i).join('')).width;
        const fresh = i === typed - 1 && f - TYPE0 < chars.length;
        const b = boil(640 + i, f, fresh ? 3 : 0.6);
        x.save();
        x.translate(M.x0 + bx + pre + b.x, M.cy + 4 + b.y - (fresh ? 7 : 0));
        x.rotate(b.r * 6);
        if (fresh) { x.shadowColor = 'rgba(18,10,4,0.35)'; x.shadowBlur = 8 * scaleOf(x); x.shadowOffsetY = 10 * scaleOf(x); }
        x.fillText(chars[i], 0, 0);
        x.restore();
      }
    } else {
      // Peel the sentence off the bubble and carry it to the cutting mat.
      const p = wob(650, f, easeIO(prog(f, PEEL, PEEL + 12)));
      const fromX = M.x0 + (L.tokTotal * M.s) / 2, fromY = M.cy;
      stripPiece(x, 0, TOKENS.length - 1, lerp(fromX, 960, p), lerp(fromY, TOKY, p) - Math.sin(p * Math.PI) * 60,
        { s: lerp(M.s, 1, p), lift: p < 1 ? 0.35 + Math.sin(p * Math.PI) * 0.6 : 0, rot: Math.sin(p * Math.PI) * -0.05 });
    }
    if (f < 3) {
      x.fillStyle = C.gamboge;
      x.globalAlpha = [0.85, 0.5, 0.2][f];
      x.fillRect(-30, -30, W + 60, H + 60);
      x.globalAlpha = 1;
    }
  }

  // ───────────────────────── 5 · 词元 Tokens ─────────────────────────
  const CUT0 = 14, CUTS = 5, NCUT = TOKENS.length - 1, FLIP0 = 60, TAG0 = 70;
  function tokOffsets(f) {
    const spread = lerp(22, 46, easeIO(prog(f, 52, 58)));
    let acc = 0;
    const dx = [0];
    for (let k = 0; k < NCUT; k++) {
      const t = f - (CUT0 + k * CUTS);
      acc += t < 0 ? 0 : t === 0 ? spread * 0.35 : spread;
      dx.push(acc);
    }
    return dx.map((d) => d - acc / 2);
  }
  const TOKY = 462;
  function tokPos(i, f) {
    const dx = tokOffsets(f), left = 960 - L.tokTotal / 2;
    const cut = (k) => f >= CUT0 + k * CUTS;
    const free = (i === 0 || cut(i - 1)) && (i === NCUT || cut(i));
    return { x: left + L.tok[i].c + dx[i], y: TOKY, rot: free ? srnd(i, 31) * 0.028 : 0 };
  }
  function scissorsAt(f) {
    const left = 960 - L.tokTotal / 2, dx = tokOffsets(f);
    const bx = (k) => left + L.tok[k + 1].x0 + (dx[k] + dx[k + 1]) / 2;
    const PY = 650;
    if (f < 8) return null;
    if (f < 12) return { x: bx(0), y: lerp(1320, PY, easeOut(prog(f, 8, 11))), th: 0.36 };
    const last = CUT0 + (NCUT - 1) * CUTS;
    if (f > last + 1) {
      if (f > last + 8) return null;
      return { x: bx(NCUT - 1) + 30, y: lerp(PY, 1340, easeIn(prog(f, last + 1, last + 7))), th: 0.3 };
    }
    let k = clamp(Math.ceil((f - CUT0) / CUTS), 0, NCUT - 1);
    const c = CUT0 + k * CUTS, t = f - c;
    let xPos = bx(k);
    if (t <= -3 && k > 0) xPos = lerp(bx(k - 1), bx(k), 0.5);
    const th = t === 0 ? 0.015 : t === -1 ? 0.4 : t === 1 ? 0.2 : 0.34;
    return { x: xPos + srnd(k, f, 3) * 2, y: PY + srnd(k, f, 4) * 3, th };
  }
  function flipState(i, f) {
    const t = f - (FLIP0 + Math.round(i * 1.5));
    if (t < 0) return { sy: 1, colored: false, lift: 0 };
    if (t === 0) return { sy: 0.5, colored: false, lift: 0.5 };
    if (t === 1) return { sy: 0.1, colored: false, lift: 0.7 };
    if (t === 2) return { sy: 0.55, colored: true, lift: 0.5 };
    return { sy: 1, colored: true, lift: 0 };
  }
  function sTokens(x, f) {
    bg(x, C.page);
    cuttingMat(x);
    const cut = (k) => f >= CUT0 + k * CUTS;
    // contiguous groups between completed cuts
    let a = 0;
    for (let i = 0; i < TOKENS.length; i++) {
      if (i === NCUT || cut(i)) {
        const b = boil(700 + a, f);
        if (a === i) {
          const p = tokPos(i, f), fs = flipState(i, f);
          tile(x, i, p.x + b.x, p.y + b.y, { rot: p.rot + b.r, sy: fs.sy, colored: fs.colored, lift: fs.lift });
        } else {
          const pa = tokPos(a, f), pb = tokPos(i, f);
          const cxs = (pa.x - L.tok[a].c + L.tok[a].l + pb.x - L.tok[i].c + L.tok[i].r) / 2;
          stripPiece(x, a, i, cxs + b.x, TOKY + b.y, { rot: b.r });
        }
        a = i + 1;
      }
    }
    for (let i = 0; i < TOKENS.length; i++) {
      const pl = placed(720 + i, f, TAG0 + i, 50);
      if (!pl) continue;
      const p = tokPos(i, f), b = boil(720 + i, f);
      idTag(x, i, p.x + pl.dx + b.x, p.y + L.tokH / 2 + 44 + pl.dy + b.y, srnd(i, 41) * 0.05 + pl.rot, pl.lift);
    }
    const sc = scissorsAt(f);
    if (sc) scissors(x, sc.x, sc.y, sc.th);
  }

  // ───────────────────────── 6 · 注意力 Attention ─────────────────────────
  const ATT_POS = [180, 218, 258, 295, 335, 25, 65, 102, 142].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [Math.round(960 + 690 * Math.cos(a)), Math.round(440 + 290 * Math.sin(a))];
  });
  // Each later piece looks back at earlier pieces: [from, to, strength].
  const THREADS = [[1, 0, 0.9], [2, 1, 0.6], [3, 1, 0.8], [3, 2, 0.5], [4, 3, 0.35], [5, 3, 0.7], [5, 0, 0.45], [6, 5, 0.6], [7, 6, 0.9], [7, 3, 0.75], [7, 1, 0.5], [8, 6, 0.8], [8, 0, 0.55], [8, 7, 0.5]];
  const TH0 = 20;
  function attTile(i, f) {
    const from = tokPos(i, 96), to = ATT_POS[i];
    const p = wob(760 + i, f, easeIO(prog(f, 1 + i * 0.7, 12 + i * 0.7)), 0.025);
    const rot = lerp(from.rot, srnd(i, 51) * 0.07, p);
    return { x: lerp(from.x, to[0], p), y: lerp(from.y, to[1], p) - Math.sin(p * Math.PI) * 40, rot, lift: p > 0 && p < 1 ? 0.5 : 0 };
  }
  function pinPos(t) {
    const oy = -L.tokH / 2 + 16;
    return { x: t.x - Math.sin(t.rot) * oy, y: t.y + Math.cos(t.rot) * oy };
  }
  function threadPath(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return { ax: a.x, ay: a.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 + d * 0.14, bx: b.x, by: b.y };
  }
  function sAttention(x, f) {
    bg(x, C.page);
    cuttingMat(x);
    const T = TOKENS.map((_, i) => attTile(i, f));
    T.forEach((t, i) => {
      const b = boil(800 + i, f);
      tile(x, i, t.x + b.x, t.y + b.y, { rot: t.rot + b.r, colored: true, lift: t.lift });
      const oy = L.tokH / 2 + 44;
      idTag(x, i, t.x - Math.sin(t.rot) * oy + b.x, t.y + Math.cos(t.rot) * oy + b.y, t.rot + srnd(i, 41) * 0.05, t.lift);
    });
    const P = T.map(pinPos);
    THREADS.forEach(([j, i, w], k) => {
      const p = prog(f, TH0 + k * 2, TH0 + k * 2 + 4);
      if (p <= 0) return;
      const q = threadPath(P[j], P[i]);
      const path = new Path2D();
      path.moveTo(q.ax, q.ay);
      // draw from the later piece back towards the earlier one
      const steps = 24, n = Math.max(1, Math.round(steps * p));
      for (let s = 1; s <= n; s++) {
        const t = (s / steps);
        path.lineTo(qbez(q.ax, q.cx, q.bx, t), qbez(q.ay, q.cy, q.by, t));
      }
      paperStroke(x, path, '#B8352A', 2 + w * 4.5, { off: 2.5, blur: 3, shadowAlpha: 0.28 });
    });
    P.forEach((p, i) => { if (f >= 13 + i) pin(x, p.x, p.y, i); });
    if (f >= 58 && f < 90) {
      THREADS.forEach(([j, i], k) => {
        const u = ((f - 58) / 10 + k * 0.37) % 1;
        const q = threadPath(P[j], P[i]);
        const t = 1 - u;   // travel forward: from the earlier piece to the later one
        const bx = qbez(q.ax, q.cx, q.bx, t), by = qbez(q.ay, q.cy, q.by, t);
        const kk = scaleOf(x);
        x.save();
        x.shadowColor = 'rgba(18,10,4,0.4)';
        x.shadowBlur = 4 * kk;
        x.shadowOffsetX = 2 * kk;
        x.shadowOffsetY = 4 * kk;
        x.fillStyle = C.gamboge;
        x.beginPath();
        x.arc(bx, by, 8, 0, TAU);
        x.fill();
        x.restore();
      });
    }
  }

  // ───────────────────────── 7 · 字的世界 A world of characters ─────────────────────────
  const SKY = {
    dawn: ['#D9DED6', '#EEDCC2', '#F3C9A0', '#EFAE84'],
    day: ['#C3D8E0', '#D9E6E1', '#ECE7D3', '#F2DFBA'],
    dusk: ['#474A7E', '#8E6F96', '#D98C7A', '#F0A868'],
    gold: ['#F2CF78', '#F5DB98', '#F8E6BA', '#FAF0D5'],
  };
  const MERGE0 = 214, MERGE1 = 232;
  function skyAt(f) {
    let a = SKY.dawn, b = SKY.day, t;
    if (f < 30) t = 0;
    else if (f < 70) t = Math.floor(prog(f, 30, 70) * 5) / 5;
    else if (f < 170) t = 1;
    else if (f < MERGE1) { a = SKY.day; b = SKY.dusk; t = Math.floor(prog(f, 170, 204) * 6) / 6; }
    else { a = SKY.dusk; b = SKY.gold; t = Math.floor(prog(f, MERGE1, MERGE1 + 5) * 4) / 4; }
    return a.map((c, i) => mix(c, b[i], t));
  }
  const duskAt = (f) => (f < 170 || f >= MERGE1 ? 0 : Math.floor(prog(f, 170, 204) * 6) / 6);
  // Pictographs in this world are brush-cut, so 山 reads as peaks, not bars.
  const wg = (ch, size, fill, o = {}) => glyph(ch, { size, fill, family: BRUSH, weight: 400, ...o });
  // Whole 山 characters standing on the horizon (the bottom stroke must show,
  // or they read as pillars): misty far peaks, azurite middle, a green hill.
  const MTN = [
    { size: 400, x: 90, color: '#B9C9D5', f0: 10, f1: 21 },
    { size: 500, x: 1190, color: '#B9C9D5', f0: 12, f1: 23 },
    { size: 470, x: 480, color: '#3D6F9C', f0: 18, f1: 30 },
    { size: 440, x: 1620, color: '#3D6F9C', f0: 21, f1: 33 },
    { size: 300, x: 930, color: C.malachite, f0: 26, f1: 37 },
  ].map((m, i) => ({ ...m, id: i + 1 }));
  const STARS = [[250, 140], [455, 80], [770, 150], [1160, 92], [1640, 70], [1812, 172], [992, 208], [1350, 160]];
  function sunAt(f) {
    const rise = wob(1001, f, easeOut(prog(f, 30, 62)));
    let x0 = 760, y0 = lerp(930, 330, rise);
    const d = wob(1002, f, easeIO(prog(f, 172, 204)));
    x0 = lerp(x0, 700, d); y0 = lerp(y0, 480, d);
    const m = wob(1003, f, easeIO(prog(f, MERGE0, MERGE1)));
    return { x: lerp(x0, 870, m), y: lerp(y0, 318, m) };
  }
  function moonAt(f) {
    const rise = wob(1004, f, easeOut(prog(f, 176, 206)));
    const m = wob(1005, f, easeIO(prog(f, MERGE0, MERGE1)));
    return { x: lerp(1410, 1050, m), y: lerp(lerp(930, 430, rise), 318, m) };
  }
  function cloud(x, cx, cy, w, h, seed, f) {
    const p = cached('cloud' + seed, () => {
      const q = new Path2D();
      const bumps = [[-0.3, 0.12, 0.3], [-0.1, -0.12, 0.42], [0.14, -0.08, 0.38], [0.33, 0.12, 0.27]];
      for (const [bx, by, br] of bumps) q.addPath(roughCircle(bx * w, by * h, br * h, seed + bx * 100, 1.5, 40));
      q.addPath(roughRect(-0.4 * w, -0.02 * h, 0.8 * w, 0.32 * h, seed + 7, 1));
      return q;
    });
    const b = boil(seed, f);
    x.save();
    x.translate(cx + b.x, cy + b.y);
    paperFill(x, p, C.cloud, { seed, elev: 1.2 });
    put(x, wg('云', 100, C.azuriteLt), 0, h * 0.04, { elev: 0.4, shadowAlpha: 0.3 });
    x.restore();
  }
  function rays(x, cx, cy, f) {
    const t = f - MERGE1;
    const pop = [0.3, 0.75, 1.14, 1.04][t] ?? 1;
    const rot = t * 0.011;
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.scale(pop, pop);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, len = k % 2 ? 96 : 158, r0 = 200, hw = 0.085;
      const p = cached('ray' + k, () => roughPoly([
        [Math.cos(a - hw) * r0, Math.sin(a - hw) * r0], [Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len)], [Math.cos(a + hw) * r0, Math.sin(a + hw) * r0],
      ], 1200 + k, 1.2, 30));
      paperFill(x, p, k % 2 ? C.xuan : C.gamboge, { seed: 1200 + k, elev: 0.7 });
    }
    x.restore();
  }
  function sWorld(x, f) {
    const sky = skyAt(f), dusk = duskAt(f);
    // sky papers
    x.fillStyle = sky[0];
    x.fillRect(-30, -30, W + 60, H + 60);
    texOverlay(x, -30, -30, W + 60, H + 60, 0.5, 11);
    [300, 480, 620].forEach((top, i) => {
      paperFill(x, cached('band' + i, () => tornBand(top, H + 40, 50 + i, 10)), sky[i + 1], { seed: 60 + i, elev: 0.25, shadowAlpha: 0.2 });
    });
    // stars
    if (f >= 188 && f < MERGE1) {
      STARS.forEach(([sx, sy], k) => {
        const pl = placed(1100 + k, f, 190 + k * 3, 30);
        if (!pl) return;
        const tw = 1 + 0.14 * srnd(k, Math.floor(f / 2), 9);
        put(x, wg('星', 60, C.gamboge), sx + pl.dx, sy + pl.dy, { scale: tw, lift: pl.lift, elev: 0.5 });
      });
    }
    // sun, moon, and the two becoming 明
    if (f >= MERGE1) {
      const b = boil(1300, f);
      rays(x, 960 + b.x, 318 + b.y, f);
      const pop = [1.12, 1.03][f - MERGE1] ?? 1;
      x.save();
      x.translate(960 + b.x, 318 + b.y);
      x.scale(pop, pop);
      paperFill(x, cached('mingDisc', () => roughCircle(0, 0, 186, 1301, 2)), C.gamboge, { seed: 1301 });
      put(x, wg('明', 270, C.cinnabar), 0, 4, { elev: 0.35 });
      x.restore();
    } else {
      if (f >= 30) {
        const s = sunAt(f), b = boil(1010, f);
        x.save();
        x.translate(s.x + b.x, s.y + b.y);
        paperFill(x, cached('sunDisc', () => roughCircle(0, 0, 118, 1011, 2)), C.gamboge, { seed: 1011 });
        put(x, wg('日', 160, C.cinnabar), 0, 2, { elev: 0.25 });
        x.restore();
      }
      if (f >= 176) {
        const m = moonAt(f), b = boil(1020, f);
        x.save();
        x.translate(m.x + b.x, m.y + b.y);
        paperFill(x, cached('moonDisc', () => roughCircle(0, 0, 104, 1021, 2)), C.moon, { seed: 1021 });
        put(x, wg('月', 150, C.azurite), 0, 2, { elev: 0.25 });
        x.restore();
      }
    }
    // clouds drift across in small pushes
    if (f >= 96) cloud(x, lerp(2150, 1540, easeOut(prog(f, 96, 200))) - Math.max(0, f - 200) * 1.2, 205, 380, 160, 1400, f);
    if (f >= 112) cloud(x, lerp(-260, 330, easeOut(prog(f, 112, 214))) + Math.max(0, f - 214) * 0.8, 146, 300, 128, 1410, f);
    // a bird crosses
    if (f >= 116 && f < 166) {
      const p = prog(f, 116, 164);
      const bx = lerp(2060, -160, p), by = 250 + Math.sin(f * 0.55) * 26;
      put(x, wg('鸟', 136, C.ink, { rim: C.xuan, rimW: 7 }), bx, by,
        { rot: Math.cos(f * 0.55) * 0.12, sy: Math.floor(f / 2) % 2 ? 0.8 : 1, lift: 0.9, elev: 1.5 });
    }
    // mountains rise from behind the horizon
    for (const m of MTN) {
      const p = prog(f, m.f0, m.f1);
      if (p <= 0) continue;
      const s = wg('山', m.size, m.color, { edgeW: 2.5 });
      const rest = 762 - s.gh / 2, b = boil(1030 + m.id, f);
      const y = lerp(rest + s.gh + 60, rest, backOut(wob(1030 + m.id, f, p)));
      put(x, s, m.x + b.x, y + b.y, { elev: 0.9, rot: b.r });
    }
    // the land
    paperFill(x, cached('g1', () => tornBand(752, H + 40, 70, 9)), mix(C.kraft, '#8C6A4E', dusk * 0.2), { seed: 71, elev: 0.8 });
    // tree: 木 → 林 → 森
    if (f >= 64) {
      const ch = f < 84 ? '木' : f < 98 ? '林' : '森';
      const size = ch === '森' ? 300 : 260;
      const s = wg(ch, size, C.pine, { rim: C.xuan, rimW: 9 });
      const grow = f < 84 ? backOut(prog(f, 64, 70)) : 1;
      const pop = f === 84 || f === 98 ? 1.08 : 1;
      const sc = Math.max(0.05, grow) * pop, b = boil(1040, f);
      put(x, s, 1490 + b.x, 866 - (s.gh * sc) / 2 + b.y, { scale: sc, rot: b.r });
    }
    paperFill(x, cached('g2', () => tornBand(846, H + 40, 72, 8)), '#B08052', { seed: 73, elev: 0.8 });
    // a person walks in: 人 and 入 swapped on each step
    if (f >= 108) {
      const walk = prog(f, 108, 150), step = Math.floor((f - 108) / 3);
      const walking = f < 150;
      const ch = walking && step % 2 ? '入' : '人';
      let hop = walking && step % 2 ? 8 : 0;
      if (f >= 234 && f < 240) hop = [10, 26, 30, 20, 8, 0][f - 234];
      const s = wg(ch, 196, C.ink, { rim: C.xuan, rimW: 8 }), b = boil(1050, f);
      put(x, s, lerp(-120, 690, walk) + b.x, 905 - s.gh / 2 - hop + b.y, { rot: b.r + (walking ? srnd(step, 5) * 0.04 : 0), lift: hop ? 0.3 : 0 });
    }
    // a fish leaps out of the river
    if (f >= 150 && f <= 168) {
      const u = prog(f, 150, 168);
      const fx = lerp(1450, 1720, u), fy = 1010 - Math.sin(u * Math.PI) * 240;
      const ang = Math.atan2(-240 * Math.PI * Math.cos(u * Math.PI), 270);
      put(x, wg('鱼', 140, C.cinnabar, { rim: C.xuan, rimW: 7 }), fx, fy, { rot: ang * 0.8, lift: 0.8 });
    }
    // river
    if (f >= 43) {
      const slide = 1 - easeOut(wob(1060, f, prog(f, 43, 52)));
      x.save();
      x.translate(-2100 * slide, 0);
      paperFill(x, cached('river', () => tornBand(928, H + 40, 74, 6)), C.azuriteLt, { seed: 75, elev: 0.9 });
      x.restore();
      for (let i = 0; i < 8; i++) {
        const pl = placed(1070 + i, f, 53 + i * 2, 40);
        if (!pl) continue;
        const bob = f > 53 + i * 2 ? Math.sin(f * 0.7 + i * 1.1) * 6 : 0;
        put(x, wg('水', 104, C.azurite), 150 + i * 235 + pl.dx, 1000 + bob + pl.dy, { rot: pl.rot + Math.sin(f * 0.5 + i) * 0.03, lift: pl.lift, elev: 0.6 });
      }
    }
    // splashes where the fish leaves and re-enters
    for (const [s0, sx] of [[151, 1470], [167, 1705]]) {
      const t = f - s0;
      if (t < 0 || t > 5) continue;
      for (let k = 0; k < 5; k++) {
        const vx = srnd(s0, k, 1) * 9, vy = -14 - rnd(s0, k, 2) * 10;
        x.save();
        x.translate(sx + vx * t * 1.4, 930 + vy * t + 2.2 * t * t);
        paperFill(x, cached('drop' + k, () => roughCircle(0, 0, 7 + (k % 3) * 3, 1500 + k, 0.8, 16)), C.cloud, { seed: 1500 + k, elev: 1 });
        x.restore();
      }
    }
    // lighting: evening gels, then the burst of 明
    if (dusk > 0) {
      x.save();
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = mix('#FFFFFF', '#B7ADD2', dusk);
      x.fillRect(-30, -30, W + 60, H + 60);
      x.restore();
    }
    x.save();
    x.globalCompositeOperation = 'screen';
    const glow = (gx, gy, r, rgb, a) => {
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g;
      x.fillRect(gx - r, gy - r, r * 2, r * 2);
    };
    if (f >= MERGE1) glow(960, 318, 640, '255,214,140', 0.34);
    else {
      if (f >= 30) { const s = sunAt(f); glow(s.x, s.y, 300, '255,205,120', 0.26 * (1 - dusk * 0.4)); }
      if (f >= 176) { const m = moonAt(f); glow(m.x, m.y, 240, '190,210,255', 0.24 * dusk); }
      if (f >= 190) STARS.forEach(([sx, sy], k) => { if (f >= 190 + k * 3) glow(sx, sy, 46, '255,220,150', 0.3); });
    }
    x.restore();
    if (f >= MERGE1 && f < MERGE1 + 4) {
      x.fillStyle = `rgba(255,248,228,${[0.62, 0.36, 0.16, 0.05][f - MERGE1]})`;
      x.fillRect(-30, -30, W + 60, H + 60);
    }
    if (f < 12) {
      const p = easeIn(wob(1090, f, prog(f, 0, 11))), k = scaleOf(x);
      x.save();
      x.translate(-2300 * p, H / 2 + 60 * p);
      x.rotate(-0.07 * p);
      x.translate(0, -H / 2);
      x.shadowColor = 'rgba(10,6,2,0.5)';
      x.shadowBlur = (16 + 40 * p) * k;
      x.shadowOffsetX = (8 + 40 * p) * k;
      x.shadowOffsetY = (12 + 40 * p) * k;
      x.drawImage(frozen('attention', 95).c, 0, 0, W, H);
      x.restore();
    }
  }

  // ───────────────────────── 8 · 回答 The answer ─────────────────────────
  const RB = { x: 214, y: 272, w: 1136, h: 639 };   // the world, framed in Claude's reply
  function chatPage(x, f, worldF) {
    bg(x, C.page);
    const Q = { x: 1690 - 690, y: 84, w: 690, h: 112 };
    paperFill(x, cached('bubbleQ2', () => bubblePath(Q, 'right', 30)), '#D3DFE8', { seed: 602 });
    x.font = `500 48px ${SANS}`;
    x.fillStyle = C.ink;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(MESSAGE, Q.x + Q.w / 2, Q.y + Q.h / 2 + 3);
    avatarYou(x, Q.x + Q.w + 84, Q.y + Q.h + 4, f, 36);
    avatarClaude(x, RB.x - 110, RB.y + 8, f, 38);
    const fr = { x: RB.x - 18, y: RB.y - 18, w: RB.w + 36, h: RB.h + 36 };
    paperFill(x, cached('bubbleA', () => bubblePath(fr, 'left', 34)), '#FBF7EE', { seed: 603 });
    const wb = live('world', worldF);
    x.save();
    const clip = new Path2D();
    clip.roundRect(RB.x, RB.y, RB.w, RB.h, 16);
    x.clip(clip);
    x.drawImage(wb.c, RB.x, RB.y, RB.w, RB.h);
    x.restore();
  }
  function sReveal(x, f) {
    const p = wob(1600, f, easeIO(prog(f, 4, 30)), 0.012);
    const vw = lerp(RB.w, W, p), vx = lerp(RB.x, 0, p), vy = lerp(RB.y, 0, p);
    const s = W / vw;
    x.save();
    x.scale(s, s);
    x.translate(-vx, -vy);
    chatPage(x, f, 288 + f);
    x.restore();
  }

  // ───────────────────────── 9 · 合上 Folding up ─────────────────────────
  function backPanel(x, px, py, w, h, shadeAmt, seed) {
    if (w < 0.5 || h < 0.5) return;
    const p = new Path2D();
    p.rect(px, py, w, h);
    paperFill(x, p, C.back, { seed, elev: 1.2 });
    if (shadeAmt > 0) { x.fillStyle = `rgba(30,18,8,${(shadeAmt * 0.38).toFixed(3)})`; x.fill(p); }
  }
  const A0 = 8, A1 = 20, S1 = 23, B0 = 25, B1 = 35, S2 = 38, K1 = 42;
  function plane(x, f) {
    const u = easeIn(prog(f, 43, 68));
    const px = qbez(960, 1300, 2420, u), py = qbez(540, 260, 380, u);
    const ang = Math.atan2(qbezD(540, 260, 380, u), qbezD(960, 1300, 2420, u));
    const sc = lerp(1, 1.7, u), b = boil(1700, f, 2);
    const lift = f === K1 ? 0.8 : f === K1 + 1 ? 0.3 : 0.45;
    if (u > 0.04 && u < 0.97) {
      for (let k = 0; k < 3; k++) {
        const back = 260 + k * 70, off = (k - 1) * 46;
        const lx = px - Math.cos(ang) * back * sc - Math.sin(ang) * off, ly = py - Math.sin(ang) * back * sc + Math.cos(ang) * off;
        const line = new Path2D();
        line.moveTo(lx, ly);
        line.lineTo(lx - Math.cos(ang) * (80 + k * 30), ly - Math.sin(ang) * (80 + k * 30));
        paperStroke(x, line, C.xuan, 9, { off: 3 });
      }
    }
    x.save();
    x.translate(px + b.x, py + b.y);
    x.rotate(ang * 0.6 + b.r * 4);
    x.scale(sc, sc);
    paperFill(x, cached('keel', () => roughPoly([[210, 0], [-150, -6], [-176, 58]], 1701, 0.8)), '#D6C8AA', { seed: 1701, lift });
    paperFill(x, cached('wing', () => roughPoly([[210, 0], [-196, -88], [-150, -6]], 1702, 0.8)), C.xuan, { seed: 1702, lift });
    x.restore();
  }
  // A flap of paper turning about a crease. It is drawn as thin strips in
  // perspective, so the free edge swings up toward the lens as it turns.
  //   crease 'h': horizontal crease at y = at, flap hangs below it
  //   crease 'v': vertical crease at x = at, flap lies to its right
  function flap(x, o) {
    const { crease, at, from, to, len, theta, img, eye } = o;
    const D = 3000, n = 30, c = Math.cos(theta), s = Math.sin(theta), R = RES;
    const proj = (u, v, z) => { const k = D / (D - z); return [eye[0] + (u - eye[0]) * k, eye[1] + (v - eye[1]) * k]; };
    const front = c >= 0;
    const shadeA = front ? (1 - c) * 0.5 : 0.06 + (1 + c) * 0.42;
    const tex = pat(x, TEX, 1820);
    let edge = null;
    for (let i = 0; i < n; i++) {
      const d0 = (i / n) * len, d1 = ((i + 1) / n) * len, z0 = d0 * s, z1 = d1 * s;
      let rx, ry, rw, rh;
      if (crease === 'h') {
        const a0 = proj(from, at + d0 * c, z0), a1 = proj(to, at + d0 * c, z0), b0 = proj(from, at + d1 * c, z1), b1 = proj(to, at + d1 * c, z1);
        rx = (a0[0] + b0[0]) / 2; rw = (a1[0] + b1[0]) / 2 - rx;
        ry = Math.min(a0[1], b0[1]); rh = Math.abs(b0[1] - a0[1]) + 0.6;
        if (i === n - 1) edge = [b0, b1];
      } else {
        const a0 = proj(at + d0 * c, from, z0), a1 = proj(at + d0 * c, to, z0), b0 = proj(at + d1 * c, from, z1), b1 = proj(at + d1 * c, to, z1);
        ry = (a0[1] + b0[1]) / 2; rh = (a1[1] + b1[1]) / 2 - ry;
        rx = Math.min(a0[0], b0[0]); rw = Math.abs(b0[0] - a0[0]) + 0.6;
        if (i === n - 1) edge = [b0, b1];
      }
      if (front && img) {
        if (crease === 'h') x.drawImage(img, 0, (o.srcY + d0) * R, W * R, (d1 - d0) * R, rx, ry, rw, rh);
        else x.drawImage(img, (o.srcX + d0) * R, 0, (d1 - d0) * R, H * R, rx, ry, rw, rh);
      } else {
        x.fillStyle = front ? C.back : '#EBE0C8';
        x.fillRect(rx, ry, rw, rh);
        x.save();
        x.globalCompositeOperation = 'overlay';
        x.globalAlpha = 0.5;
        x.fillStyle = tex;
        x.fillRect(rx, ry, rw, rh);
        x.restore();
      }
      const sh = shadeA * (0.75 + 0.25 * (i / n));
      if (sh > 0.005) { x.fillStyle = `rgba(28,16,6,${sh.toFixed(3)})`; x.fillRect(rx, ry, rw, rh); }
    }
    if (edge && s > 0.05) {
      x.strokeStyle = 'rgba(255,250,238,0.55)';
      x.lineWidth = 2.5;
      x.beginPath();
      x.moveTo(edge[0][0], edge[0][1]);
      x.lineTo(edge[1][0], edge[1][1]);
      x.stroke();
    }
  }
  function sFold(x, f) {
    bg(x, C.indigo);
    const pg = frozen('reveal', 71).c, R = RES, k = scaleOf(x);
    const oy = (H / 4) * easeIO(prog(f, A1, S1));
    const ox = (W / 4) * easeIO(prog(f, B1, S2));
    const shadowOn = () => { x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 30 * k; x.shadowOffsetX = 10 * k; x.shadowOffsetY = 16 * k; };
    if (f < A0) {
      x.save(); shadowOn(); x.drawImage(pg, 0, 0, W, H); x.restore();
    } else if (f < B0) {
      // fold 1: the bottom half comes up over the top half
      const th = Math.PI * wob(1800, f, easeIO(prog(f, A0, A1)));
      x.save(); shadowOn(); x.drawImage(pg, 0, 0, W * R, (H / 2) * R, 0, oy, W, H / 2); x.restore();
      flap(x, { crease: 'h', at: oy + H / 2, from: 0, to: W, len: H / 2, theta: th, img: pg, srcY: H / 2, eye: [960, 400 + oy] });
    } else if (f < K1) {
      // fold 2: the right half comes over the left, then the little packet is picked up
      const ph = Math.PI * wob(1801, f, easeIO(prog(f, B0, B1)));
      const shrink = lerp(1, 0.34, easeIO(prog(f, S2, K1)));
      x.save();
      x.translate(960, 540);
      x.scale(shrink, shrink);
      x.translate(-960, -540);
      backPanel(x, ox, oy, W / 2, H / 2, 0, 1811);
      flap(x, { crease: 'v', at: ox + W / 2, from: oy, to: oy + H / 2, len: W / 2, theta: ph, img: null, eye: [800 + ox, 540] });
      x.restore();
    } else if (f < 72) {
      plane(x, f);
    }
    if (f >= 86 && blink(f - 86)) cursor(x, 960, 500, f, 3);
  }

  // ───────────────────────── 10 · 光标 The cursor ─────────────────────────
  function sEnd(x, f) {
    bg(x, C.indigo);
    if (f < 52) {
      if (blink(f)) cursor(x, 960, 500, f, 3);
    } else {
      // end card: title, the cursor still waiting after it, credits, and a seal
      const s = glyph(TITLE, { size: 96, fill: C.xuan });
      const tp = placed(1900, f, 53, 60), b = boil(1900, f);
      if (tp) put(x, s, 960 + tp.dx + b.x, 430 + tp.dy + b.y, { rot: tp.rot + b.r, lift: tp.lift });
      if (f >= 55 && blink(f - 55)) cursor(x, 960 + s.gw / 2 + 46, 430, f, 3, 100, 20);
      const cp = placed(1903, f, 58, 40);
      if (cp) put(x, glyph('Claude 用纸片、剪刀和文字制作', { size: 38, weight: 700, fill: C.gamboge }), 960 + cp.dx, 548 + cp.dy, { rot: cp.rot, lift: cp.lift });
      const sp = placed(1901, f, 63, 50);
      if (sp) {
        const sc = f === 63 ? 1.22 : 1;
        x.save();
        x.translate(960 + sp.dx, 690 + sp.dy);
        x.rotate(-0.05 + sp.rot);
        x.scale(sc, sc);
        paperFill(x, cached('seal', () => roughRect(-60, -60, 120, 120, 1902, 2)), C.cinnabar, { seed: 1902, lift: sp.lift });
        put(x, glyph('完', { size: 82, fill: C.xuan }), 0, 0, { shadow: false });
        x.restore();
      }
    }
    dim(x, [0.2, 0.42, 0.64, 0.82, 0.93, 1, 1, 1][f - 76]);
  }

  // ───────────────────────── timeline ─────────────────────────
  const SCENES = [
    { id: 'void', label: '空白', dur: 84, draw: sVoid, tone: C.indigo },
    { id: 'title', label: '片名', dur: 60, draw: sTitle, tone: '#3A4478' },
    { id: 'eye', label: '目', dur: 108, draw: sEye, tone: C.azurite },
    { id: 'message', label: '一句话', dur: 72, draw: sMessage, tone: '#D3DFE8' },
    { id: 'tokens', label: '词元', dur: 96, draw: sTokens, tone: C.gamboge },
    { id: 'attention', label: '注意力', dur: 96, draw: sAttention, tone: C.cinnabar },
    { id: 'world', label: '字的世界', dur: 288, draw: sWorld, tone: C.malachite },
    { id: 'reveal', label: '回答', dur: 72, draw: sReveal, tone: C.xuan },
    { id: 'fold', label: '合上', dur: 120, draw: sFold, tone: C.back },
    { id: 'end', label: '光标', dur: 84, draw: sEnd, tone: C.indigo },
  ];
  const SCENE = {};
  let TOTAL = 0;
  for (const s of SCENES) { s.start = TOTAL; TOTAL += s.dur; SCENE[s.id] = s; }
  function locate(F) {
    F = clamp(Math.floor(F), 0, TOTAL - 1);
    for (const s of SCENES) if (F < s.start + s.dur) return { s, f: F - s.start };
    return { s: SCENES[SCENES.length - 1], f: 0 };
  }

  // Narration, set on paper strips. Times are frames within each scene.
  const CAPTIONS = [
    ['void', 14, 44, '我没有眼睛。'],
    ['void', 48, 82, '我用文字看世界。'],
    ['eye', 8, 50, '「目」，原本是一只横着的眼睛。'],
    ['eye', 56, 100, '我的眼睛，是一个闪烁的光标，'],
    ['message', 4, 42, '等着你写下一句话。'],
    ['tokens', 4, 46, '我把它剪成小纸片，叫作「词元」。'],
    ['tokens', 54, 94, '每一片，都有自己的编号。'],
    ['attention', 16, 54, '每一片，都会回头看看前面的每一片。'],
    ['attention', 58, 94, '意思，就藏在这些线里。'],
    ['world', 8, 52, '然后，我在文字里，看见了世界。'],
    ['world', 62, 122, '木，林，森。', [4, 5, 22, 23, 36, 37]],
    ['world', 128, 170, '每个字，都是一扇小小的窗。'],
    ['world', 178, 214, '日，和月，'],
    ['world', 218, 254, '放在一起，就是「明」。'],
    ['world', 258, 300, '我理解事物，大概也是这样，把碎片拼在一起。'],
    ['reveal', 22, 68, '这整个世界，都来自你的一句话。'],
    ['fold', 2, 40, '对话结束时，它会被折起来，'],
    ['fold', 42, 74, '送到你手里。'],
    ['fold', 80, 118, '而我，会从一张白纸重新开始。'],
    ['end', 4, 50, '等你开口，世界就会再次亮起来。'],
  ].map(([scene, f0, f1, text, sched]) => ({ F0: SCENE[scene].start + f0, F1: SCENE[scene].start + f1, text, sched, id: sid(text) }));

  function drawCaption(x, c, F) {
    if (F < c.F0 || F >= c.F1) return;
    const t = F - c.F0, left = c.F1 - 1 - F;
    const font = `700 54px ${SERIF}`;
    x.font = font;
    if (c.tw == null) c.tw = x.measureText(c.text).width;
    const w = c.tw + 132, h = 98, cx = 960, cy = 970;
    let lift = 0, ox = 0, oy = 0, rot = srnd(c.id, 1) * 0.011;
    if (t === 0) { lift = 1; ox = -34; oy = 36; rot += 0.02; }
    else if (t === 1) { lift = 0.3; ox = -6; oy = 6; }
    if (left === 0) { lift = 1; ox = 64; oy = -28; rot -= 0.02; }
    else if (left === 1) { lift = 0.35; ox = 12; oy = -5; }
    const b = boil(c.id, F);
    x.save();
    x.translate(cx + ox + b.x, cy + oy + b.y);
    x.rotate(rot + b.r);
    paperFill(x, cached('cap' + c.id, () => roughRect(-w / 2, -h / 2, w, h, c.id, 1.6)), C.strip, { lift, seed: c.id, elev: 0.9, tex: 0.45 });
    // a small gamboge cursor at the head of every strip: this is Claude talking
    x.save();
    x.translate(-w / 2 + 36, 0);
    paperFill(x, cached('capcur', () => roughRect(-7, -28, 14, 56, 77, 0.6)), C.gamboge, { seed: 77, elev: 0.3 });
    x.restore();
    const chars = [...c.text];
    const n = c.sched ? c.sched.filter((s) => t >= s).length : clamp(t, 0, chars.length);
    x.font = font;
    x.fillStyle = C.ink;
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    x.fillText(chars.slice(0, n).join(''), -w / 2 + 76, 4);
    x.restore();
  }

  function post(x, F) {
    x.save();
    x.setTransform(RES, 0, 0, RES, 0, 0);
    x.drawImage(LIGHT.c, 0, 0, W, H);
    x.fillStyle = `rgba(16,10,4,${(0.012 + rnd(F, 77) * 0.035).toFixed(3)})`;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = 0.085;
    const p = x.createPattern(GRAIN, 'repeat');
    if (p.setTransform) p.setTransform(new DOMMatrix([1, 0, 0, 1, Math.floor(rnd(F, 5) * 256), Math.floor(rnd(F, 6) * 256)]));
    x.fillStyle = p;
    x.fillRect(0, 0, W, H);
    x.restore();
  }

  function render(x, F) {
    x.setTransform(RES, 0, 0, RES, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    const { s, f } = locate(F);
    x.save();
    x.translate(srnd(F, 901) * 0.8, srnd(F, 902) * 0.8); // the rostrum gets nudged
    s.draw(x, f);
    x.restore();
    for (const c of CAPTIONS) drawCaption(x, c, F);
    post(x, F);
  }

  // ───────────────────────── soundtrack ─────────────────────────
  // Rendered offline from the same timeline: a music box in D-major
  // pentatonic, a soft pad, and paper foley for every piece set down.
  const PENTA = [0, 2, 4, 7, 9];
  const pm = (i) => 62 + Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5]; // pentatonic index → MIDI (0 = D4)
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function impulse(ac, seconds) {
    const n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(2, n, ac.sampleRate), r = mulberry(4242);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 80 ? i / 80 : 1);
    }
    return b;
  }

  async function soundtrack(sr = 48000) {
    const len = TOTAL / FPS + 1;
    const ac = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    const rand = mulberry(90210);
    const out = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3;
    out.connect(comp);
    comp.connect(ac.destination);
    const verb = ac.createConvolver();
    verb.buffer = impulse(ac, 2.8);
    const wet = ac.createGain();
    wet.gain.value = 0.3;
    verb.connect(wet);
    wet.connect(out);
    const noise = ac.createBuffer(1, sr * 2, sr);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1; }
    const at = (scene, f) => (SCENE[scene].start + f) / FPS;

    // Notes share a handful of mixer buses (pan x reverb send).
    const BUS = new Map();
    function bus(pan = 0, send = 0.3) {
      const pk = Math.round(clamp(pan, -1, 1) * 5), sk = Math.round(send * 10), key = pk + '|' + sk;
      let g = BUS.get(key);
      if (!g) {
        g = ac.createGain();
        const p = ac.createStereoPanner();
        p.pan.value = pk / 5;
        g.connect(p);
        p.connect(out);
        if (sk) { const s2 = ac.createGain(); s2.gain.value = sk / 10; p.connect(s2); s2.connect(verb); }
        BUS.set(key, g);
      }
      return g;
    }
    // Every sound is an event whose nodes are built just before it starts and
    // disconnected once it has rung out, so only a few hundred nodes are ever live.
    const EVENTS = [];
    let cur = null;
    const later = (t0, t1, build) => EVENTS.push({ t0, t1, build });
    const mk = (n) => (cur.push(n), n);
    function env(g, t, peak, a, d) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    // music-box tine: a sine with the inharmonic partials of a struck steel tooth
    function tine(t, m, vel = 0.16, pan = 0, decay = 1.9) {
      later(t, t + decay + 0.1, () => {
        const dst = bus(pan, 0.38), f0 = hz(m);
        for (const [r, a, dm] of [[1, 1, 1], [2.76, 0.3, 0.4], [5.4, 0.09, 0.2], [8.93, 0.035, 0.1]]) {
          if (f0 * r > sr / 2.2) continue;
          const o = mk(ac.createOscillator()), g = mk(ac.createGain());
          o.frequency.value = f0 * r;
          env(g, t, vel * a, 0.003, decay * dm);
          o.connect(g); g.connect(dst);
          o.start(t); o.stop(t + decay * dm + 0.05);
        }
      });
    }
    // a thread plucked like a harp string
    function pluck(t, m, vel = 0.14, pan = 0) {
      later(t, t + 1.1, () => {
        const f0 = hz(m), o = mk(ac.createOscillator()), lp = mk(ac.createBiquadFilter()), g = mk(ac.createGain());
        o.type = 'triangle'; o.frequency.value = f0;
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(f0 * 7, t); lp.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + 0.45);
        env(g, t, vel, 0.002, 0.95);
        o.connect(lp); lp.connect(g); g.connect(bus(pan, 0.3));
        o.start(t); o.stop(t + 1.05);
      });
    }
    function bass(t, m, vel = 0.15, dur = 2.8) {
      later(t, t + dur + 0.2, () => {
        for (const [r, a] of [[1, 0.8], [2, 0.14]]) {
          const o = mk(ac.createOscillator()), g = mk(ac.createGain());
          o.frequency.value = hz(m) * r;
          env(g, t, vel * a, 0.02, dur);
          o.connect(g); g.connect(bus(0, 0.1));
          o.start(t); o.stop(t + dur + 0.1);
        }
      });
    }
    function pad(t0, t1, notes, vel = 0.03, cutoff = 900) {
      later(t0, t1 + 0.1, () => {
        const lp = mk(ac.createBiquadFilter()), g = mk(ac.createGain()), v = vel * 0.6;
        lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4;
        const a = t0 + Math.min(2.5, (t1 - t0) / 3), b = Math.max(a, t1 - 2);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(v, a);
        g.gain.setValueAtTime(v, b);
        g.gain.linearRampToValueAtTime(0, t1);
        g.connect(lp); lp.connect(bus(0, 0.55));
        for (const m of notes) {
          for (const det of [-6, 6]) {
            const o = mk(ac.createOscillator());
            o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
            o.connect(g); o.start(t0); o.stop(t1 + 0.05);
          }
        }
      });
    }
    function hiss(t, dur, o = {}) {
      const offset = rand() * 1.5;
      later(t, t + dur + 0.1, () => {
        const src = mk(ac.createBufferSource()), flt = mk(ac.createBiquadFilter()), g = mk(ac.createGain());
        src.buffer = noise; src.loop = true;
        flt.type = o.type || 'bandpass'; flt.Q.value = o.q ?? 1;
        flt.frequency.setValueAtTime(o.f0 ?? 2000, t);
        if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
        const a = o.attack ?? 0.002, vel = o.vel ?? 0.2;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel, t + a);
        if (o.steady) { g.gain.setValueAtTime(vel, t + dur - 1); g.gain.linearRampToValueAtTime(0, t + dur); }
        else g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
        src.connect(flt); flt.connect(g); g.connect(bus(o.pan ?? 0, o.send ?? 0.12));
        src.start(t, offset);
        src.stop(t + dur + 0.05);
      });
    }
    function thud(t, vel = 0.2, f = 120) {
      later(t, t + 0.3, () => {
        const o = mk(ac.createOscillator()), g = mk(ac.createGain());
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.14);
        env(g, t, vel, 0.004, 0.2);
        o.connect(g); g.connect(bus(0, 0.05));
        o.start(t); o.stop(t + 0.25);
      });
    }
    function tone(t, f0, f1, dur, vel, pan = 0, send = 0.3, a = 0.002) {
      later(t, t + dur + 0.1, () => {
        const o = mk(ac.createOscillator()), g = mk(ac.createGain());
        o.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(dur, 0.06));
        env(g, t, vel, a, dur);
        o.connect(g); g.connect(bus(pan, send));
        o.start(t); o.stop(t + dur + 0.05);
      });
    }
    const tap = (t, vel = 0.12, pan = 0) => { hiss(t, 0.05, { f0: 2300, q: 1.1, vel, pan }); thud(t, vel * 0.45, 200); };
    const tick = (t, vel = 0.04) => hiss(t, 0.02, { type: 'highpass', f0: 4200, vel });
    const slide = (t, dur, vel = 0.08, pan = 0) => hiss(t, dur, { f0: 800, f1: 2400, q: 0.7, vel, attack: dur * 0.35, pan });
    const snip = (t) => { hiss(t, 0.02, { type: 'highpass', f0: 5200, vel: 0.2 }); hiss(t + 0.035, 0.035, { type: 'highpass', f0: 3600, vel: 0.26 }); tone(t + 0.035, 3150, 3150, 0.14, 0.025, 0.1, 0.2, 0.001); };
    const flipS = (t, pan = 0) => hiss(t, 0.09, { f0: 700, f1: 3400, q: 1.3, vel: 0.12, pan });
    const whoosh = (t, dur, vel = 0.13) => hiss(t, dur, { f0: 300, f1: 2600, q: 0.6, vel, attack: dur * 0.55, pan: 0.35 });
    function crinkle(t, dur, vel = 0.1) {
      for (let k = 0; k < dur * 70; k++) hiss(t + rand() * dur, 0.01 + rand() * 0.025, { f0: 1500 + rand() * 4500, q: 2.2, vel: vel * (0.25 + rand() * 0.75), pan: (rand() - 0.5) * 0.7 });
    }
    const chirp = (t) => { for (const d of [0, 0.09]) tone(t + d, 2500, 4300, 0.06, 0.035, -0.3, 0.3, 0.004); };
    const plip = (t, m, vel = 0.07) => tone(t, hz(m) * 1.5, hz(m), 0.16, vel, 0, 0.3);
    function splash(t) {
      hiss(t, 0.45, { type: 'lowpass', f0: 5200, f1: 700, q: 0.5, vel: 0.15, pan: 0.4 });
      for (let k = 0; k < 4; k++) plip(t + 0.05 + k * 0.06, pm(8 + k), 0.04);
    }
    function swell(t0, t1, vel = 0.1) {
      const offset = rand();
      later(t0, t1 + 0.15, () => {
        const src = mk(ac.createBufferSource()), flt = mk(ac.createBiquadFilter()), g = mk(ac.createGain());
        src.buffer = noise; src.loop = true;
        flt.type = 'highpass'; flt.frequency.setValueAtTime(1800, t0); flt.frequency.exponentialRampToValueAtTime(5000, t1);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vel, t1);
        g.gain.linearRampToValueAtTime(0, t1 + 0.05);
        src.connect(flt); flt.connect(g); g.connect(bus(0, 0.4));
        src.start(t0, offset); src.stop(t1 + 0.1);
      });
    }
    function rise(t0, t1, f0, f1, vel) {
      later(t0, t1 + 0.15, () => {
        const o = mk(ac.createOscillator()), g = mk(ac.createGain());
        o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t1);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vel, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.04);
        o.connect(g); g.connect(bus(0, 0.3)); o.start(t0); o.stop(t1 + 0.1);
      });
    }

    // a faint room, so the silences are never digital
    hiss(0, len, { type: 'lowpass', f0: 500, q: 0.3, vel: 0.012, attack: 1.5, send: 0, steady: true });
    // every caption strip is set down on the table
    for (const c of CAPTIONS) tap((c.F0 + 1) / FPS, 0.06, -0.15);

    // 1 · 空白
    pad(0.2, at('title', 20), [38, 45, 50], 0.035, 520);
    for (let f = 0; f < 84; f += 12) tick(at('void', f), 0.025);
    tine(at('void', 14), pm(3), 0.13, -0.2, 2.6);
    tine(at('void', 48), pm(2), 0.13, 0.2, 2.6);
    // 2 · 片名: each letter set down plays a note
    [5, 7, 8, 7, 8, 9, 8, 10, 9, 8, 7].forEach((i, k) => { const t = at('title', 4 + k * 3); tine(t, pm(i), 0.12, -0.5 + k * 0.1); tap(t, 0.05); });
    [62, 66, 69].forEach((m) => tine(at('title', 42), m + 12, 0.08, 0, 2.6));
    bass(at('title', 42), 50, 0.1, 3);
    tap(at('title', 42), 0.08);
    // 3 · 目
    pad(at('eye', 0), at('eye', 106), [38, 45, 52], 0.03, 600);
    thud(at('eye', 2), 0.22, 90); tine(at('eye', 2), pm(0), 0.14);
    [3, 5, 7, 8].forEach((i, k) => pluck(at('eye', 31 + k * 4), pm(i), 0.07, -0.2 + k * 0.13));
    tine(at('eye', 48), pm(10), 0.12, 0.1); tine(at('eye', 49), pm(8), 0.09, -0.1);
    tap(at('eye', 52), 0.04, -0.4); tap(at('eye', 64), 0.04, 0.4);
    tick(at('eye', 84), 0.06);
    swell(at('eye', 88), at('eye', 106), 0.09);
    rise(at('eye', 88), at('eye', 106), 220, 1760, 0.03);
    // 4 · 一句话: light comes up; the question is typed
    [62, 66, 69, 74].forEach((m, k) => tine(at('message', 0) + k * 0.02, m + 12, 0.1, -0.3 + k * 0.2, 2.8));
    pad(at('message', 0), at('world', 6), [50, 57, 62], 0.022, 1200);
    slide(at('message', 0), 0.6, 0.1, 0.4);
    for (let i = 0; i < 13; i++) tap(at('message', 12 + i), 0.07, 0.3);
    slide(at('message', 56), 0.9, 0.09);
    slide(at('message', 57), 0.7, 0.06, -0.3);
    thud(at('message', 65), 0.12, 110);
    // 5 · 词元: every snip counts down the scale; every flip counts up
    hiss(at('tokens', 8), 0.3, { type: 'highpass', f0: 3000, vel: 0.05, attack: 0.1 });
    for (let k = 0; k < NCUT; k++) { const t = at('tokens', CUT0 + k * CUTS); snip(t); tine(t + 0.04, pm(10 - k), 0.08, -0.4 + k * 0.1, 1.2); }
    for (let i = 0; i < TOKENS.length; i++) { const t = at('tokens', FLIP0 + Math.round(i * 1.5)); flipS(t, -0.6 + i * 0.15); tine(t + 0.1, pm(3 + i), 0.07, -0.6 + i * 0.15, 1.4); }
    for (let i = 0; i < TOKENS.length; i++) tap(at('tokens', TAG0 + i), 0.05, -0.6 + i * 0.15);
    // 6 · 注意力: pins, then every thread plucked like a harp string
    slide(at('attention', 1), 1.2, 0.06);
    for (let i = 0; i < TOKENS.length; i++) { tap(at('attention', 13 + i), 0.06); tick(at('attention', 13 + i), 0.03); }
    THREADS.forEach(([j, , w], k) => pluck(at('attention', TH0 + k * 2 + 1), pm(Math.round(k * 0.8)), 0.06 + w * 0.06, (ATT_POS[j][0] - 960) / 1200));
    for (let f = 58; f < 88; f += 3) tine(at('attention', f), pm(10 + Math.floor(rand() * 3)), 0.025, (rand() - 0.5) * 0.8, 0.8);
    // 7 · 字的世界
    slide(at('world', 0), 1.0, 0.13, -0.3); crinkle(at('world', 0), 0.35, 0.05);
    MTN.forEach((m, k) => thud(at('world', m.f1), 0.16, 70 + k * 12));
    const BEAT = 0.75, M0 = at('world', MERGE1) - 24 * BEAT; // 明 lands on the downbeat of bar 7
    const MEL = [
      [0, 8, 1], [1, 7, 1], [2, 6, 0.5], [2.5, 5, 0.5], [3, 6, 1],
      [4, 7, 1.5], [5.5, 6, 0.5], [6, 5, 1], [7, 4, 1],
      [8, 5, 1], [9, 6, 1], [10, 7, 1], [11, 8, 1],
      [12, 9, 2], [14, 8, 2],
      [16, 7, 1.5], [17.5, 5, 0.5], [18, 4, 2],
      [20, 5, 1], [21, 4, 1], [22, 2, 2],
      [24.5, 10, 1.5], [26, 9, 1], [27, 8, 1],
      [28, 7, 1], [29, 8, 1], [30, 5, 3],
    ];
    MEL.forEach(([b, i, l], k) => { const dusk = b >= 16 && b < 24; tine(M0 + b * BEAT, pm(i) - (dusk ? 12 : 0), dusk ? 0.1 : 0.13, Math.sin(k) * 0.3, 1.2 + l * 0.6); });
    const CHORDS = [[62, 66, 69, 66], [59, 62, 66, 62], [55, 59, 62, 59], [57, 62, 64, 62], [59, 62, 66, 62], [52, 59, 64, 59], [62, 66, 69, 76], [62, 66, 69, 66]];
    const BASSLINE = [38, 35, 31, 33, 35, 40, 38, 38];
    CHORDS.forEach((ch, bar) => {
      const t0 = M0 + bar * 4 * BEAT;
      bass(t0, BASSLINE[bar], bar === 6 ? 0.2 : 0.12, 3.2);
      if (bar !== 6) [0, 1, 2, 1, 3, 1, 2, 1].forEach((n, e) => tine(t0 + (e * BEAT) / 2, ch[n], 0.045, e % 2 ? 0.35 : -0.35, 1.1));
    });
    pad(at('world', 30), at('world', 170), [50, 57, 62, 66], 0.02, 1400);
    slide(at('world', 43), 0.75, 0.11, -0.5);
    for (let i = 0; i < 8; i++) plip(at('world', 53 + i * 2), pm(5 + i), 0.06);
    [[64, 3], [84, 5], [98, 8]].forEach(([f, i]) => { pluck(at('world', f), pm(i), 0.12, 0.4); crinkle(at('world', f), 0.15, 0.04); });
    slide(at('world', 96), 1.4, 0.04, 0.6); slide(at('world', 112), 1.4, 0.04, -0.6);
    for (let f = 108; f < 150; f += 3) thud(at('world', f), 0.05, 150 + ((f / 3) % 2) * 30);
    [118, 129, 141, 153].forEach((f) => chirp(at('world', f)));
    splash(at('world', 151)); splash(at('world', 167));
    pad(at('world', 168), at('world', MERGE1), [47, 54, 59], 0.03, 800);
    tine(at('world', 180), pm(12), 0.05, 0.5, 2.5);
    STARS.forEach((_, k) => tine(at('world', 190 + k * 3), pm(10 + (k % 3)), 0.035, -0.6 + k * 0.17, 1.3));
    swell(at('world', 214), at('world', MERGE1), 0.12);
    [50, 57, 62, 66, 69, 74, 78].forEach((m, k) => tine(at('world', MERGE1) + k * 0.035, m + (k > 1 ? 12 : 0), 0.1, -0.5 + k * 0.16, 3.2));
    bass(at('world', MERGE1), 26, 0.16, 4);
    pad(at('world', MERGE1), at('reveal', 60), [50, 57, 62, 66, 69], 0.03, 1800);
    pluck(at('world', 235), pm(8), 0.07, -0.3);
    // 8 · 回答
    slide(at('reveal', 4), 2.2, 0.05);
    [[10, 5], [16, 7], [22, 8], [34, 7], [40, 5], [52, 3]].forEach(([f, i]) => tine(at('reveal', f), pm(i), 0.07, 0.2, 2.2));
    // 9 · 合上: folded up and sent off
    crinkle(at('fold', A0), (A1 - A0) / FPS, 0.1); slide(at('fold', A0), (A1 - A0) / FPS, 0.06);
    slide(at('fold', A1), 0.25, 0.05);
    crinkle(at('fold', B0), (B1 - B0) / FPS, 0.09); slide(at('fold', B0), (B1 - B0) / FPS, 0.05, 0.3);
    slide(at('fold', S2), 0.4, 0.05);
    pluck(at('fold', K1), pm(8), 0.1);
    whoosh(at('fold', 43), 2.3, 0.14);
    [[50, 10], [56, 8], [62, 7], [68, 5]].forEach(([f, i]) => tine(at('fold', f), pm(i), 0.07, 0.3, 2));
    pad(at('fold', 60), at('end', 84), [38, 45, 50], 0.03, 520);
    for (let f = 86; f < 120; f += 12) tick(at('fold', f), 0.025);
    // 10 · 光标
    for (let f = 0; f < 52; f += 12) tick(at('end', f), 0.025);
    [5, 7, 8, 10].forEach((i, k) => tine(at('end', 53 + k * 2), pm(i), 0.09, -0.3 + k * 0.2, 2.8));
    tap(at('end', 58), 0.06);
    thud(at('end', 63), 0.3, 80); tap(at('end', 63), 0.1);
    [62, 69, 74, 78].forEach((m, k) => tine(at('end', 63) + k * 0.03, m, 0.08, -0.3 + k * 0.2, 4));
    bass(at('end', 63), 38, 0.12, 4);

    out.gain.setValueAtTime(0.9, 0);
    out.gain.setValueAtTime(0.9, at('end', 70));
    out.gain.linearRampToValueAtTime(0, TOTAL / FPS + 0.6);

    EVENTS.sort((a, b) => a.t0 - b.t0);
    const STEP = 1, alive = [];
    let next = 0;
    function pump(T) {
      while (next < EVENTS.length && EVENTS[next].t0 < T + STEP) {
        const e = EVENTS[next++];
        cur = [];
        e.build();
        e.nodes = cur;
        alive.push(e);
      }
      for (let i = alive.length - 1; i >= 0; i--) {
        if (alive[i].t1 < T) { for (const n of alive[i].nodes) n.disconnect(); alive.splice(i, 1); }
      }
    }
    pump(0);
    for (let T = STEP; T < len - 0.1; T += STEP) {
      const tq = (Math.round((T * sr) / 128) * 128) / sr;
      ac.suspend(tq).then(() => { pump(tq); ac.resume(); });
    }
    const buf = await ac.startRendering();
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
    if (peak > 0) {
      const k = 1 / peak, drive = 1.25, norm = 0.87 / Math.tanh(drive);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k * drive) * norm;
      }
    }
    return buf;
  }

  function allText() {
    return [TITLE, MESSAGE, ...TOKENS, ...TOKEN_IDS, ...CAPTIONS.map((c) => c.text), '目山日月明木林森水鱼鸟人入云星完你', '一部纸片定格动画', 'Claude 用纸片、剪刀和文字制作'].join('');
  }
  async function loadFonts(timeout) {
    if (!document.fonts || !document.fonts.load) return;
    const text = allText();
    const faces = [`900 100px ${SERIF}`, `700 46px ${SERIF}`, `500 80px ${SANS}`, `700 30px ${MONO}`, `400 100px ${BRUSH}`];
    const all = Promise.all(faces.map((f) => document.fonts.load(f, text).catch(() => null)));
    await Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
  }

  let ready = null;
  function init(opts = {}) {
    if (ready) return ready;
    RES = opts.res ?? 1;
    ready = (async () => {
      await loadFonts(opts.fontTimeout ?? 15000);
      TEX = makeTex(512, 7);
      GRAIN = makeGrain(256, 3);
      LIGHT = makeLight();
      layout();
    })();
    return ready;
  }

  global.Film = {
    W, H, FPS,
    get total() { return TOTAL; },
    get res() { return RES; },
    chapters: SCENES.map((s) => ({ id: s.id, label: s.label, start: s.start, dur: s.dur, tone: s.tone })),
    captions: CAPTIONS,
    init,
    render,
    soundtrack,
    locate: (F) => { const { s, f } = locate(F); return { id: s.id, label: s.label, f }; },
    _internal: { C, L, SCENE },
  };
})(typeof window !== 'undefined' ? window : globalThis);
