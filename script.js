// script.js — StratChess PWA (vanilla)

// ---------- State & storage ----------
const S = {
  route: '#/home',
  game: null,
  selected: null,
  level: 10,
  analysis: { cp: null, bestmove: null },
  plan: []
};

const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

// ---------- Router ----------
function show(route) {
  S.route = route || '#/home';
  const cards = document.querySelectorAll('main > .card');
  for (let i = 0; i < cards.length; i++) cards[i].classList.add('hidden');
  const map = {
    '#/home': 'view-home',
    '#/play': 'view-play',
    '#/drills': 'view-drills',
    '#/strategie': 'view-strategie',
    '#/rapport': 'view-rapport',
    '#/entrainement': 'view-entrainement'
  };
  const id = map[S.route] || 'view-home';
  document.getElementById(id).classList.remove('hidden');

  if (id === 'view-play') renderBoard();
  if (id === 'view-drills') renderDrills();
  if (id === 'view-strategie') renderStrategy();
  if (id === 'view-rapport') renderReport();
  if (id === 'view-entrainement') renderPlan();
}

window.addEventListener('hashchange', function(){ show(location.hash); });
document.addEventListener('DOMContentLoaded', function(){ init(); show(location.hash || '#/home'); });

// ---------- Init ----------
function init() {
  if (!store.get('drills')) {
    var drills = [];
    for (var i = 0; i < 20; i++) {
      drills.push({
        id: 'seed-' + i,
        prompt: 'Tactique #' + (i + 1),
        motif: ['fourchette', 'clouage', 'déviation'][i % 3],
        difficulty: 1 + (i % 5)
      });
    }
    store.set('drills', drills);
    var revs = [];
    for (var j = 0; j < drills.length; j++) {
      revs.push({ id: drills[j].id, dueAt: Date.now(), interval: 0, ease: 2.5, stability: 0.4 });
    }
    store.set('reviews', revs);
  }
  if (!store.get('games')) store.set('games', []);
  if (!store.get('strategy')) store.set('strategy', {});
  if (!store.get('daily_plan')) store.set('daily_plan', {});

  if (typeof window.Chess === 'function') S.game = new window.Chess();
  else { console.error('chess.js non chargé'); S.game = null; }
}

