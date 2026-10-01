(() => {
const { Engine, World, Bodies, Body, Events, Composite } = Matter;
const W = 400, H = 620, LINE = 110, WALL = 40, FLOOR0 = H - 8, MAXLV = 9;
const RISE_EVERY = 10000, RISE_STEP = 15; // ทุก 10 วิ พื้นดันขึ้น 15px (ปรับความยากได้ที่นี่)
const FRUITS = [
  {r:14,c:'#e74c3c',e:'🍒'},{r:20,c:'#ff6b81',e:'🍓'},{r:26,c:'#8e44ad',e:'🍇'},
  {r:33,c:'#f39c12',e:'🍊'},{r:41,c:'#e74c3c',e:'🍎'},{r:50,c:'#c8d86b',e:'🍐'},
  {r:60,c:'#ffb88c',e:'🍑'},{r:72,c:'#f1c40f',e:'🍍'},{r:85,c:'#9bd35a',e:'🍈'},{r:100,c:'#2ecc71',e:'🍉'}];
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const container = $('game-container');
const store = {
  get(k){ try { return +localStorage.getItem(k) || 0 } catch { return 0 } },
  set(k,v){ try { localStorage.setItem(k,v) } catch {} }
};

let engine, score, best = store.get('wm-best'), curLv, nextLv, aimX, canDrop, over, overTimer, last, acc;
let floorBody, floorTop, riseTarget, riseTimer, lastTick, winPending;

const rnd = () => Math.floor(Math.random() * 4);

function makeFruit(lv, x, y) {
  const b = Bodies.circle(x, y, FRUITS[lv].r, { restitution: .1, friction: .3, frictionStatic: .5, density: .001, label: 'fruit' });
  b.lv = lv; b.born = performance.now();
  return b;
}

function init() {
  engine = Engine.create({ gravity: { y: 1.3 } });
  floorTop = riseTarget = FLOOR0; riseTimer = 0; lastTick = 0; winPending = false;
  floorBody = Bodies.rectangle(W / 2, floorTop + WALL / 2, W + WALL * 2, WALL, { isStatic: true });
  World.add(engine.world, [
    floorBody,
    Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 3, { isStatic: true }),
    Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 3, { isStatic: true })
  ]);
  Events.on(engine, 'collisionStart', e => {
    for (const { bodyA: a, bodyB: b } of e.pairs) {
      if (a.isStatic !== b.isStatic) { const f = a.isStatic ? b : a; if (f.speed > 4) sfx.thud(f.speed); }
      if (a.label !== 'fruit' || b.label !== 'fruit' || a.lv !== b.lv || a.dead || b.dead) continue;
      a.dead = b.dead = true;
      const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
      Composite.remove(engine.world, [a, b]);
      addScore((a.lv + 1) * 2);
      sfx.merge(a.lv + 1);
      World.add(engine.world, makeFruit(a.lv + 1, x, y));
      if (a.lv + 1 === MAXLV) { addScore(500); winPending = true; } // ได้แตงโม = ชนะ
    }
  });
  score = 0; over = false; overTimer = 0; canDrop = true; aimX = W / 2; acc = 0;
  curLv = rnd(); nextLv = rnd();
  $('score').textContent = 0; $('best').textContent = best;
  $('end-screen').classList.remove('show', 'win'); $('warning-overlay').classList.remove('on');
}

function addScore(n) {
  score += n; $('score').textContent = score;
  if (score > best) { best = score; store.set('wm-best', best); $('best').textContent = best; }
}

function drop() {
  if (!canDrop || over) return;
  const r = FRUITS[curLv].r;
  const x = Math.min(W - r, Math.max(r, aimX));
  const f = makeFruit(curLv, x, 50);
  World.add(engine.world, f);
  sfx.drop();
  curLv = nextLv; nextLv = rnd(); canDrop = false;
  setTimeout(() => { canDrop = true; }, 500);
}

