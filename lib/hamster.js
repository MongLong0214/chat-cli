// /hamster — 정면 햄스터 픽셀 애니메이션 (▀ half-block, truecolor). 로컬 전용, 상대에게 전송 안 함.
const HALF_BLOCK = "▀";
const FPS = 24;
const GROUND = 0.93;
const CYCLE = 8;
const SEED_POP = 5.6;

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (c, d, t) => [mix(c[0], d[0], t), mix(c[1], d[1], t), mix(c[2], d[2], t)];
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutElastic = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
};
const ell = (x, y, cx, cy, rx, ry) =>
  (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
const circ = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const seg = (x, y, ax, ay, bx, by) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
};
const rot = (x, y, cx, cy, a) => {
  const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};
const hash = (a, b) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const hsv = (h, s, v) => {
  h = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return [m[0] * 255, m[1] * 255, m[2] * 255];
};
const norm3 = (x, y, z) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};
// SDF → 픽셀 커버리지 (안티앨리어싱)
const cover = (d, px) => clamp(0.5 - d / px);
const lineCover = (dist, px, w = 0.35) => clamp((w * px + 0.5 * px - dist) / px);

const LIGHT = norm3(-0.4, -0.65, 0.65);
const HALF_VEC = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const FUR = [238, 156, 76];
const FUR_DARK = [200, 112, 46];
const CREAM = [255, 246, 232];
const BLUSH = [255, 130, 162];
const PAW = [255, 188, 198];
const PAW_EDGE = [205, 112, 132];
const OUTLINE = [96, 48, 28];
const MOUTH = [165, 72, 96];
const WHITE = [255, 255, 255];
const WHISKER = [250, 246, 255];
const WHISKERS = [
  [0.44, -0.17, 0.78, -0.25],
  [0.46, -0.12, 0.8, -0.12],
  [0.44, -0.07, 0.76, 0.0],
];
const HEART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
const FONT = {
  H: ["#   #", "#   #", "#####", "#   #", "#   #"],
  A: [" ### ", "#   #", "#####", "#   #", "#   #"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  S: [" ####", "#    ", " ### ", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
};
const TITLE = "HAMSTER";

// 8초 주기: 점프(귀 펄럭) → 오물오물 → 볼에 쑤셔넣기(볼 빵빵) → 새 씨앗 뿅 → 두리번 → 꿀꺽
const makePose = (t) => {
  const cyc = t % CYCLE;
  const air = cyc < 0.6 ? Math.sin((cyc / 0.6) * Math.PI) : 0;
  const land = cyc >= 0.6 && cyc < 0.9 ? Math.sin(((cyc - 0.6) / 0.3) * Math.PI) : 0;
  const flop = cyc >= 0.6 && cyc < 2 ? Math.sin((cyc - 0.6) * 18) * Math.exp(-(cyc - 0.6) * 4) * 0.06 : 0;
  const stuff = smooth(4.6, 5.3, cyc);
  const lookDir = Math.floor(t / CYCLE) % 2 ? 1 : -1;
  const look = cyc > 6 && cyc < 7.2 ? Math.sin(((cyc - 6) / 1.2) * Math.PI) * lookDir : 0;
  const bt = t % 3.1;
  return {
    cyc,
    intro: Math.max(0.05, t < 0.9 ? easeOutElastic(t / 0.9) : 1),
    jump: air * 0.22,
    sx: 1 + land * 0.08 - air * 0.04,
    sy: 1 - land * 0.09 + air * 0.06 + Math.sin(t * 3) * 0.012,
    tilt: Math.sin(t * 0.9) * 0.06 + look * 0.06,
    lid: bt < 0.22 ? Math.sin((bt / 0.22) * Math.PI) : 0,
    lookX: look * 0.024 + Math.sin(t * 0.7) * 0.006,
    nib: cyc > 1 && cyc < 4.5 ? Math.max(0, Math.sin(t * 14)) : 0,
    puff: stuff * (1 - smooth(7.2, 7.9, cyc)),
    seedMove: cyc < SEED_POP ? stuff : 0,
    seedScale: cyc < SEED_POP ? 1 - stuff : easeOutElastic((cyc - SEED_POP) / 0.6),
    earL: flop + (cyc > 3 && cyc < 3.3 ? Math.sin(t * 50) * 0.035 : 0),
    earR: flop * 0.8 + (cyc > 6.5 && cyc < 6.8 ? Math.sin(t * 50) * 0.035 : 0),
  };
};

const headXY = (x, y, P) => rot(x, y, 0, -0.02, -P.tilt);
const cheekD = (hx, hy, s, P) => {
  const k = (1 + 0.08 * P.nib) * (s > 0 ? 1 + 0.42 * P.puff : 1);
  const cx = s * (0.35 + (s > 0 ? 0.1 * P.puff : 0));
  return ell(hx, hy, cx, -0.1 + (s > 0 ? 0.03 * P.puff : 0), 0.25 * k, 0.21 * k);
};
const bodyD = (x, y) => ell(x, y, 0, 0.3, 0.64, 0.58);
const headD = (hx, hy) => ell(hx, hy, 0, -0.3, 0.5, 0.4);
const earD = (hx, hy, s, P) => circ(hx, hy, s * 0.33, -0.6 + (s < 0 ? P.earL : P.earR), 0.15);
const footD = (x, y, s) => ell(x, y, s * 0.3, 0.86, 0.14, 0.07);

const blobD = (x, y, P) => {
  const [hx, hy] = headXY(x, y, P);
  let d = smin(smin(bodyD(x, y), headD(hx, hy), 0.2), Math.min(cheekD(hx, hy, -1, P), cheekD(hx, hy, 1, P)), 0.1);
  d = Math.min(d, earD(hx, hy, -1, P), earD(hx, hy, 1, P), footD(x, y, -1), footD(x, y, 1));
  return d;
};

// 털 바탕색 + 입체 음영 + AO + 림라이트
const furColor = (x, y, hx, hy, d, P, t) => {
  let c = FUR;
  const hd = headD(hx, hy);
  for (const s of [-1, 1]) {
    if (hd > 0 && earD(hx, hy, s, P) < 0) {
      const inner = circ(hx, hy, s * 0.33, -0.61 + (s < 0 ? P.earL : P.earR), 0.085);
      c = mixRGB(c, mixRGB([255, 170, 185], [228, 112, 140], clamp(1 + inner / 0.085)), clamp(0.5 - inner / 0.02));
    }
    if (footD(x, y, s) < 0 && y > 0.82) c = Math.sin((x - s * 0.3) * 80) > 0.75 ? [225, 140, 155] : PAW;
  }
  const lowCheek = Math.max(Math.min(cheekD(hx, hy, -1, P), cheekD(hx, hy, 1, P)), -(hy + 0.16));
  const creamD = Math.min(ell(x, y, 0, 0.42, 0.42, 0.44), ell(hx, hy, 0, -0.1, 0.27, 0.17), lowCheek);
  c = mixRGB(c, CREAM, clamp(0.5 - creamD / 0.04));
  c = mixRGB(c, FUR_DARK, clamp((-hy - 0.5) / 0.15) * 0.6);
  for (const s of [-1, 1]) {
    const bl = ell(hx, hy, s * (0.34 + (s > 0 ? 0.1 * P.puff : 0)), -0.18 + (s > 0 ? 0.03 * P.puff : 0), 0.1 + (s > 0 ? 0.05 * P.puff : 0), 0.055 + (s > 0 ? 0.02 * P.puff : 0));
    c = mixRGB(c, BLUSH, clamp(0.5 - bl / 0.045) * (0.55 + (s > 0 ? 0.2 * P.puff : 0)));
  }

  const e = 0.004;
  const gx = blobD(x + e, y, P) - blobD(x - e, y, P);
  const gy = blobD(x, y + e, P) - blobD(x, y - e, P);
  const gl = Math.hypot(gx, gy) || 1;
  const h = Math.sqrt(clamp(-d / 0.25));
  const [nx, ny, nz] = norm3((gx / gl) * (1 - h), (gy / gl) * (1 - h), h + 0.25);
  const diff = clamp(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const spec = Math.pow(clamp(nx * HALF_VEC[0] + ny * HALF_VEC[1] + nz * HALF_VEC[2]), 40);
  const bd = bodyD(x, y), hd2 = headD(hx, hy);
  const crease = clamp((Math.min(bd, hd2) - smin(bd, hd2, 0.2)) / 0.05);
  const ao = 1 - crease * 0.28;
  const fur = 1 + 0.05 * Math.sin(x * 120 + Math.sin(y * 60) * 2) * Math.sin(y * 90);
  const lum = (0.5 + 0.6 * diff) * fur * ao;
  const edge = Math.pow(1 - nz, 2.5);
  const rc = hsv(Math.atan2(y, x) * 57.3 + t * 120, 0.55, 1);
  return [
    c[0] * lum + spec * 110 + edge * (rc[0] * 0.35 + 40),
    c[1] * lum + spec * 110 + edge * (rc[1] * 0.35 + 12),
    c[2] * lum + spec * 110 + edge * (rc[2] * 0.35),
  ];
};

// returns { d, c } — d > 0.6px 이면 c null (햄스터 밖)
const shadeHamster = (x, y, P, px, t) => {
  const d = blobD(x, y, P);
  if (d > px * 0.6) return { d, c: null };
  const [hx, hy] = headXY(x, y, P);
  let c = furColor(x, y, hx, hy, Math.min(d, 0), P, t);
  c = mixRGB(c, OUTLINE, clamp((d + px * 1.3) / (px * 0.8)) * 0.92);

  // 눈: 그라데이션 홍채 + 하이라이트 2개 + 눈꺼풀
  for (const s of [-1, 1]) {
    const ex = s * 0.2 + P.lookX, ey = -0.3, R = 0.092;
    const de = circ(hx, hy, ex, ey, R);
    if (de > px) continue;
    const k = clamp((hy - ey + R) / (2 * R));
    let ec = [mix(14, 75, k * k), mix(10, 45, k * k), mix(26, 125, k * k)];
    ec = mixRGB(ec, WHITE, cover(circ(hx, hy, ex - 0.033, ey - 0.036, 0.034), px));
    ec = mixRGB(ec, WHITE, cover(circ(hx, hy, ex + 0.03, ey + 0.036, 0.015), px) * 0.9);
    const lidY = ey - R + 2 * R * P.lid;
    const visible = P.lid > 0.01 ? clamp((hy - lidY) / px + 0.5) : 1;
    c = mixRGB(c, ec, cover(de, px) * visible);
    if (P.lid > 0.05 && de < 0) c = mixRGB(c, [70, 32, 24], lineCover(Math.abs(hy - lidY), px, 0.5));
  }

  // 코 · 입(ω) · 앞니
  const dn = ell(hx, hy, 0, -0.175, 0.05, 0.034);
  if (dn < px) {
    const nc = mixRGB([245, 108, 140], [255, 228, 238], cover(circ(hx, hy, -0.016, -0.187, 0.013), px));
    c = mixRGB(c, nc, cover(dn, px));
  }
  if (Math.abs(hx) < 0.1 && hy > -0.16 && hy < -0.05) {
    let m = seg(hx, hy, 0, -0.145, 0, -0.118);
    for (const s of [-1, 1]) {
      if (hy > -0.118) m = Math.min(m, Math.abs(circ(hx, hy, s * 0.042, -0.118, 0.042)));
    }
    c = mixRGB(c, MOUTH, lineCover(m, px, 0.3));
    if (P.nib > 0.35) {
      const tooth = Math.max(Math.abs(hx) - 0.028, Math.abs(hy + 0.094) - 0.018);
      c = mixRGB(c, Math.abs(hx) < px * 0.5 ? [205, 200, 200] : [255, 255, 250], cover(tooth, px));
    }
  }

  // 해바라기씨 (볼로 이동/축소, 새 씨앗은 탄성 등장)
  const lift = P.nib * 0.035;
  if (P.seedScale > 0.03) {
    const sx0 = mix(0, 0.4, P.seedMove), sy0 = mix(0.08 - lift, -0.08, P.seedMove);
    const sc = P.seedScale, lx = (x - sx0) / sc, ly = (y - sy0) / sc;
    const taper = 0.55 + 0.45 * clamp((ly + 0.12) / 0.18);
    const ds = ell(lx, ly, 0, 0, 0.08 * taper, 0.12) * sc;
    if (ds < px) {
      const stripe = lineCover(Math.min(Math.abs(Math.abs(lx) - 0.035 * taper), Math.abs(lx)) * sc, px, 0.3);
      let seedC = mixRGB([72, 68, 78], [232, 230, 218], stripe);
      seedC = mixRGB(seedC, [120, 116, 130], clamp((-0.04 - ly) / 0.06) * 0.5);
      seedC = mixRGB(seedC, [26, 24, 30], clamp((ds + px * 1.2) / (px * 0.7)));
      c = mixRGB(c, seedC, cover(ds, px));
    }
  }
  // 앞발 (씨앗 앞)
  for (const s of [-1, 1]) {
    const pcx = s * (0.11 + (s > 0 ? P.seedMove * 0.12 : 0)), pcy = 0.15 - lift - P.seedMove * (s > 0 ? 0.16 : 0.04);
    const dp = ell(x, y, pcx, pcy, 0.085, 0.07);
    if (dp < px) {
      let pc = mixRGB(PAW, PAW_EDGE, clamp((dp + px * 1.2) / (px * 0.7)));
      const fx = x - pcx;
      if (y < pcy - 0.015) {
        const groove = Math.min(Math.abs(fx - 0.028), Math.abs(fx + 0.028));
        pc = mixRGB(pc, PAW_EDGE, lineCover(groove, px, 0.15) * 0.8);
      }
      c = mixRGB(c, pc, cover(dp, px));
    }
  }
  return { d, c };
};

const whiskerCover = (x, y, P, px, d) => {
  if (d < -0.012) return 0;
  const [hx, hy] = headXY(x, y, P);
  const ax = Math.abs(hx);
  if (ax < 0.42 || ax > 0.84) return 0;
  const tw = P.nib * 0.025;
  let a = 0;
  for (const w of WHISKERS) a = Math.max(a, lineCover(seg(ax, hy, w[0], w[1], w[2], w[3] - tw), px, 0.18));
  return a * (0.6 + 0.4 * clamp((0.8 - ax) / 0.2));
};

const makeBokeh = (t) =>
  Array.from({ length: 14 }, (_, i) => {
    const h1 = hash(i, 1), h2 = hash(i, 2), h3 = hash(i, 3);
    return {
      x: h1 * 3 - 1.5 + Math.sin(t * 0.3 + i) * 0.08,
      y: ((((h2 * 2.4 - t * 0.04 * (0.5 + h3)) % 2.4) + 2.4) % 2.4) - 1.3,
      r: 0.05 + h3 * 0.1,
      c: hsv(i * 47 + t * 20, 0.55, 1),
    };
  });

const background = (x, y, t, P, px, py, bokeh) => {
  if (y > GROUND) {
    const k = clamp((y - GROUND) / 0.4);
    let c = mixRGB([100, 54, 128], [30, 15, 50], k);
    c = mixRGB(c, [180, 140, 220], (0.5 + 0.5 * Math.sin(x * 6 - t * 0.6)) * 0.08 * (1 - k));
    const spread = 1 - P.jump * 2.2;
    const sd = ell(x, y, 0, GROUND + 0.025, 0.62 * spread, 0.07 * spread);
    c = mixRGB(c, [14, 8, 24], clamp(-sd / 0.05) * 0.6 * spread);
    c = mixRGB(c, hsv(x * 90 - t * 160, 0.55, 1), clamp(1 - (y - GROUND) / 0.025));
    return c;
  }
  const g = clamp((y + 1.2) / 2.2);
  let c = [mix(38, 20, g), mix(14, 10, g), mix(72, 48, g)];
  const ay = y + 0.25, a = Math.atan2(ay, x), rr = Math.hypot(x, ay);
  const ray = smooth(0.05, 0.55, Math.sin(a * 10 + t * 0.8));
  c = mixRGB(c, hsv(a * 57.3 + t * 60, 0.7, 1), ray * 0.3 * clamp(1.6 - rr * 0.55));
  c = mixRGB(c, [255, 200, 235], Math.pow(clamp(1 - rr / 1.15), 2) * 0.35);
  for (const b of bokeh) {
    const bd = Math.hypot(x - b.x, y - b.y);
    if (bd < b.r) c = mixRGB(c, b.c, (1 - smooth(b.r * 0.6, b.r, bd)) * 0.16 + (Math.abs(bd - b.r * 0.85) < 0.01 ? 0.08 : 0));
  }
  const st = hash(px, py);
  if (st > 0.995) c = mixRGB(c, WHITE, 0.5 + 0.5 * Math.sin(t * 4 + st * 500));
  return c;
};

const layout = (pw, ph) => {
  const ps = pw >= 90 && ph >= 60 ? 2 : 1;
  const titleH = 5 * ps + 7;
  const unit = Math.max(6, Math.min((ph - titleH - 1) / 2.25, (pw * 0.92) / 1.9));
  return { ps, titleH, unit, ox: pw / 2, oy: titleH + 1.08 * unit };
};

const captionFor = (S) => {
  const cyc = S.t % CYCLE;
  const phase =
    cyc < 0.9 ? "boing!" : cyc < 4.6 ? "nom nom nom" : cyc < SEED_POP ? "*stuffing cheeks*" : cyc < 7.2 ? "...more seeds?" : "gulp";
  const stored = Math.max(0, Math.floor((S.t - 5.3) / CYCLE) + 1);
  return `~ ${phase} ~   cheek storage: ${stored}   ~ q / Esc: exit ~`;
};

export const createHamsterScene = () => {
  const S = { t: 0, parts: [], heartCD: 0.4 };

  const step = (dt) => {
    const prevCyc = S.t % CYCLE;
    S.t += dt;
    const cyc = S.t % CYCLE;
    const rnd = Math.random;
    if (rnd() < dt * 9) {
      S.parts.push({ k: "spark", x: (rnd() - 0.5) * 2.4, y: -1 + rnd() * 1.8, vx: 0, vy: 0, life: 0, max: 0.6 + rnd() * 0.8, hue: rnd() * 360 });
    }
    if (prevCyc < SEED_POP && cyc >= SEED_POP) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, sp = 0.9 + rnd() * 0.5;
        S.parts.push({ k: "burst", x: 0, y: 0.1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.55, hue: i * 22 });
      }
    }
    S.heartCD -= dt;
    if (S.heartCD <= 0) {
      S.heartCD = 0.6 + rnd() * 0.8;
      S.parts.push({ k: "heart", x: (rnd() - 0.5) * 0.5, y: -0.72, vx: (rnd() - 0.5) * 0.3, vy: -0.35, life: 0, max: 2.2, hue: 330 + rnd() * 30 });
    }
    for (const p of S.parts) {
      p.life += dt;
      p.x += p.vx * dt + (p.k === "heart" ? Math.sin(p.life * 4) * 0.003 : 0);
      p.y += p.vy * dt;
      if (p.k === "burst") {
        p.vx *= 1 - dt * 4;
        p.vy *= 1 - dt * 4;
      }
    }
    S.parts = S.parts.filter((p) => p.life < p.max).slice(-220);
  };

  const renderPixels = (pw, ph) => {
    const t = S.t, P = makePose(t), L = layout(pw, ph), bokeh = makeBokeh(t);
    const buf = new Uint8ClampedArray(pw * ph * 3);
    const mask = new Uint8Array(pw * ph);
    const pxb = 1 / (L.unit * P.intro);
    const toBody = (x, y) => [x / (P.sx * P.intro), GROUND + (y + P.jump - GROUND) / (P.sy * P.intro)];
    const blendPx = (px, py, c, a = 1) => {
      if (px < 0 || px >= pw || py < 0 || py >= ph || a <= 0) return;
      const i = (py * pw + px) * 3;
      buf[i] = mix(buf[i], c[0], a);
      buf[i + 1] = mix(buf[i + 1], c[1], a);
      buf[i + 2] = mix(buf[i + 2], c[2], a);
    };

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const x = (px + 0.5 - L.ox) / L.unit, y = (py + 0.5 - L.oy) / L.unit;
        let bgc = null;
        const bg = () => bgc || (bgc = background(x, y, t, P, px, py, bokeh));
        let c = null;
        if (Math.abs(x) < 1.05 && y > -1.2 && y < GROUND + 0.05) {
          const [bx, by] = toBody(x, y);
          const r = shadeHamster(bx, by, P, pxb, t);
          if (r.c) {
            const a = cover(r.d, pxb);
            c = a >= 1 ? r.c : mixRGB(bg(), r.c, a);
            if (a > 0.5) mask[py * pw + px] = 1;
          } else if (r.d < 0.08) {
            const glow = Math.pow(1 - r.d / 0.08, 2) * 0.5;
            c = mixRGB(bg(), hsv(Math.atan2(by, bx) * 57.3 + t * 150, 0.7, 1), glow);
          }
          const wa = whiskerCover(bx, by, P, pxb, r.d);
          if (wa > 0) c = mixRGB(c || bg(), WHISKER, wa);
        } else if (y > GROUND && y < GROUND + 0.45 && Math.abs(x) < 1.05) {
          const [bx, by] = toBody(x, 2 * GROUND - y + 0.01);
          const r = shadeHamster(bx, by, P, pxb, t);
          if (r.c) c = mixRGB(bg(), r.c, cover(r.d, pxb) * 0.3 * (1 - (y - GROUND) / 0.45));
        }
        const out = c || bg();
        const i = (py * pw + px) * 3;
        buf[i] = out[0]; buf[i + 1] = out[1]; buf[i + 2] = out[2];
      }
    }

    const free = (qx, qy) => qx >= 0 && qx < pw && qy >= 0 && qy < ph && !mask[qy * pw + qx];
    for (const p of S.parts) {
      const cx = Math.round(L.ox + p.x * L.unit), cy = Math.round(L.oy + p.y * L.unit);
      const f = p.life / p.max;
      if (p.k === "spark") {
        const size = Math.sin(f * Math.PI) * 2.4;
        const col = hsv(p.hue + t * 200, 0.45, 1);
        if (free(cx, cy)) blendPx(cx, cy, size > 1.2 ? WHITE : col, clamp(size));
        for (let k = 1; k <= Math.ceil(size); k++) {
          const a = clamp(size - k + 1) * (1 - (k - 1) / 3);
          for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) if (free(cx + dx, cy + dy)) blendPx(cx + dx, cy + dy, col, a);
        }
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (free(cx + dx, cy + dy)) blendPx(cx + dx, cy + dy, col, clamp(size - 1) * 0.35);
      } else if (p.k === "burst") {
        const col = hsv(p.hue + t * 300, 0.5, 1);
        blendPx(cx, cy, f < 0.4 ? WHITE : col, 1 - f);
        blendPx(cx - Math.round(p.vx * 1.5), cy - Math.round(p.vy * 1.5), col, (1 - f) * 0.5);
      } else {
        const col = hsv(p.hue + Math.sin(t * 8) * 10, 0.62, 1);
        const a = (1 - smooth(0.7, 1, f)) * smooth(L.titleH + 1, L.titleH + 8, cy);
        const inside = (rx, ry) => ry >= 0 && ry < HEART.length && rx >= 0 && rx < 7 && HEART[ry][rx] === "#";
        for (let ry = -1; ry <= HEART.length; ry++) {
          for (let rx = -1; rx <= 7; rx++) {
            const qx = cx - 3 + rx, qy = cy - 3 + ry;
            if (inside(rx, ry)) blendPx(qx, qy, ry <= 2 && rx === 1 ? WHITE : ry >= 3 ? mixRGB(col, [150, 30, 80], 0.3) : col, a);
            else if (inside(rx - 1, ry) || inside(rx + 1, ry) || inside(rx, ry - 1) || inside(rx, ry + 1)) blendPx(qx, qy, [90, 20, 60], a * 0.85);
          }
        }
      }
    }

    // 타이틀: 그림자 → 외곽선 → 광택 그라데이션 + 샤인
    const tw = (6 * TITLE.length - 1) * L.ps;
    const c0 = Math.floor((pw - tw) / 2);
    const shine = ((t * 60) % (tw + 30)) - 15 + c0;
    const titlePx = [];
    for (let i = 0; i < TITLE.length; i++) {
      const g = FONT[TITLE[i]];
      const yo = Math.round(Math.sin(t * 5 - i * 0.8) * 1.2);
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 5; gx++) {
          if (g[gy][gx] !== "#") continue;
          for (let ky = 0; ky < L.ps; ky++)
            for (let kx = 0; kx < L.ps; kx++) titlePx.push([c0 + (i * 6 + gx) * L.ps + kx, 3 + gy * L.ps + ky + yo, gy]);
        }
    }
    for (const [qx, qy] of titlePx) blendPx(qx + 2, qy + 2, [20, 6, 36], 0.7);
    for (const [qx, qy] of titlePx) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) blendPx(qx + dx, qy + dy, [45, 12, 70]);
    }
    for (const [qx, qy, gy] of titlePx) {
      let col = hsv(qx * 4 - t * 200 + qy * 10, 0.72, 1);
      col = gy === 0 ? mixRGB(col, WHITE, 0.4) : gy === 4 ? mixRGB(col, [0, 0, 0], 0.18) : col;
      blendPx(qx, qy, Math.abs(qx - qy - shine) < 3 ? WHITE : col);
    }
    return { buf, layout: L };
  };

  const frame = (cols, rows) => {
    const pw = cols, ph = rows * 2;
    const { buf, layout: L } = renderPixels(pw, ph);
    const caption = captionFor(S);
    const capRow = Math.ceil((L.titleH + 1) / 2) - 1;
    const capCol = Math.max(0, Math.floor((cols - caption.length) / 2));
    let s = "";
    for (let r = 0; r < rows; r++) {
      s += `\x1b[${r + 1};1H`;
      let last = "";
      for (let c = 0; c < cols; c++) {
        const ti = (r * 2 * pw + c) * 3, bi = ((r * 2 + 1) * pw + c) * 3;
        const ch = r === capRow && c >= capCol && c < capCol + caption.length ? caption[c - capCol] : null;
        let code;
        if (ch && ch !== " ") {
          const fg = hsv((c - capCol) * 8 - S.t * 240, 0.45, 1);
          const bgc = mixRGB([buf[ti], buf[ti + 1], buf[ti + 2]], [buf[bi], buf[bi + 1], buf[bi + 2]], 0.5).map((v) => (v * 0.6) | 0);
          code = `\x1b[38;2;${fg[0] | 0};${fg[1] | 0};${fg[2] | 0};48;2;${bgc[0]};${bgc[1]};${bgc[2]}m`;
          s += (code === last ? "" : code) + ch;
        } else {
          code = `\x1b[38;2;${buf[ti]};${buf[ti + 1]};${buf[ti + 2]};48;2;${buf[bi]};${buf[bi + 1]};${buf[bi + 2]}m`;
          s += (code === last ? "" : code) + HALF_BLOCK;
        }
        last = code;
      }
    }
    return s + "\x1b[0m";
  };

  return { state: S, step, renderPixels, frame };
};

