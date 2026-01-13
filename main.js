/*
Lemmings-lite
- Canvas 2D grid
- Basic lemming AI: walk -> turn on obstacle, fall in gaps, die in water/lava
- Abilities: Climber, Floater, Bomber, Blocker, Builder, Basher, Miner, Digger
- Limited counts per level
- Frame-by-frame JSON recording for instant replay/export
- Replay mode replays stored frames
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

/* ----- CONFIG ----- */
const TILE = 24; // pixels
const W = Math.floor(canvas.width / TILE);
const H = Math.floor(canvas.height / TILE);

const ABILITIES = [
  { id: 'climber', name: 'Climber', color: '#2b8c2b', max: 3 },
  { id: 'floater', name: 'Floater', color: '#0b6b9a', max: 3 },
  { id: 'bomber', name: 'Bomber', color: '#b03a2e', max: 2 },
  { id: 'blocker', name: 'Blocker', color: '#6b6b6b', max: 2 },
  { id: 'builder', name: 'Builder', color: '#a06f1f', max: 2 },
  { id: 'basher', name: 'Basher', color: '#9a4b8c', max: 2 },
  { id: 'miner', name: 'Miner', color: '#8b5a2e', max: 2 },
  { id: 'digger', name: 'Digger', color: '#5a3b1f', max: 2 },
];

const TILE_TYPES = {
  EMPTY: 0,
  SOLID: 1,
  WATER: 2,
  LAVA: 3,
  ENTRANCE: 4,
  EXIT: 5,
};

/* ----- STATE ----- */
let grid = [];
let lemmings = [];
let frameIndex = 0;
let playing = false;
let mode = 'play'; // 'play' | 'replay'
let selectedAbility = null;
let abilityCounts = {};
let replayFrames = []; // each frame is snapshot JSON
let replayLoaded = null;
let stats = { saved: 0, alive: 0 };

const levels = createLevels();
let currentLevelIndex = 0;

/* ----- BOILERPLATE UI ----- */
const levelSelect = document.getElementById('levelSelect');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const stepBtn = document.getElementById('stepBtn');
const abilityButtonsDiv = document.getElementById('abilityButtons');
const timeLabel = document.getElementById('timeLabel');
const savedLabel = document.getElementById('savedLabel');
const aliveLabel = document.getElementById('aliveLabel');
const modeSelect = document.getElementById('modeSelect');
const saveJsonBtn = document.getElementById('saveJsonBtn');
const loadJsonBtn = document.getElementById('loadJsonBtn');
const jsonFileInput = document.getElementById('jsonFileInput');

levels.forEach((lvl, i) => {
  const o = document.createElement('option');
  o.value = i;
  o.textContent = `Level ${i+1} — ${lvl.name}`;
  levelSelect.appendChild(o);
});
levelSelect.addEventListener('change', () => {
  currentLevelIndex = Number(levelSelect.value);
  resetLevel();
});

startBtn.onclick = () => { playing = true; };
pauseBtn.onclick = () => { playing = false; };
resetBtn.onclick = () => { resetLevel(); };
stepBtn.onclick = () => { step(); };

modeSelect.onchange = (e) => {
  mode = e.target.value;
  if (mode === 'replay') {
    playing = false;
  }
};

saveJsonBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(replayFrames, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lemmings_replay_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

loadJsonBtn.onclick = () => jsonFileInput.click();
jsonFileInput.onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const data = JSON.parse(txt);
    replayLoaded = data;
    modeSelect.value = 'replay';
    mode = 'replay';
    playing = false;
    frameIndex = 0;
    drawFrameFromSnapshot(replayLoaded[0]);
  } catch (err) {
    alert('Invalid JSON');
  }
};