function endGame(win, msg) {
  over = true;
  $('final-score').textContent = score;
  $('end-title').textContent = win ? 'YOU WIN!' : 'GAME OVER';
  $('end-msg').textContent = win ? 'ผสมแตงโมสำเร็จ!' : (msg || '');
  $('warning-overlay').classList.remove('on');
  const el = $('end-screen'); el.classList.toggle('win', !!win); el.classList.add('show');
  win ? sfx.win() : sfx.lose();
}
window.restartGame = init;

// ---------- Sound (สังเคราะห์ด้วย WebAudio ไม่ต้องใช้ไฟล์เสียง) ----------
let AC, master, muted = !!store.get('wm-muted'), lastThud = 0;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination); } catch { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'sine', v = .2, f2 = f, delay = 0) {
  if (muted || !audio()) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .03);
}
const sfx = {
  drop: () => tone(520, .09, 'sine', .18, 260),
  thud: sp => { const n = performance.now(); if (n - lastThud < 70) return; lastThud = n; tone(140, .08, 'triangle', Math.min(.25, sp * .03), 70); },
  merge: lv => { const f = 330 * Math.pow(2, lv / 6); tone(f, .14, 'triangle', .25, f * 1.5); tone(f * 1.5, .18, 'sine', .15, f * 2, .07); },
  tick: () => tone(900, .06, 'square', .07),
  rise: () => { tone(90, .55, 'sawtooth', .2, 45); tone(60, .55, 'square', .1, 35); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .3, 'triangle', .25, f, i * .12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .3, 'sawtooth', .16, f * .9, i * .16))
};
const mb = $('mute-btn'), showMute = () => { mb.textContent = muted ? '🔇' : '🔊'; };
mb.addEventListener('click', () => { muted = !muted; store.set('wm-muted', muted ? 1 : 0); showMute(); if (!muted) { audio(); sfx.tick(); } });
showMute();

// ---------- Input ----------
const setAim = e => { const r = canvas.getBoundingClientRect(); aimX = (e.clientX - r.left) / r.width * W; };
canvas.addEventListener('pointerdown', e => { setAim(e); audio(); });
canvas.addEventListener('pointermove', setAim);
canvas.addEventListener('pointerup', e => { setAim(e); drop(); });
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') aimX -= 15;
  else if (e.key === 'ArrowRight') aimX += 15;
  else if (e.key === ' ' || e.key === 'Enter') drop();
});

// ---------- Render ----------
// ---------- Fruit graphics (vector, drawn in code) ----------
const TAU = Math.PI * 2;
function disc(x, y, rad, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU);
  ctx.fillStyle = fill || ctx.fillStyle; ctx.fill();
  if (stroke) { ctx.lineWidth = stroke[1]; ctx.strokeStyle = stroke[0]; ctx.stroke(); }
}
function grad(x, y, rad, c1, c2) {
  const g = ctx.createRadialGradient(x - rad * .35, y - rad * .35, rad * .1, x, y, rad);
  g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
}
function leaf(x, y, len, ang, col = '#4caf50') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .5, -len * .45, len, 0); ctx.quadraticCurveTo(len * .5, len * .45, 0, 0);
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#2e6b30'; ctx.stroke(); ctx.restore();
}
function stem(x1, y1, x2, y2, w = 2.5, col = '#6d4c41') {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + 3, (y1 + y2) / 2 - 2, x2, y2);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
}
function shine(x, y, r) {
  ctx.beginPath(); ctx.ellipse(x - r * .4, y - r * .45, r * .22, r * .12, -.7, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
}
function face(x, y, r) {
  const e = Math.max(1.3, r * .07), dx = r * .24;
  ctx.fillStyle = 'rgba(255,110,110,.38)'; disc(x - dx * 1.7, y + r * .1, e * 1.7); disc(x + dx * 1.7, y + r * .1, e * 1.7);
  ctx.fillStyle = '#3b2a20'; disc(x - dx, y, e); disc(x + dx, y, e);
  ctx.beginPath(); ctx.arc(x, y + r * .03, r * .12, .15 * Math.PI, .85 * Math.PI);
  ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = Math.max(1, r * .045); ctx.lineCap = 'round'; ctx.stroke();
}
function clipHatch(pathFn, r, col, step) {
  ctx.save(); pathFn(); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = -2 * r; i < 2 * r; i += step) { ctx.moveTo(i, -r * 1.2); ctx.lineTo(i + r * 1.2, r * 1.2); ctx.moveTo(i, r * 1.2); ctx.lineTo(i + r * 1.2, -r * 1.2); }
  ctx.stroke(); ctx.restore();
}

