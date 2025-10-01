
// State and storage
const S = {
  route: '#/home',
  game: null,
  selected: null,
  level: 10,
  analysis: { cp: null, bestmove: null },
  plan: []
};

const store = {
  get(k, d=null){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
};

// Routing
function show(route){
  S.route = route || '#/home';
  for(const el of document.querySelectorAll('main > .card')) el.classList.add('hidden');
  const id = {
    '#/home': 'view-home',
    '#/play': 'view-play',
    '#/drills': 'view-drills',
    '#/strategie': 'view-strategie',
    '#/rapport': 'view-rapport',
    '#/entrainement': 'view-entrainement',
  }[S.route] || 'view-home';
  document.getElementById(id).classList.remove('hidden');
  if (id==='view-play') renderBoard();
  if (id==='view-drills') renderDrills();
  if (id==='view-strategie') renderStrategy();
  if (id==='view-rapport') renderReport();
  if (id==='view-entrainement') renderPlan();
}
window.addEventListener('hashchange', () => show(location.hash));
document.addEventListener('DOMContentLoaded', () => {
  init();
  show(location.hash || '#/home');
});

// Init data
function init(){
  if (!store.get('drills')) {
    const drills = Array.from({length:20}, (_,i)=>({ id:`seed-${i}`, prompt:`Tactique #${i+1}`, motif:['fourchette','clouage','déviation'][i%3], difficulty:1+(i%5) }));
    store.set('drills', drills);
    const revs = drills.map(d=>({ id:d.id, dueAt: Date.now(), interval:0, ease:2.5, stability:0.4 }));
    store.set('reviews', revs);
  }
  if (!store.get('games')) store.set('games', []);
  if (!store.get('strategy')) store.set('strategy', {});
  if (!store.get('daily_plan')) store.set('daily_plan', {});
  S.game = new window.Chess();
}

// --- Play view ---
function boardSquares(){
  const a = [];
  for(let r=8;r>=1;r--){
    for(let c=1;c<=8;c++){
      a.push({ file: 'abcdefgh'[c-1], rank: r, dark: (r+c)%2==0 });
    }
  }
  return a;
}
function pieceGlyph(p){
  const map = { p:'♟', r:'♜', n:'♞', b:'♝', q:'♛', k:'♚' };
  const g = map[p.type];
  return p.color==='w' ? g.toUpperCase() : g;
}
function renderBoard(){
  const el = document.getElementById('board');
  el.innerHTML = '';
  const squares = boardSquares();
  const boardMap = {};
  const fenParts = S.game.fen().split(' ')[0].split('/');
  for(let r=0;r<8;r++){
    let file = 0;
    for(const ch of fenParts[r]){
      if (/[1-8]/.test(ch)){ file += parseInt(ch,10); }
      else {
        const color = (ch===ch.toUpperCase())?'w':'b';
        const type = ch.toLowerCase();
        const coord = 'abcdefgh'[file] + (8-r);
        boardMap[coord] = { color, type };
        file += 1;
      }
    }
  }
  for(const sq of squares){
    const id = sq.file + sq.rank;
    const p = boardMap[id];
    const d = document.createElement('div');
    d.className = 'square ' + (sq.dark?'dark':'light');
    d.dataset.square = id;
    d.textContent = p ? pieceGlyph(p) : '';
    if (S.selected===id) d.classList.add('sel');
    d.addEventListener('click', onSquareClick);
    el.appendChild(d);
  }
  document.getElementById('bot-level').value = String(S.level);
  document.getElementById('gameover').classList.toggle('hidden', !S.game.isGameOver());
  updateEvalUI();
}
function onSquareClick(e){
  const sq = e.currentTarget.dataset.square;
  if (!S.selected){
    const piece = S.game.get(sq);
    if (piece && piece.color === S.game.turn()) {
      S.selected = sq;
      highlightMoves(sq);
    }
  } else {
    if (sq === S.selected) { S.selected = null; renderBoard(); return; }
    const mv = { from: S.selected, to: sq, promotion: 'q' };
    const legal = S.game.moves({ square: S.selected, verbose:true }).some(m=> m.to===sq);
    if (legal){
      S.game.move(mv);
      S.selected = null;
      renderBoard();
      setTimeout(aiMove, 50);
    } else {
      S.selected = null;
      renderBoard();
    }
  }
}
function highlightMoves(from){
  const legal = S.game.moves({ square: from, verbose:true }).map(m=>m.to);
  for(const d of document.querySelectorAll('.square')){
    const id = d.dataset.square;
    if (id===from || legal.includes(id)) d.classList.add('hl');
  }
}
function evalMaterial(game){
  const b = game.board();
  const v = { p:100, n:320, b:330, r:500, q:900, k:0 };
  let s=0;
  for(const row of b) for(const p of row){
    if (!p) continue;
    s += (p.color==='w'?1:-1) * v[p.type];
  }
  return s;
}
function best1Ply(game){
  const side = game.turn();
  let best=null, bestScore = side==='w' ? -1e9 : 1e9;
  const list = game.moves({ verbose:true });
  for(const m of list){
    game.move(m);
    const s = evalMaterial(game);
    game.undo();
    if (side==='w' ? s>bestScore : s<bestScore){ bestScore=s; best=m; }
  }
  return best || list[Math.floor(Math.random()*list.length)];
}
function updateEvalUI(){
  const cp = evalMaterial(S.game);
  document.getElementById('eval').textContent = (cp===0? '0.00' : (cp>0? '+' : '') + (cp/100).toFixed(2));
  const bm = best1Ply(S.game) || {from:'', to:''};
  document.getElementById('bestmove').textContent = bm.from + bm.to;
}
function aiMove(){
  if (S.game.isGameOver()) return onGameOver();
  const m = best1Ply(S.game);
  if (!m) return;
  S.game.move(m);
  renderBoard();
  if (S.game.isGameOver()) onGameOver();
}
function onGameOver(){
  const pgn = S.game.pgn();
  const games = store.get('games', []);
  games.push({ id: Date.now(), ts: Date.now(), pgn, quick: { cp: evalMaterial(S.game) } });
  store.set('games', games);
  recomputeStrategy();
  recomputeReport();
  document.getElementById('gameover').classList.remove('hidden');
}

// --- Drills (SRS) ---
function getDueDrills(limit=20){
  const drills = store.get('drills', []);
  const revs = store.get('reviews', []);
  const now = Date.now();
  const dueIds = revs.filter(r=> r.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt).slice(0,limit).map(r=>r.id);
  return drills.filter(d=> dueIds.includes(d.id));
}
function gradeDrill(id, q, meta){
  const revs = store.get('reviews', []);
  const r = revs.find(x=>x.id===id); if (!r) return;
  const speedAdj = meta.timeMs<7000? +0.05 : meta.timeMs>20000? -0.05 : 0;
  r.ease = Math.max(1.3, (r.ease||2.5) + (q-3)*0.1 + speedAdj);
  const newInt = q>=4 ? Math.max(1, Math.round((r.interval||1)*r.ease)) : 1;
  r.interval = newInt; r.dueAt = Date.now() + newInt*24*3600*1000;
  store.set('reviews', revs);
}
let DRILL_Q = [];
function renderDrills(){
  DRILL_Q = getDueDrills(20);
  document.getElementById('drills-left').textContent = DRILL_Q.length;
  const box = document.getElementById('drill-box');
  if (DRILL_Q.length===0){ box.textContent='Terminé'; return; }
  const cur = DRILL_Q[0];
  box.innerHTML = '<div class="center"><div>'+cur.prompt+'</div><div class="muted psm">Motif: '+cur.motif+' • D: '+cur.difficulty+'</div></div>';
}
document.addEventListener('click', (e)=>{
  const b = e.target.closest('#view-drills .btn');
  if (!b) return;
  if (DRILL_Q.length===0) return;
  const cur = DRILL_Q[0];
  gradeDrill(cur.id, parseInt(b.dataset.q,10), { timeMs: 8000 });
  DRILL_Q.shift();
  document.getElementById('drills-left').textContent = DRILL_Q.length;
  document.getElementById('drill-status').textContent = (parseInt(b.dataset.q,10)>=4)?'Correct':'À revoir';
  renderDrills();
});

// --- Strategy & Report ---
function recomputeStrategy(){
  const games = store.get('games', []);
  const planDepth = 2 + Math.min(3, games.length/10);
  const conversion = Math.min(0.9, 0.5 + games.length*0.01);
  const strat = { planDepth, timeAlloc: 'Équilibrée', risk: 'Modéré', conversion };
  store.set('strategy', strat);
}
function renderStrategy(){
  const m = store.get('strategy', {});
  document.getElementById('m-planDepth').textContent = m.planDepth ? m.planDepth.toFixed(1)+' coups' : '—';
  document.getElementById('m-timeAlloc').textContent = m.timeAlloc || '—';
  document.getElementById('m-risk').textContent = m.risk || '—';
  document.getElementById('m-conv').textContent = m.conversion ? Math.round(m.conversion*100)+'%' : '—';
}
function recomputeReport(){
  const games = store.get('games', []);
  const elo = 1200 + games.length*5; const sigma = 80; const trend = '+' + games.length*3; const recall = 0.7;
  store.set('report', { elo, sigma, trend, recall });
}
function renderReport(){
  const r = store.get('report', null) || { elo: '—', sigma: '—', trend: '—', recall: 0 };
  document.getElementById('r-elo').textContent = r.elo + (r.sigma?' ± '+r.sigma:'');
  document.getElementById('r-trend').textContent = r.trend || '—';
  document.getElementById('r-recall').textContent = Math.round((r.recall||0)*100)+'%';
}

// --- Daily Plan ---
function buildDailyPlan(){
  const key = new Date().toISOString().slice(0,10);
  const plans = store.get('daily_plan', {});
  if (!plans[key]){
    plans[key] = [
      { key:'warmup', title:'Échauffement', duration:5, desc:'3–5 puzzles faciles.' },
      { key:'review', title:'Correction d’erreurs', duration:8, desc:'Rejoue les fautes d’hier.' },
      { key:'drills', title:'Drills ciblés', duration:12, desc:'Exercices sur tes faiblesses.' },
      { key:'strategy', title:'Exercice stratégique', duration:5, desc:'Plan 1-3-1 ou gestion du temps.' },
      { key:'game', title:'Mini‑partie', duration:10, desc:'Une partie contre le bot.' },
      { key:'wrap', title:'Clôture', duration:3, desc:'Rapport express et plan J+1.' },
    ];
    store.set('daily_plan', plans);
  }
  return plans[key];
}
function markBlockDone(k){
  const key = new Date().toISOString().slice(0,10);
  const plans = store.get('daily_plan', {});
  const p = plans[key]||[];
  const i = p.findIndex(x=>x.key===k);
  if (i>=0) p[i].desc += ' ✓';
  plans[key]=p; store.set('daily_plan', plans);
}
function renderPlan(){
  const plan = buildDailyPlan();
  const box = document.getElementById('plan'); box.innerHTML='';
  for(const b of plan){
    const el = document.createElement('div'); el.className='blk';
    el.innerHTML = `<h3>${b.title} <span class="muted">· ${b.duration} min</span></h3><div class="muted">${b.desc}</div>
    <div class="act"><a class="tile" href="${b.key==='game'?'#/play': (b.key==='drills'||b.key==='review'||b.key==='warmup')?'#/drills': b.key==='strategy'?'#/strategie':'#/home'}">Ouvrir</a>
    <button class="btn" data-k="${b.key}">Marquer comme fait</button></div>`;
    box.appendChild(el);
  }
  for(const btn of box.querySelectorAll('button[data-k]')){
    btn.addEventListener('click', (e)=>{ markBlockDone(e.currentTarget.dataset.k); renderPlan(); });
  }
}

// Level select
document.addEventListener('change', (e)=>{
  if (e.target && e.target.id==='bot-level'){ S.level = parseInt(e.target.value,10); }
});