/* Abilities UI */
function buildAbilityUI() {
  abilityButtonsDiv.innerHTML = '';
  for (const ab of ABILITIES) {
    const btn = document.createElement('button');
    btn.className = 'abilityBtn';
    btn.textContent = `${ab.name} (${abilityCounts[ab.id]})`;
    btn.style.borderLeft = `4px solid ${ab.color}`;
    btn.onclick = () => {
      selectedAbility = (selectedAbility === ab.id) ? null : ab.id;
      updateAbilitySelection();
    };
    btn.dataset.ability = ab.id;
    abilityButtonsDiv.appendChild(btn);
  }
}
function updateAbilitySelection() {
  for (const btn of abilityButtonsDiv.children) {
    if (btn.dataset.ability === selectedAbility) btn.classList.add('selected');
    else btn.classList.remove('selected');
    const id = btn.dataset.ability;
    const ab = ABILITIES.find(a => a.id === id);
    btn.textContent = `${ab.name} (${abilityCounts[id]})`;
  }
}

/* ----- LEVELS / GRID ----- */
function createLevels(){
  // create two simple levels for demo. grid is HxW
  const baseEmpty = () => {
    const g = Array.from({length:H}, ()=>Array.from({length:W}, ()=>TILE_TYPES.EMPTY));
    return g;
  };

  const lvl1 = {
    name: 'Easy Slope',
    grid: (() => {
      const g = baseEmpty();
      // floor
      for (let x=0;x<W;x++) g[H-3][x] = TILE_TYPES.SOLID;
      // pit
      for (let x=18;x<24;x++) g[H-3][x] = TILE_TYPES.EMPTY;
      // water pit
      for (let x=38;x<44;x++) g[H-3][x] = TILE_TYPES.WATER;
      // entrance left
      g[H-4][2] = TILE_TYPES.ENTRANCE;
      // exit right
      g[H-4][W-3] = TILE_TYPES.EXIT;
      return g;
    })(),
    spawnDelayFrames: 45,
    maxSpawn: 12,
    requiredSavePct: 0.5,
    abilities: {
      climber: 2, floater: 2, bomber: 0, blocker: 1, builder:1, basher:1, miner:0, digger:0
    }
  };

  const lvl2 = {
    name: 'Traps & Lava',
    grid: (() => {
      const g = baseEmpty();
      for (let x=0;x<W;x++) g[H-4][x] = TILE_TYPES.SOLID;
      // lava channel
      for (let x=20;x<28;x++) g[H-4][x] = TILE_TYPES.LAVA;
      // split platforms
      for (let x=30;x<36;x++) g[H-6][x] = TILE_TYPES.SOLID;
      for (let x=45;x<52;x++) g[H-8][x] = TILE_TYPES.SOLID;
      // entrance
      g[H-5][3] = TILE_TYPES.ENTRANCE;
      // exit
      g[H-9][W-4] = TILE_TYPES.EXIT;
      return g;
    })(),
    spawnDelayFrames: 60,
    maxSpawn: 18,
    requiredSavePct: 0.6,
    abilities: {
      climber: 3, floater: 2, bomber: 1, blocker: 1, builder:2, basher:1, miner:1, digger:1
    }
  };

  return [lvl1, lvl2];
}

/* ----- GRID HELPERS ----- */
function resetGridFromLevel(level){
  grid = level.grid.map(row => row.slice());
}

/* ----- LEMMING MODEL ----- */
function spawnLemming(x, y){
  const id = Math.random().toString(36).slice(2,9);
  const lem = {
    id,
    x, y, // floats in tile space
    vx: 0.8, // tiles per frame
    dir: 1, // 1 = right, -1 = left
    state: 'walking', // walking, falling, dead, saved, blocker-standing, building, bombing, climbing, digging, bashing, mining
    ability: null,
    abilityTimer: 0,
    onGround: false,
    width: 0.8,
    height: 1.4,
    exploded: false,
  };
  lemmings.push(lem);
  return lem;
}