const DRAW = [
  r => { // cherry
    stem(0, -r * .6, r * .55, -r * 1.05, 2); leaf(r * .5, -r * 1.02, r * .55, -.3);
    disc(0, r * .1, r * .9, grad(0, r * .1, r * .9, '#ff7a7a', '#c0152b'), ['#7a0c1c', 2]);
    shine(0, r * .1, r * .9); face(0, r * .2, r * .9);
  },
  r => { // strawberry
    ctx.beginPath(); ctx.moveTo(0, r * .98);
    ctx.bezierCurveTo(r * .95, r * .5, r * 1.0, -r * .5, r * .6, -r * .6);
    ctx.quadraticCurveTo(0, -r * .8, -r * .6, -r * .6);
    ctx.bezierCurveTo(-r * 1.0, -r * .5, -r * .95, r * .5, 0, r * .98);
    ctx.fillStyle = grad(0, 0, r, '#ff8196', '#d6203f'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8f1230'; ctx.stroke();
    ctx.fillStyle = '#ffe28a';
    [[-.5,-.3],[.5,-.3],[0,-.45],[-.6,.2],[.6,.2],[-.3,.55],[.3,.55],[0,.8]].forEach(([a,b]) => { ctx.beginPath(); ctx.ellipse(a*r, b*r, r*.05, r*.08, 0, 0, TAU); ctx.fill(); });
    [-.9,-.45,0,.45,.9].forEach(a => leaf(0, -r * .62, r * .5, -Math.PI / 2 + a, '#43a047'));
    face(0, r * .1, r * .9);
  },
  r => { // grapes: พวงองุ่นทรงสามเหลี่ยมหยดน้ำ (ไม่กลม)
    stem(0, -r * .68, r * .08, -r * 1.02, 3); leaf(r * .04, -r * .82, r * .72, -.7, '#43a047');
    const b = r * .26;
    [[-.54,-.52],[-.18,-.52],[.18,-.52],[.54,-.52],[-.36,-.06],[0,-.06],[.36,-.06],[-.18,.4],[.18,.4],[0,.74]]
      .forEach(([px, py]) => { const x = px * r, y = py * r;
        disc(x, y, b, grad(x, y, b, '#cf94ec', '#6a2c91'), ['#3d1259', 1.3]); shine(x, y, b * .9); });
    face(0, -r * .02, r * .75);
  },
  r => { // orange
    disc(0, 0, r * .95, grad(0, 0, r * .95, '#ffb347', '#e8710a'), ['#a8480a', 2]);
    ctx.fillStyle = 'rgba(180,80,0,.3)';
    for (let k = 0; k < 14; k++) { const a = k * 2.4, d = r * (.3 + (k % 5) * .13); disc(Math.cos(a) * d, Math.sin(a) * d, 1); }
    disc(0, -r * .9, r * .08, '#4e8a2e'); leaf(r * .05, -r * .9, r * .45, -.4);
    shine(0, 0, r * .95); face(0, r * .1, r * .95);
  },
  r => { // apple
    disc(0, r * .05, r * .93, grad(0, 0, r * .93, '#ff6a5c', '#c4161c'), ['#7d0d12', 2]);
    ctx.beginPath(); ctx.ellipse(0, -r * .83, r * .17, r * .08, 0, 0, TAU); ctx.fillStyle = 'rgba(90,10,10,.5)'; ctx.fill();
    stem(0, -r * .8, r * .1, -r * 1.02, 3); leaf(r * .1, -r * .95, r * .5, -.5);
    shine(0, 0, r * .93); face(0, r * .1, r * .93);
  },
  r => { // pear
    const fill = (rad, y) => grad(0, y, rad, '#e6f07a', '#9db523');
    disc(0, r * .25, r * .73 + 1.5, '#6d7f1e'); disc(0, -r * .38, r * .5 + 1.5, '#6d7f1e');
    disc(0, r * .25, r * .73, fill(r * .73, r * .25)); disc(0, -r * .38, r * .5, fill(r * .5, -r * .38));
    stem(0, -r * .85, r * .12, -r * 1.05, 3); leaf(r * .1, -r * .98, r * .45, -.4);
    ctx.fillStyle = 'rgba(110,130,20,.4)'; [[-.3,.5],[.25,.6],[.35,.2],[-.4,.1]].forEach(([a,b]) => disc(a * r, b * r, 1.2));
    shine(0, r * .25, r * .73); face(0, r * .3, r * .8);
  },
  r => { // peach
    disc(0, r * .03, r * .93, grad(0, 0, r * .93, '#ffe0b8', '#ff8f84'), ['#c1544c', 2]);
    ctx.beginPath(); ctx.arc(r * .75, 0, r * .75, Math.PI * .72, Math.PI * 1.28); ctx.strokeStyle = 'rgba(190,70,60,.4)'; ctx.lineWidth = 2; ctx.stroke();
    leaf(0, -r * .85, r * .5, -.2 - Math.PI * .5 + .9); leaf(0, -r * .85, r * .45, -Math.PI * .5 - .2, '#5aa95e');
    shine(0, 0, r * .93); face(0, r * .1, r * .93);
  },
  r => { // pineapple
    const crown = ['#2e7d32', '#43a047', '#2e7d32', '#43a047', '#2e7d32'];
    [-.75, -.38, 0, .38, .75].forEach((a, i) => leaf(0, -r * .55, r * .55, -Math.PI / 2 + a, crown[i]));
    const body = () => { ctx.beginPath(); ctx.ellipse(0, r * .15, r * .74, r * .82, 0, 0, TAU); };
    body(); ctx.fillStyle = grad(0, r * .15, r * .85, '#ffe36e', '#f0a20c'); ctx.fill();
    clipHatch(body, r, 'rgba(150,90,0,.5)', r * .3);
    body(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#a66a00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,200,.85)'; ctx.beginPath(); ctx.ellipse(0, r * .12, r * .42, r * .2, 0, 0, TAU); ctx.fill();
    face(0, r * .12, r * .9);
  },
  r => { // melon
    const c = () => { ctx.beginPath(); ctx.arc(0, 0, r * .95, 0, TAU); };
    c(); ctx.fillStyle = grad(0, 0, r * .95, '#e3f7b0', '#86bf45'); ctx.fill();
    clipHatch(c, r, 'rgba(255,255,255,.4)', r * .28);
    c(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#4f7d26'; ctx.stroke();
    stem(0, -r * .9, r * .08, -r * 1.05, 4, '#7a5a35');
    ctx.fillStyle = 'rgba(240,255,210,.8)'; ctx.beginPath(); ctx.ellipse(0, r * .08, r * .45, r * .26, 0, 0, TAU); ctx.fill();
    face(0, r * .08, r);
  },
  r => { // watermelon (cut face)
    disc(0, 0, r * .98, '#2e7d32', ['#1b5e20', 2.5]);
    ctx.strokeStyle = '#1f6a2a'; ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(0, 0, r * .93, k * TAU / 8 + .1, k * TAU / 8 + .4); ctx.stroke(); }
    disc(0, 0, r * .86, '#d7f0b0'); disc(0, 0, r * .8, grad(0, 0, r * .8, '#ff7b8a', '#e0243c'));
    ctx.fillStyle = '#2b1a1a';
    for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + .3, d = r * .58; ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, 0, r * .035, r * .07, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    face(0, r * .02, r * 1.05);
  }
];

function drawFruit(lv, x, y, ang = 0, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
  DRAW[lv](FRUITS[lv].r);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  const fg = ctx.createLinearGradient(0, floorTop, 0, H); fg.addColorStop(0, '#8d6e63'); fg.addColorStop(1, '#4e342e');
  ctx.fillStyle = fg; ctx.fillRect(0, floorTop, W, H - floorTop + 1);
  ctx.fillStyle = '#b39286'; ctx.fillRect(0, floorTop, W, 4);
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2;
  for (let y = floorTop + 26; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.setLineDash([8, 6]); ctx.strokeStyle = '#e74c3c88'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, LINE); ctx.lineTo(W, LINE); ctx.stroke(); ctx.setLineDash([]);
  if (!over) {
    const r = FRUITS[curLv].r, x = Math.min(W - r, Math.max(r, aimX));
    ctx.strokeStyle = '#0002'; ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, floorTop); ctx.stroke();
    if (canDrop) drawFruit(curLv, x, 50, 0, .9);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NEXT', W - 36, 18); drawFruit(nextLv, W - 36, 48);
    const p = riseTimer / RISE_EVERY, bx = 165;
    ctx.fillStyle = '#0002'; ctx.fillRect(bx, 8, 90, 8);
    ctx.fillStyle = p > .7 ? '#e74c3c' : '#8d6e63'; ctx.fillRect(bx, 8, 90 * p, 8);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('RISE IN ' + Math.max(0, Math.ceil((RISE_EVERY - riseTimer) / 1000)) + 's', bx + 45, 30);
  }
  for (const b of Composite.allBodies(engine.world)) if (b.label === 'fruit') drawFruit(b.lv, b.position.x, b.position.y, b.angle);
}

// ---------- Loop ----------
const STEP = 1000 / 60;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(t - (last || t), 100); last = t;
  if (!over) {
    acc += dt;
    riseTimer += dt;
    const left = Math.ceil((RISE_EVERY - riseTimer) / 1000);
    if (left !== lastTick && left >= 1 && left <= 3) sfx.tick();
    lastTick = left;
    if (riseTimer >= RISE_EVERY) { riseTimer = 0; riseTarget -= RISE_STEP; sfx.rise(); }
    if (floorTop > riseTarget) floorTop = Math.max(riseTarget, floorTop - 40 * dt / 1000);
    Body.setPosition(floorBody, { x: W / 2, y: floorTop + WALL / 2 });
    while (acc >= STEP) { Engine.update(engine, STEP); acc -= STEP; }
    let warn = false;
    for (const b of Composite.allBodies(engine.world)) {
      if (b.label === 'fruit' && t - b.born > 1500 && b.position.y - FRUITS[b.lv].r < LINE && b.speed < 1.5) warn = true;
    }
    overTimer = warn ? overTimer + dt : 0;
    $('warning-overlay').classList.toggle('on', warn || floorTop - LINE < 90);
    if (winPending) endGame(true);
    else if (floorTop <= LINE) endGame(false, 'พื้นดันถึงเส้นก่อนผสมแตงโมได้');
    else if (overTimer > 2000) endGame(false, 'ผลไม้ล้นเกินเส้น');
  }
  render();
}

// ---------- Scale ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  container.style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit); fit();
document.addEventListener('visibilitychange', () => { last = 0; });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Install button ----------
let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('install-btn').hidden = false; });
$('install-btn').addEventListener('click', async () => {
  if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('install-btn').hidden = true;
});
addEventListener('appinstalled', () => { $('install-btn').hidden = true; });

init(); requestAnimationFrame(frame);
})();