// ---------- Play view ----------
function boardSquares() {
  var a = [];
  for (var r = 8; r >= 1; r--) {
    for (var c = 1; c <= 8; c++) {
      a.push({ file: 'abcdefgh'.charAt(c - 1), rank: r, dark: ((r + c) % 2) === 0 });
    }
  }
  return a;
}
function pieceGlyph(p) {
  var map = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };
  var g = map[p.type]; return p.color === 'w' ? g.toUpperCase() : g;
}
function renderBoard() {
  if (!S.game) return;
  var el = document.getElementById('board'); el.innerHTML = '';

  var boardMap = {};
  var fenParts = S.game.fen().split(' ')[0].split('/');
  for (var r = 0; r < 8; r++) {
    var file = 0;
    for (var k = 0; k < fenParts[r].length; k++) {
      var ch = fenParts[r].charAt(k);
      if (/[1-8]/.test(ch)) { file += parseInt(ch, 10); }
      else {
        var color = (ch === ch.toUpperCase()) ? 'w' : 'b';
        var type = ch.toLowerCase();
        var coord = 'abcdefgh'.charAt(file) + (8 - r);
        boardMap[coord] = { color: color, type: type };
        file += 1;
      }
    }
  }
  var squares = boardSquares();
  for (var s = 0; s < squares.length; s++) {
    var sq = squares[s];
    var id = sq.file + sq.rank;
    var p = boardMap[id];
    var d = document.createElement('div');
    d.className = 'square ' + (sq.dark ? 'dark' : 'light');
    d.setAttribute('data-square', id);
    d.textContent = p ? pieceGlyph(p) : '';
    if (S.selected === id) d.classList.add('sel');
    d.addEventListener('click', onSquareClick);
    el.appendChild(d);
  }
  var sel = document.getElementById('bot-level'); if (sel) sel.value = String(S.level);
  var over = document.getElementById('gameover'); if (over) over.classList.toggle('hidden', !S.game.isGameOver());
  updateEvalUI();
}
function onSquareClick(e) {
  if (!S.game) return;
  var sq = e.currentTarget.getAttribute('data-square');
  if (!S.selected) {
    var piece = S.game.get(sq);
    if (piece && piece.color === S.game.turn()) { S.selected = sq; highlightMoves(sq); }
  } else {
    if (sq === S.selected) { S.selected = null; renderBoard(); return; }
    var mv = { from: S.selected, to: sq, promotion: 'q' };
    var legal = false;
    var moves = S.game.moves({ square: S.selected, verbose: true });
    for (var i = 0; i < moves.length; i++) { if (moves[i].to === sq) { legal = true; break; } }
    if (legal) { S.game.move(mv); S.selected = null; renderBoard(); setTimeout(aiMove, 50); }
    else { S.selected = null; renderBoard(); }
  }
}
function highlightMoves(from) {
  if (!S.game) return;
  var legal = S.game.moves({ square: from, verbose: true }).map(function(m){ return m.to; });
  var nodes = document.querySelectorAll('.square');
  for (var i = 0; i < nodes.length; i++) {
    var id = nodes[i].getAttribute('data-square');
    if (id === from || legal.indexOf(id) !== -1) nodes[i].classList.add('hl');
  }
}
function evalMaterial(game) {
  var b = game.board();
  var v = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  var s = 0;
  for (var i = 0; i < b.length; i++) {
    for (var j = 0; j < b[i].length; j++) {
      var p = b[i][j]; if (!p) continue;
      s += (p.color === 'w' ? 1 : -1) * v[p.type];
    }
  }
  return s;
}
function best1Ply(game) {
  var side = game.turn();
  var best = null, bestScore = side === 'w' ? -1e9 : 1e9;
  var list = game.moves({ verbose: true });
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    game.move(m);
    var s = evalMaterial(game);
    game.undo();
    if ((side === 'w' && s > bestScore) || (side === 'b' && s < bestScore)) { bestScore = s; best = m; }
  }
  if (!best) best = list[Math.floor(Math.random() * list.length)];
  return best;
}
function updateEvalUI() {
  if (!S.game) return;
  var cp = evalMaterial(S.game);
  var evalEl = document.getElementById('eval'); if (evalEl) evalEl.textContent = (cp === 0 ? '0.00' : (cp > 0 ? '+' : '') + (cp / 100).toFixed(2));
  var bm = best1Ply(S.game) || { from: '', to: '' };
  var bestEl = document.getElementById('bestmove'); if (bestEl) bestEl.textContent = bm.from + bm.to;
}
function aiMove() {
  if (!S.game || S.game.isGameOver()) { onGameOver(); return; }
  var m = best1Ply(S.game); if (!m) return; S.game.move(m); renderBoard(); if (S.game.isGameOver()) onGameOver();
}
function onGameOver() {
  if (!S.game) return;
  var pgn = S.game.pgn();
  var games = store.get('games', []);
  games.push({ id: Date.now(), ts: Date.now(), pgn: pgn, quick: { cp: evalMaterial(S.game) } });
  store.set('games', games);
  recomputeStrategy();
  recomputeReport();
  var over = document.getElementById('gameover'); if (over) over.classList.remove('hidden');
}

// ---------- Drills ----------
function getDueDrills(limit) {
  if (typeof limit === 'undefined') limit = 20;
  var drills = store.get('drills', []);
  var revs = store.get('reviews', []);
  var now = Date.now();
  var dueIds = [];
  revs.sort(function(a,b){ return a.dueAt - b.dueAt; });
  for (var i = 0; i < revs.length && dueIds.length < limit; i++) {
    if (revs[i].dueAt <= now) dueIds.push(revs[i].id);
  }
  var out = [];
  for (var j = 0; j < drills.length; j++) {
    if (dueIds.indexOf(drills[j].id) !== -1) out.push(drills[j]);
  }
  return out;
}
function gradeDrill(id, q, meta) {
  var revs = store.get('reviews', []);
  var r = null; for (var i = 0; i < revs.length; i++) if (revs[i].id === id) { r = revs[i]; break; }
  if (!r) return;
  var speedAdj = meta.timeMs < 7000 ? +0.05 : meta.timeMs > 20000 ? -0.05 : 0;
  r.ease = Math.max(1.3, (r.ease || 2.5) + (q - 3) * 0.1 + speedAdj);
  var newInt = q >= 4 ? Math.max(1, Math.round((r.interval || 1) * r.ease)) : 1;
  r.interval = newInt; r.dueAt = Date.now() + newInt * 24 * 3600 * 1000;
  store.set('reviews', revs);
}
var DRILL_Q = [];
function renderDrills() {
  DRILL_Q = getDueDrills(20);
  var leftEl = document.getElementById('drills-left'); if (leftEl) leftEl.textContent = DRILL_Q.length;
  var box = document.getElementById('drill-box'); if (!box) return;
  if (DRILL_Q.length === 0) { box.textContent = 'Terminé'; return; }
  var cur = DRILL_Q[0];
  box.innerHTML = '<div class="center"><div>'+cur.prompt+'</div><div class="muted psm">Motif: '+cur.motif+' • D: '+cur.difficulty+'</div></div>';
}
document.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('#view-drills .btn') : null;
  if (!b) return;
  if (DRILL_Q.length === 0) return;
  var cur = DRILL_Q[0];
  gradeDrill(cur.id, parseInt(b.getAttribute('data-q'), 10), { timeMs: 8000 });
  DRILL_Q.shift();
  var leftEl = document.getElementById('drills-left'); if (leftEl) leftEl.textContent = DRILL_Q.length;
  var st = document.getElementById('drill-status'); if (st) st.textContent = (parseInt(b.getAttribute('data-q'), 10) >= 4) ? 'Correct' : 'À revoir';
  renderDrills();
});