/* ----- SIM STEP ----- */
function updatePhysics(level){
  // spawn logic
  if (frameIndex % level.spawnDelayFrames === 0 && lemmings.filter(l=>l.spawned).length < level.maxSpawn) {
    // find entrance tile
    outer:
    for (let ty=0;ty<H;ty++){
      for (let tx=0;tx<W;tx++){
        if (grid[ty][tx] === TILE_TYPES.ENTRANCE){
          const lem = spawnLemming(tx + 0.2, ty);
          lem.spawned = true;
          break outer;
        }
      }
    }
  }

  // update each lemming
  for (const lem of lemmings){
    if (lem.state === 'dead' || lem.state === 'saved') continue;

    // gravity
    const belowY = Math.floor(lem.y + 1.4);
    const belowX = Math.floor(lem.x + 0.4);
    const tileBelow = tileAt(belowX, belowY);

    if (!isSolidTile(tileBelow)) {
      // falling
      lem.y += 0.6; // fall speed
      lem.state = 'falling';
      lem.onGround = false;
    } else {
      if (lem.state === 'falling') {
        lem.state = 'walking';
      }
      lem.onGround = true;
    }

    // horizontal movement when on ground or walking
    if (lem.onGround && lem.state !== 'blocker-standing') {
      // simple collision ahead
      const aheadX = Math.floor(lem.x + (lem.dir === 1 ? 1.1 : -0.2));
      const aheadY = Math.floor(lem.y + 0.5);
      const tileAhead = tileAt(aheadX, aheadY);
      if (isSolidTile(tileAhead)) {
        // turn around
        if (lem.ability === 'climber' && canClimb(lem)) {
          lem.state = 'climbing';
          lem.y -= 0.8; // climb one tile
        } else {
          lem.dir *= -1;
        }
      } else {
        // move
        lem.x += lem.vx * lem.dir;
      }
    } else if (lem.state === 'blocker-standing') {
      // do nothing; reverse others handled elsewhere
    }

    // interactions with special tiles
    const tx = Math.floor(lem.x + 0.5);
    const ty = Math.floor(lem.y + 0.5);
    const here = tileAt(tx, ty);
    if (here === TILE_TYPES.WATER) {
      if (lem.ability === 'floater') {
        // safe
      } else {
        lem.state = 'dead';
      }
    } else if (here === TILE_TYPES.LAVA) {
      lem.state = 'dead';
    } else if (here === TILE_TYPES.EXIT) {
      lem.state = 'saved';
      stats.saved++;
    }

    // blocker effect: reverse nearby walkers
    if (lem.state === 'blocker-standing') {
      for (const other of lemmings){
        if (other === lem || other.state==='dead' || other.state==='saved') continue;
        if (distanceTiles(lem, other) < 1.1 && other.dir === (lem.dir)) {
          other.dir *= -1;
        }
      }
    }

    // bomber: countdown
    if (lem.ability === 'bomber' && lem.state !== 'dead') {
      lem.abilityTimer--;
      if (lem.abilityTimer <= 0 && !lem.exploded) {
        explodeAt(Math.floor(lem.x), Math.floor(lem.y));
        lem.exploded = true;
        lem.state = 'dead';
      }
    }
  }

  stats.alive = lemmings.filter(l => l.state !== 'dead' && l.state !== 'saved').length;
}

/* ----- HELPERS ----- */
function tileAt(tx, ty){
  if (tx < 0 || tx >= W || ty < 0 || ty >= H) return TILE_TYPES.SOLID;
  return grid[ty][tx];
}
function isSolidTile(t){ return t === TILE_TYPES.SOLID; }
function canClimb(lem){
  const aheadX = Math.floor(lem.x + (lem.dir === 1 ? 1.1 : -0.2));
  const aheadY = Math.floor(lem.y);
  return tileAt(aheadX, aheadY) === TILE_TYPES.SOLID;
}
function distanceTiles(a,b){
  return Math.hypot(a.x-b.x, a.y-b.y);
}
function explodeAt(tx, ty){
  // destroy a 3x3 area of solid tiles
  for (let oy=-1; oy<=1; oy++){
    for (let ox=-1; ox<=1; ox++){
      const x = tx + ox, y = ty + oy;
      if (x>0 && x<W && y>0 && y<H && grid[y][x] === TILE_TYPES.SOLID) grid[y][x] = TILE_TYPES.EMPTY;
    }
  }
}

