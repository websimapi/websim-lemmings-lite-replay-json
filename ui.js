/* ui.js - UI bindings and small helpers */
import { ABILITIES } from './game.js';

export function buildUI({ levels, onLevelChange, onStart, onPause, onStep, onReset, onSave, onLoad, onModeChange } = {}) {
  const levelSelect = document.getElementById('levelSelect');
  levels.forEach((lvl, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `Level ${i+1} — ${lvl.name}`;
    levelSelect.appendChild(o);
  });
  levelSelect.addEventListener('change', (e)=> {
    onLevelChange && onLevelChange(Number(e.target.value));
  });

  document.getElementById('startBtn').onclick = onStart;
  document.getElementById('pauseBtn').onclick = onPause;
  document.getElementById('resetBtn').onclick = onReset;
  document.getElementById('stepBtn').onclick = onStep;

  const modeSelect = document.getElementById('modeSelect');
  modeSelect.onchange = (e)=> {
    onModeChange && onModeChange(e.target.value);
  };

  const saveJsonBtn = document.getElementById('saveJsonBtn');
  const loadJsonBtn = document.getElementById('loadJsonBtn');
  const jsonFileInput = document.getElementById('jsonFileInput');

  saveJsonBtn.onclick = onSave;
  loadJsonBtn.onclick = ()=> jsonFileInput.click();
  jsonFileInput.onchange = (e)=> {
    const f = e.target.files[0];
    if (f) onLoad && onLoad(f);
  };

  const abilityButtonsDiv = document.getElementById('abilityButtons');

  function updateAbilities(counts = {}) {
    abilityButtonsDiv.innerHTML = '';
    for (const ab of ABILITIES) {
      const btn = document.createElement('button');
      btn.className = 'abilityBtn';
      btn.textContent = `${ab.name} (${counts[ab.id] ?? 0})`;
      btn.style.borderLeft = `4px solid ${ab.color}`;
      btn.dataset.ability = ab.id;
      btn.onclick = () => {
        // toggle selection visually; actual selection state lives in game module
        const currently = btn.classList.contains('selected');
        Array.from(abilityButtonsDiv.children).forEach(b=>b.classList.remove('selected'));
        if (!currently) btn.classList.add('selected');
      };
      abilityButtonsDiv.appendChild(btn);
    }
  }

  function flash(msg){
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

  return { updateAbilities, flash, updateAbilitySelection: updateAbilities };
}

export function bindCanvasClick(handler){
  const canvas = document.getElementById('gameCanvas');
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tx = Math.floor(cx / 24);
    const ty = Math.floor(cy / 24);
    handler({tx, ty});
  });
}

export function updateAbilityUI(){
  // placeholder: UI updated by game.resetLevel() via buildUI().updateAbilities
}