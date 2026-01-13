/* render.js - drawing & canvas access */
export const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

let TILE = 24;
let TILE_TYPES = null;
let ABILITIES = null;
let W = Math.floor(canvas.width / TILE);
let H = Math.floor(canvas.height / TILE);

export function initRenderer({ TILE: t, TILE_TYPES: tt, ABILITIES: ab }){
  TILE = t; TILE_TYPES = tt; ABILITIES = ab;
  W = Math.floor(canvas.width / TILE);
  H = Math.floor(canvas.height / TILE);
}

export function draw({ grid, lemmings, frameIndex, stats }){
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

  for (const l of lemmings){
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
    ctx.fillStyle = '#111';
    ctx.fillRect(px+TILE*(l.dir===1?0.6:0.25), py+TILE*0.35, 4, 4);
    if (l.ability){
      ctx.fillStyle = ab ? shadeColor(ab.color, -20) : '#000';
      ctx.fillRect(px+TILE*0.15, py+TILE*0.85, TILE*0.7, 6);
    }
  }

  // HUD updates are handled in UI module; emit events by reading provided objects
  const timeLabel = document.getElementById('timeLabel');
  const savedLabel = document.getElementById('savedLabel');
  const aliveLabel = document.getElementById('aliveLabel');
  timeLabel.textContent = `Frame: ${frameIndex}`;
  savedLabel.textContent = `Saved: ${stats.saved}`;
  aliveLabel.textContent = `Alive: ${stats.alive}`;
}

/* Draw from replay snapshot (similar to draw but with snapshot) */
export function drawFrameFromSnapshot(snap){
  if (!snap) return;
  if (snap.grid) {
    // shallow replace for visual only
    const g = snap.grid.map(r => r.slice());
    draw({ grid: g, lemmings: snap.lemmings, frameIndex: snap.frame, stats: snap.stats });
    const timeLabel = document.getElementById('timeLabel');
    timeLabel.textContent = `Replay Frame: ${snap.frame}`;
  }
}

/* local shadeColor fallback; real util uses shared export when available */
export function shadeColor(col, percent) {
  const f = parseInt(col.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent;
  const R = f>>16, G = f>>8&0x00FF, B = f&0x0000FF;
  const newR = Math.round((t-R)*p/100)+R;
  const newG = Math.round((t-G)*p/100)+G;
  const newB = Math.round((t-B)*p/100)+B;
  return `rgb(${newR},${newG},${newB})`;
}