/* ----- PLAYER INTERACTIONS ----- */
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const tx = Math.floor(cx / TILE);
  const ty = Math.floor(cy / TILE);

  // click lemming?
  const clicked = lemmings.find(l => {
    const lx = Math.floor(l.x);
    const ly = Math.floor(l.y);
    return lx === tx && ly === ty && l.state !== 'dead' && l.state !== 'saved';
  });
  if (clicked && selectedAbility) {
    if (abilityCounts[selectedAbility] > 0) {
      assignAbility(clicked, selectedAbility);
      abilityCounts[selectedAbility]--;
      updateAbilitySelection();
    } else {
      // out of ability
      flashMessage('No ability remaining');
    }
  }
});

/* ----- ABILITY ASSIGNMENT ----- */
function assignAbility(lem, ab){
  lem.ability = ab;
  switch(ab){
    case 'floater':
      lem.abilityTimer = 9999;
      break;
    case 'bomber':
      lem.abilityTimer = 120; // frames until explode
      break;
    case 'blocker':
      lem.state = 'blocker-standing';
      break;
    case 'builder':
      lem.state = 'building';
      break;
    case 'climber':
      // passive
      break;
    case 'digger':
      lem.state = 'digging';
      break;
    case 'basher':
      lem.state = 'bashing';
      break;
    case 'miner':
      lem.state = 'mining';
      break;
  }
}

/* ----- FRAME RECORDING ----- */
function snapshotFrame(){
  // store only minimal necessary state: lemmings and grid
  const lems = lemmings.map(l => ({
    id: l.id, x: l.x, y: l.y, dir: l.dir, state: l.state, ability: l.ability
  }));
  return { frame: frameIndex, lemmings: lems, grid, stats: { ...stats } };
}

/* ----- DRAWING ----- */
function draw(){
  // clear
  ctx.fillStyle = '#b7e0ff';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw grid tiles
  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++){
      const t = grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (t === TILE_TYPES.SOLID){
        ctx.fillStyle = '#6b4b2e';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.WATER){
        ctx.fillStyle = '#2a9df4';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.LAVA){
        ctx.fillStyle = '#ff6b3a';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.ENTRANCE){
        ctx.fillStyle = '#2ea44f';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.EXIT){
        ctx.fillStyle = '#2b6eff';
        ctx.fillRect(px,py,TILE,TILE);
      } else {
        // empty background tile pattern (subtle)
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(px,py,TILE,TILE);
      }
    }
  }

  // draw lemmings
  for (const l of lemmings){
    const px = (l.x) * TILE;
    const py = (l.y) * TILE;
    // body
    if (l.state === 'dead'){
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(px+TILE*0.5, py+TILE*0.5, TILE*0.36, 0, Math.PI*2);
      ctx.fill();
      continue;
    }
    // color by ability
    const ab = ABILITIES.find(a => a.id === l.ability);
    ctx.fillStyle = ab ? ab.color : '#f4e34f';
    // body circle
    ctx.beginPath();
    ctx.arc(px+TILE*0.5, py+TILE*0.45, TILE*0.32, 0, Math.PI*2);
    ctx.fill();
    // face eye
    ctx.fillStyle = '#111';
    ctx.fillRect(px+TILE*(l.dir===1?0.6:0.25), py+TILE*0.35, 4, 4);

    // ability badge
    if (l.ability){
      ctx.fillStyle = ab ? shadeColor(ab.color, -20) : '#000';
      ctx.fillRect(px+TILE*0.15, py+TILE*0.85, TILE*0.7, 6);
    }
  }

  // HUD
  timeLabel.textContent = `Frame: ${frameIndex}`;
  savedLabel.textContent = `Saved: ${stats.saved}`;
  aliveLabel.textContent = `Alive: ${stats.alive}`;
}

