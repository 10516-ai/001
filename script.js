(() => {
const { Engine, World, Bodies, Body, Events, Composite } = Matter;
const W = 400, H = 620, LINE = 110, WALL = 40, FLOOR = H - 8, MAXLV = 9;
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

const rnd = () => Math.floor(Math.random() * 4);

function makeFruit(lv, x, y) {
  const b = Bodies.circle(x, y, FRUITS[lv].r, { restitution: .1, friction: .3, frictionStatic: .5, density: .001, label: 'fruit' });
  b.lv = lv; b.born = performance.now();
  return b;
}

function init() {
  engine = Engine.create({ gravity: { y: 1.3 } });
  World.add(engine.world, [
    Bodies.rectangle(W / 2, FLOOR + WALL / 2, W + WALL * 2, WALL, { isStatic: true }),
    Bodies.rectangle(-WALL / 2, H / 2, WALL, H * 3, { isStatic: true }),
    Bodies.rectangle(W + WALL / 2, H / 2, WALL, H * 3, { isStatic: true })
  ]);
  Events.on(engine, 'collisionStart', e => {
    for (const { bodyA: a, bodyB: b } of e.pairs) {
      if (a.label !== 'fruit' || b.label !== 'fruit' || a.lv !== b.lv || a.dead || b.dead) continue;
      a.dead = b.dead = true;
      const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
      Composite.remove(engine.world, [a, b]);
      if (a.lv === MAXLV) { addScore(200); continue; } // แตงโม + แตงโม = โบนัส
      addScore((a.lv + 1) * 2);
      World.add(engine.world, makeFruit(a.lv + 1, x, y));
    }
  });
  score = 0; over = false; overTimer = 0; canDrop = true; aimX = W / 2; acc = 0;
  curLv = rnd(); nextLv = rnd();
  $('score').textContent = 0; $('best').textContent = best;
  $('end-screen').classList.remove('show'); $('warning-overlay').classList.remove('on');
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
  curLv = nextLv; nextLv = rnd(); canDrop = false;
  setTimeout(() => { canDrop = true; }, 500);
}

function endGame() {
  over = true;
  $('final-score').textContent = score;
  $('end-title').textContent = score >= best && score > 0 ? 'NEW BEST!' : 'GAME OVER';
  $('end-screen').classList.add('show');
}
window.restartGame = init;

// ---------- Input ----------
const setAim = e => { const r = canvas.getBoundingClientRect(); aimX = (e.clientX - r.left) / r.width * W; };
canvas.addEventListener('pointerdown', setAim);
canvas.addEventListener('pointermove', setAim);
canvas.addEventListener('pointerup', e => { setAim(e); drop(); });
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') aimX -= 15;
  else if (e.key === 'ArrowRight') aimX += 15;
  else if (e.key === ' ' || e.key === 'Enter') drop();
});

// ---------- Render ----------
function drawFruit(lv, x, y, ang = 0, alpha = 1) {
  const { r, c, e } = FRUITS[lv];
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0003'; ctx.stroke();
  ctx.font = `${r * 1.3}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, 0, r * .06);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0001'; ctx.fillRect(0, FLOOR, W, 8);
  ctx.setLineDash([8, 6]); ctx.strokeStyle = '#e74c3c88'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, LINE); ctx.lineTo(W, LINE); ctx.stroke(); ctx.setLineDash([]);
  if (!over) {
    const r = FRUITS[curLv].r, x = Math.min(W - r, Math.max(r, aimX));
    ctx.strokeStyle = '#0002'; ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, FLOOR); ctx.stroke();
    if (canDrop) drawFruit(curLv, x, 50, 0, .9);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NEXT', W - 36, 18); drawFruit(nextLv, W - 36, 48);
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
    while (acc >= STEP) { Engine.update(engine, STEP); acc -= STEP; }
    let warn = false;
    for (const b of Composite.allBodies(engine.world)) {
      if (b.label === 'fruit' && t - b.born > 1500 && b.position.y - FRUITS[b.lv].r < LINE && b.speed < 1.5) warn = true;
    }
    overTimer = warn ? overTimer + dt : 0;
    $('warning-overlay').classList.toggle('on', warn);
    if (overTimer > 2000) endGame();
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
