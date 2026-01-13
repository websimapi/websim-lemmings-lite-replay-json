/* game.js - core simulation and orchestration */

import { initRenderer, draw, drawFrameFromSnapshot, canvas } from './render.js';
import { buildUI, bindCanvasClick, updateAbilityUI } from './ui.js';
import { shadeColor } from './utils.js';

/* Shared constants exported to modules that need them */
export const TILE = 24;
export const ctx = canvas.getContext('2d', { alpha: false });

/* TILE TYPES */
export const TILE_TYPES = {
  EMPTY: 0,
  SOLID: 1,
  WATER: 2,
  LAVA: 3,
  ENTRANCE: 4,
  EXIT: 5,
};

/* ABILITIES */
export const ABILITIES = [
  { id: 'climber', name: 'Climber', color: '#2b8c2b', max: 3 },
  { id: 'floater', name: 'Floater', color: '#0b6b9a', max: 3 },
  { id: 'bomber', name: 'Bomber', color: '#b03a2e', max: 2 },
  { id: 'blocker', name: 'Blocker', color: '#6b6b6b', max: 2 },
  { id: 'builder', name: 'Builder', color: '#a06f1f', max: 2 },
  { id: 'basher', name: 'Basher', color: '#9a4b8c', max: 2 },
  { id: 'miner', name: 'Miner', color: '#8b5a2e', max: 2 },
  { id: 'digger', name: 'Digger', color: '#5a3b1f', max: 2 },
];

let W = Math.floor(canvas.width / TILE);
let H = Math.floor(canvas.height / TILE);

/* ----- STATE ----- */
export let grid = [];
export let lemmings = [];
export let frameIndex = 0;
export let playing = false;
export let mode = 'play';
export let selectedAbility = null;
export let abilityCounts = {};
export let replayFrames = [];
export let replayLoaded = null;
export let stats = { saved: 0, alive: 0 };

const levels = createLevels();
export let currentLevelIndex = 0;

/* Initialization */
function onLevelChange(index){
  currentLevelIndex = index;
  resetLevel();
}

export function startApp(){
  initRenderer({ TILE, TILE_TYPES, ABILITIES });
  buildUI({
    levels,
    ABILITIES,
    onLevelChange,
    onStart: ()=> playing = true,
    onPause: ()=> playing = false,
    onStep: step,
    onReset: resetLevel,
    onSave: saveReplay,
    onLoad: loadReplay,
    onModeChange: (m) => { mode = m; }
  });
  bindCanvasClick(handleCanvasClick);
  resetLevel();
  loop();
}