// ---------- Strategy & Report ----------
function recomputeStrategy() {
  var games = store.get('games', []);
  var planDepth = 2 + Math.min(3, games.length / 10);
  var conversion = Math.min(0.9, 0.5 + games.length * 0.01);
  store.set('strategy', { planDepth: planDepth, timeAlloc: 'Équilibrée', risk: 'Modéré', conversion: conversion });
}
function renderStrategy() {
  var m = store.get('strategy', {});
  var set = function(id, v){ var el = document.getElementById(id); if (el) el.textContent = v; };
  set('m-planDepth', m.planDepth ? m.planDepth.toFixed(1) + ' coups' : '—');
  set('m-timeAlloc', m.timeAlloc || '—');
  set('m-risk', m.risk || '—');
  set('m-conv', m.conversion ? Math.round(m.conversion * 100) + '%' : '—');
}
function recomputeReport() {
  var games = store.get('games', []);
  var elo = 1200 + games.length * 5; var sigma = 80; var trend = '+' + games.length * 3; var recall = 0.7;
  store.set('report', { elo: elo, sigma: sigma, trend: trend, recall: recall });
}
function renderReport() {
  var r = store.get('report', null) || { elo: '—', sigma: '—', trend: '—', recall: 0 };
  var set = function(id, v){ var el = document.getElementById(id); if (el) el.textContent = v; };
  set('r-elo', r.elo + (r.sigma ? ' ± ' + r.sigma : ''));
  set('r-trend', r.trend || '—');
  set('r-recall', Math.round((r.recall || 0) * 100) + '%');
}

// ---------- Daily Plan ----------
function buildDailyPlan() {
  var key = new Date().toISOString().slice(0, 10);
  var plans = store.get('daily_plan', {});
  if (!plans[key]) {
    plans[key] = [
      { key: 'warmup', title: 'Échauffement', duration: 5, desc: '3–5 puzzles faciles.' },
      { key: 'review', title: 'Correction d’erreurs', duration: 8, desc: 'Rejoue les fautes d’hier.' },
      { key: 'drills', title: 'Drills ciblés', duration: 12, desc: 'Exercices sur tes faiblesses.' },
      { key: 'strategy', title: 'Exercice stratégique', duration: 5, desc: 'Plan 1-3-1 ou gestion du temps.' },
      { key: 'game', title: 'Mini-partie', duration: 10, desc: 'Une partie contre le bot.' },
      { key: 'wrap', title: 'Clôture', duration: 3, desc: 'Rapport express et plan J+1.' }
    ];
    store.set('daily_plan', plans);
  }
  return plans[key];
}
function markBlockDone(k) {
  var key = new Date().toISOString().slice(0, 10);
  var plans = store.get('daily_plan', {});
  var p = plans[key] || [];
  var i = -1; for (var idx = 0; idx < p.length; idx++) if (p[idx].key === k) { i = idx; break; }
  if (i >= 0) p[i].desc += ' ✓';
  plans[key] = p; store.set('daily_plan', plans);
}
function renderPlan() {
  var plan = buildDailyPlan();
  var box = document.getElementById('plan'); if (!box) return; box.innerHTML = '';
  for (var i = 0; i < plan.length; i++) {
    var b = plan[i];
    var el = document.createElement('div'); el.className = 'blk';
    var href = (b.key === 'game') ? '#/play' : ((b.key === 'drills' || b.key === 'review' || b.key === 'warmup') ? '#/drills' : (b.key === 'strategy' ? '#/strategie' : '#/home'));
    el.innerHTML = '<h3>'+b.title+' <span class="muted">· '+b.duration+' min</span></h3><div class="muted">'+b.desc+'</div>'
      + '<div class="act"><a class="tile" href="'+href+'">Ouvrir</a>'
      + '<button class="btn" data-k="'+b.key+'">Marquer comme fait</button></div>';
    box.appendChild(el);
  }
  var btns = box.querySelectorAll('button[data-k]');
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener('click', function(e){ markBlockDone(e.currentTarget.getAttribute('data-k')); renderPlan(); });
  }
}

// ---------- UI events ----------
document.addEventListener('change', function(e){
  if (e.target && e.target.id === 'bot-level') { S.level = parseInt(e.target.value, 10); }
});