// readline의 keypress 리스너를 잠시 떼어 두고 대체 화면에서 재생. q / Esc / Ctrl+C 로 종료.
export const playHamster = ({ input, output }) =>
  new Promise((resolve) => {
    const scene = createHamsterScene();
    const savedKeypress = input.listeners("keypress");
    const restoreScreen = () => output.write("\x1b[0m\x1b[?25h\x1b[?1049l");
    let last = performance.now();
    let timer = null;

    const draw = () => {
      const now = performance.now();
      scene.step(Math.min(0.1, (now - last) / 1000));
      last = now;
      output.write(scene.frame(output.columns || 80, output.rows || 24));
    };
    const stop = () => {
      clearInterval(timer);
      input.removeListener("keypress", onKey);
      for (const l of savedKeypress) input.on("keypress", l);
      process.removeListener("exit", restoreScreen);
      restoreScreen();
      resolve();
    };
    const onKey = (str, key) => {
      if (str === "q" || str === "Q" || key?.name === "escape" || (key?.ctrl && key.name === "c")) stop();
    };

    input.removeAllListeners("keypress");
    input.on("keypress", onKey);
    process.once("exit", restoreScreen);
    output.write("\x1b[?1049h\x1b[?25l\x1b[2J");
    draw();
    timer = setInterval(draw, 1000 / FPS);
  });