/* ----- LEVELS / GRID (moved from main) ----- */
function createLevels(){
  const baseEmpty = () => {
    const g = Array.from({length:H}, ()=>Array.from({length:W}, ()=>TILE_TYPES.EMPTY));
    return g;
  };

  const lvl1 = {
    name: 'Easy Slope',
    grid: (() => {
      const g = baseEmpty();
      for (let x=0;x<W;x++) g[H-3][x] = TILE_TYPES.SOLID;
      for (let x=18;x<24;x++) g[H-3][x] = TILE_TYPES.EMPTY;
      for (let x=38;x<44;x++) g[H-3][x] = TILE_TYPES.WATER;
      g[H-4][2] = TILE_TYPES.ENTRANCE;
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
      for (let x=20;x<28;x++) g[H-4][x] = TILE_TYPES.LAVA;
      for (let x=30;x<36;x++) g[H-6][x] = TILE_TYPES.SOLID;
      for (let x=45;x<52;x++) g[H-8][x] = TILE_TYPES.SOLID;
      g[H-5][3] = TILE_TYPES.ENTRANCE;
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
export function resetGridFromLevel(level){
  grid = level.grid.map(row => row.slice());
}

/* ----- LEMMING MODEL ----- */
export function spawnLemming(x, y){
  const id = Math.random().toString(36).slice(2,9);
  const lem = {
    id,
    x, y,
    vx: 0.8,
    dir: 1,
    state: 'walking',
    ability: null,
    abilityTimer: 0,
    onGround: false,
    width: 0.8,
    height: 1.4,
    exploded: false,
    spawned: false,
  };
  lemmings.push(lem);
  return lem;
}

/* ----- HELPERS ----- */
export function tileAt(tx, ty){
  if (tx < 0 || tx >= W || ty < 0 || ty >= H) return TILE_TYPES.SOLID;
  return grid[ty][tx];
}
export function isSolidTile(t){ return t === TILE_TYPES.SOLID; }
export function canClimb(lem){
  const aheadX = Math.floor(lem.x + (lem.dir === 1 ? 1.1 : -0.2));
  const aheadY = Math.floor(lem.y);
  return tileAt(aheadX, aheadY) === TILE_TYPES.SOLID;
}
export function distanceTiles(a,b){
  return Math.hypot(a.x-b.x, a.y-b.y);
}
export function explodeAt(tx, ty){
  for (let oy=-1; oy<=1; oy++){
    for (let ox=-1; ox<=1; ox++){
      const x = tx + ox, y = ty + oy;
      if (x>0 && x<W && y>0 && y<H && grid[y][x] === TILE_TYPES.SOLID) grid[y][x] = TILE_TYPES.EMPTY;
    }
  }
}

/* ----- PHYSICS & SIMULATION ----- */
export function updatePhysics(level){
  if (frameIndex % level.spawnDelayFrames === 0 && lemmings.filter(l=>l.spawned).length < level.maxSpawn) {
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

  for (const lem of lemmings){
    if (lem.state === 'dead' || lem.state === 'saved') continue;

    const belowY = Math.floor(lem.y + 1.4);
    const belowX = Math.floor(lem.x + 0.4);
    const tileBelow = tileAt(belowX, belowY);

    if (!isSolidTile(tileBelow)) {
      lem.y += 0.6;
      lem.state = 'falling';
      lem.onGround = false;
    } else {
      if (lem.state === 'falling') {
        lem.state = 'walking';
      }
      lem.onGround = true;
    }

    if (lem.onGround && lem.state !== 'blocker-standing') {
      const aheadX = Math.floor(lem.x + (lem.dir === 1 ? 1.1 : -0.2));
      const aheadY = Math.floor(lem.y + 0.5);
      const tileAhead = tileAt(aheadX, aheadY);
      if (isSolidTile(tileAhead)) {
        if (lem.ability === 'climber' && canClimb(lem)) {
          lem.state = 'climbing';
          lem.y -= 0.8;
        } else {
          lem.dir *= -1;
        }
      } else {
        lem.x += lem.vx * lem.dir;
      }
    }

    const tx = Math.floor(lem.x + 0.5);
    const ty = Math.floor(lem.y + 0.5);
    const here = tileAt(tx, ty);
    if (here === TILE_TYPES.WATER) {
      if (lem.ability === 'floater') {
      } else {
        lem.state = 'dead';
      }
    } else if (here === TILE_TYPES.LAVA) {
      lem.state = 'dead';
    } else if (here === TILE_TYPES.EXIT) {
      lem.state = 'saved';
      stats.saved++;
    }

    if (lem.state === 'blocker-standing') {
      for (const other of lemmings){
        if (other === lem || other.state==='dead' || other.state==='saved') continue;
        if (distanceTiles(lem, other) < 1.1 && other.dir === (lem.dir)) {
          other.dir *= -1;
        }
      }
    }

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

/* ----- PLAYER INTERACTIONS ----- */
function handleCanvasClick({tx, ty}){
  const clicked = lemmings.find(l => {
    const lx = Math.floor(l.x);
    const ly = Math.floor(l.y);
    return lx === tx && ly === ty && l.state !== 'dead' && l.state !== 'saved';
  });
  if (clicked && selectedAbility) {
    if (abilityCounts[selectedAbility] > 0) {
      assignAbility(clicked, selectedAbility);
      abilityCounts[selectedAbility]--;
      updateAbilityUI();
    } else {
      // Using simple UI flash handled in ui.js
      buildUI().flash('No ability remaining');
    }
  }
}

/* ----- ABILITY ASSIGNMENT ----- */
export function assignAbility(lem, ab){
  lem.ability = ab;
  switch(ab){
    case 'floater':
      lem.abilityTimer = 9999;
      break;
    case 'bomber':
      lem.abilityTimer = 120;
      break;
    case 'blocker':
      lem.state = 'blocker-standing';
      break;
    case 'builder':
      lem.state = 'building';
      break;
    case 'climber':
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
export function snapshotFrame(){
  const lems = lemmings.map(l => ({
    id: l.id, x: l.x, y: l.y, dir: l.dir, state: l.state, ability: l.ability
  }));
  return { frame: frameIndex, lemmings: lems, grid, stats: { ...stats } };
}

/* ----- SIM LOOP & control helpers ----- */
export function step(){
  const level = levels[currentLevelIndex];
  if (mode === 'play'){
    updatePhysics(level);
    draw({ grid, lemmings, frameIndex, stats });
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

/* ----- LEVEL RESET & persistence ----- */
export function resetLevel(){
  const level = levels[currentLevelIndex];
  resetGridFromLevel(level);
  lemmings = [];
  frameIndex = 0;
  replayFrames = [];
  replayLoaded = null;
  playing = false;
  stats = { saved: 0, alive: 0 };
  abilityCounts = {};
  for (const ab of ABILITIES){
    abilityCounts[ab.id] = level.abilities[ab.id] ?? 0;
  }
  buildUI().updateAbilities(abilityCounts);
  draw({ grid, lemmings, frameIndex, stats });
}

/* Save / Load helpers used by UI binding */
export function saveReplay(){
  const blob = new Blob([JSON.stringify(replayFrames, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lemmings_replay_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export async function loadReplay(file){
  if (!file) return;
  const txt = await file.text();
  try {
    const data = JSON.parse(txt);
    replayLoaded = data;
    mode = 'replay';
    playing = false;
    frameIndex = 0;
    drawFrameFromSnapshot(replayLoaded[0]);
  } catch (err) {
    buildUI().flash('Invalid JSON');
  }
}

/* Expose for debugging */
window.Lemmings = { grid, lemmings, levels, resetLevel, replayFrames };