/* ----- REPLAY DRAWING ----- */
function drawFrameFromSnapshot(snap){
  // restore grid for drawing only
  if (snap.grid) {
    grid = snap.grid.map(r => r.slice());
  }
  // create temporary lemmings from snapshot for draw only
  const savedLems = snap.lemmings.map(l => ({ ...l }));
  // draw similarly to draw() but using savedLems
  ctx.fillStyle = '#b7e0ff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++){
      const t = grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (t === TILE_TYPES.SOLID){
        ctx.fillStyle = '#6b4b2e';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.WATER){
        ctx.fillStyle = '#2a9df4';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.LAVA){
        ctx.fillStyle = '#ff6b3a';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.ENTRANCE){
        ctx.fillStyle = '#2ea44f';
        ctx.fillRect(px,py,TILE,TILE);
      } else if (t === TILE_TYPES.EXIT){
        ctx.fillStyle = '#2b6eff';
        ctx.fillRect(px,py,TILE,TILE);
      } else {
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(px,py,TILE,TILE);
      }
    }
  }

  for (const l of savedLems){
    const px = (l.x) * TILE;
    const py = (l.y) * TILE;
    if (l.state === 'dead'){
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(px+TILE*0.5, py+TILE*0.5, TILE*0.36, 0, Math.PI*2);
      ctx.fill();
      continue;
    }
    const ab = ABILITIES.find(a => a.id === l.ability);
    ctx.fillStyle = ab ? ab.color : '#f4e34f';
    ctx.beginPath();
    ctx.arc(px+TILE*0.5, py+TILE*0.45, TILE*0.32, 0, Math.PI*2);
    ctx.fill();
  }

  timeLabel.textContent = `Replay Frame: ${snap.frame}`;
  savedLabel.textContent = `Saved: ${snap.stats.saved}`;
  aliveLabel.textContent = `Alive: ${snap.stats.alive}`;
}

/* ----- UTIL ----- */
function shadeColor(col, percent) {
  const f = parseInt(col.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent;
  const R = f>>16, G = f>>8&0x00FF, B = f&0x0000FF;
  const newR = Math.round((t-R)*p/100)+R;
  const newG = Math.round((t-G)*p/100)+G;
  const newB = Math.round((t-B)*p/100)+B;
  return `rgb(${newR},${newG},${newB})`;
}
function flashMessage(msg){
  // minimal flash using alert style non-blocking
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position='fixed';
  el.style.left='50%';
  el.style.top='12%';
  el.style.transform='translateX(-50%)';
  el.style.padding='8px 12px';
  el.style.background='rgba(0,0,0,0.7)';
  el.style.border='1px solid #fff';
  el.style.borderRadius='6px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1200);
}

/* ----- MAIN LOOP ----- */
function step(){
  const level = levels[currentLevelIndex];
  if (mode === 'play'){
    updatePhysics(level);
    draw();
    // record snapshot each frame
    replayFrames.push(snapshotFrame());
  } else if (mode === 'replay' && replayLoaded){
    if (frameIndex < replayLoaded.length) {
      drawFrameFromSnapshot(replayLoaded[frameIndex]);
    }
  }
  frameIndex++;
}

function loop(){
  if (playing) step();
  requestAnimationFrame(loop);
}

/* ----- LEVEL RESET ----- */
function resetLevel(){
  const level = levels[currentLevelIndex];
  resetGridFromLevel(level);
  lemmings = [];
  frameIndex = 0;
  replayFrames = [];
  replayLoaded = null;
  playing = false;
  stats = { saved: 0, alive: 0 };
  // set abilities counts
  abilityCounts = {};
  for (const ab of ABILITIES){
    abilityCounts[ab.id] = level.abilities[ab.id] ?? 0;
  }
  buildAbilityUI();
  updateAbilitySelection();
  draw();
}

/* ----- INIT ----- */
resetLevel();
loop();

/* ----- Expose minimal console helpers for debugging ----- */
window.Lemmings = {
  grid, lemmings, levels, resetLevel, replayFrames
};