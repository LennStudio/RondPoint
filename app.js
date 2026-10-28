/* ============================================================
   Rond Point ou Fake — logique de jeu
   ============================================================ */
(() => {
  'use strict';

  const STORE_KEY = 'rondpointoufake:v1';
  const CATALOG_URL = 'data/images.json';
  const MAX_LIVES = 3;
  const BASE_POINTS = 100;
  const STREAK_STEP = 25;
  const STREAK_CAP = 10;
  const MAX_GAMES_KEPT = 50;

  const $ = (sel) => document.querySelector(sel);

  /* ----------------------------------------------------------
     Mémoire du joueur (localStorage)
     db = {
       seen:  [ids d'images déjà passées, jamais rejouées],
       games: [parties terminées],
       best:  { score, streak, correct },
       game:  partie en cours (ou null),
       round: tour en cours (ou null)
     }
     ---------------------------------------------------------- */
  const emptyMemory = () => ({
    version: 1,
    seen: [],
    games: [],
    best: { score: 0, streak: 0, correct: 0 },
    game: null,
    round: null,
  });

  function loadPlayerMemory() {
    const base = emptyMemory();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const d = JSON.parse(raw);
      return {
        version: 1,
        seen: Array.isArray(d.seen) ? d.seen.filter((x) => typeof x === 'string') : [],
        games: Array.isArray(d.games) ? d.games.slice(0, MAX_GAMES_KEPT) : [],
        best: { ...base.best, ...(d.best && typeof d.best === 'object' ? d.best : {}) },
        game: d.game && typeof d.game === 'object' ? d.game : null,
        round: d.round && typeof d.round === 'object' ? d.round : null,
      };
    } catch {
      return base; // stockage indisponible ou corrompu : on repart à zéro
    }
  }

  function savePlayerMemory(memory) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(memory));
    } catch {
      /* navigation privée / quota : le jeu continue sans sauvegarde */
    }
  }

  /* ---------- Outils ---------- */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmt = (n) => Number(n).toLocaleString('fr-FR');
  const fmtDate = (ts) =>
    new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  /* ---------- État ---------- */
  let memory = loadPlayerMemory();
  let catalog = { real: [], fake: [] };
  const byId = new Map();

  const el = {
    viewStart: $('#view-start'),
    viewPlay: $('#view-play'),
    cards: $('#cards'),
    roundInfo: $('#round-info'),
    feedback: $('#feedback'),
    feedbackText: $('#feedback-text'),
    btnNext: $('#btn-next'),
    btnPlay: $('#btn-play'),
    btnResetSeen: $('#btn-reset-seen'),
    startNotice: $('#start-notice'),
    startHint: $('#start-hint'),
    score: $('#stat-score'),
    correct: $('#stat-correct'),
    streak: $('#stat-streak'),
    best: $('#stat-best'),
    bestSub: $('#stat-best-sub'),
    lives: $('#lives'),
    dlgEnd: $('#dlg-end'),
    dlgHistory: $('#dlg-history'),
    dlgHelp: $('#dlg-help'),
  };

  /* ---------- Sélection d'un tour ---------- */
  function availablePools() {
    const seen = new Set(memory.seen);
    return {
      real: catalog.real.filter((i) => !seen.has(i.id)),
      fake: catalog.fake.filter((i) => !seen.has(i.id)),
    };
  }

  function roundsLeft() {
    const p = availablePools();
    return Math.min(p.real.length, Math.floor(p.fake.length / 2));
  }

  function pickRound() {
    const pool = availablePools();
    if (pool.real.length < 1 || pool.fake.length < 2) return null;
    const real = shuffle(pool.real)[0];
    const fakes = shuffle(pool.fake).slice(0, 2);
    return {
      ids: shuffle([real, ...fakes]).map((i) => i.id),
      realId: real.id,
      answered: false,
      choice: null,
    };
  }

  /* ---------- Partie ---------- */
  function newGame() {
    return {
      startedAt: Date.now(),
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      bestStreak: 0,
      lives: MAX_LIVES,
      rounds: 0,
    };
  }

  function startGame() {
    if (roundsLeft() < 1) return updateStartView();
    memory.game = newGame();
    memory.round = pickRound();
    savePlayerMemory(memory);
    showPlay();
  }

  function answer(index) {
    const g = memory.game;
    const r = memory.round;
    if (!g || !r || r.answered) return;

    const picked = r.ids[index];
    const isRight = picked === r.realId;
    r.answered = true;
    r.choice = index;
    g.rounds += 1;

    let gained = 0;
    if (isRight) {
      g.correct += 1;
      g.streak += 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      gained = BASE_POINTS + Math.min(g.streak - 1, STREAK_CAP) * STREAK_STEP;
      g.score += gained;
    } else {
      g.wrong += 1;
      g.streak = 0;
      g.lives -= 1;
    }
    r.gained = gained;

    // Les trois images sont désormais « passées » : elles ne reviendront plus.
    r.ids.forEach((id) => { if (!memory.seen.includes(id)) memory.seen.push(id); });

    // Meilleur score mis à jour en temps réel
    const b = memory.best;
    b.score = Math.max(b.score, g.score);
    b.streak = Math.max(b.streak, g.bestStreak);
    b.correct = Math.max(b.correct, g.correct);

    savePlayerMemory(memory);
    renderStats(isRight);
    revealRound();
  }

  function nextRound() {
    const g = memory.game;
    if (!g) return;
    if (g.lives <= 0) return endGame('lives');
    const next = pickRound();
    if (!next) return endGame('pool');
    memory.round = next;
    savePlayerMemory(memory);
    renderRound();
  }

  function endGame(reason) {
    const g = memory.game;
    if (!g) return;
    const prevRecord = memory.games.reduce((m, x) => Math.max(m, x.score), 0);
    const isRecord = g.score > 0 && g.score > prevRecord;

    memory.games.unshift({
      endedAt: Date.now(),
      score: g.score,
      correct: g.correct,
      bestStreak: g.bestStreak,
      rounds: g.rounds,
      reason,
    });
    memory.games = memory.games.slice(0, MAX_GAMES_KEPT);
    memory.game = null;
    memory.round = null;
    savePlayerMemory(memory);

    $('#end-title').textContent = reason === 'lives' ? 'Plus de vies' : 'Toutes les images sont passées';
    $('#end-text').textContent =
      reason === 'lives'
        ? 'Les faux rond-points ont eu ta peau cette fois.'
        : 'Tu as épuisé le stock d\'images. Réinitialise l\'historique pour rejouer avec les mêmes.';
    $('#end-summary').innerHTML = [
      ['Score', fmt(g.score)],
      ['Bonnes réponses', fmt(g.correct)],
      ['Série max', fmt(g.bestStreak)],
      ['Tours joués', fmt(g.rounds)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#end-record').hidden = !isRecord;

    renderStats();
    showStart();
    el.dlgEnd.showModal();
  }

  /* ---------- Rendu ---------- */
  function renderStats(pulse = false) {
    const g = memory.game || newGame();
    el.score.textContent = fmt(g.score);
    el.correct.textContent = fmt(g.correct);
    el.streak.textContent = fmt(g.streak);
    el.best.textContent = fmt(memory.best.score);
    el.bestSub.textContent = `série max : ${fmt(memory.best.streak)}`;

    el.lives.replaceChildren(
      ...Array.from({ length: MAX_LIVES }, (_, i) => {
        const s = document.createElement('span');
        s.className = 'ring' + (i >= g.lives ? ' lost' : '');
        return s;
      })
    );
    el.lives.setAttribute('aria-label', `${g.lives} vie${g.lives > 1 ? 's' : ''} restante${g.lives > 1 ? 's' : ''}`);

    if (pulse) {
      [el.score, el.correct, el.streak].forEach((n) => {
        n.classList.remove('pop');
        void n.offsetWidth; // relance l'animation
        n.classList.add('pop');
      });
    }
  }

  function renderRound() {
    const r = memory.round;
    if (!r) return;

    el.cards.replaceChildren(
      ...r.ids.map((id, i) => {
        const item = byId.get(id);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card';
        btn.dataset.index = String(i);
        btn.setAttribute('aria-label', `Image ${i + 1}`);

        const img = document.createElement('img');
        img.src = item ? item.src : '';
        img.alt = `Image ${i + 1}`;
        img.decoding = 'async';
        img.draggable = false;

        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = String(i + 1);

        btn.append(img, num);
        btn.addEventListener('click', () => answer(i));
        return btn;
      })
    );

    const played = memory.game ? memory.game.rounds : 0;
    const left = roundsLeft();
    el.roundInfo.textContent = r.answered
      ? `Tour ${played}`
      : `Tour ${played + 1} · ${left} tour${left > 1 ? 's' : ''} possible${left > 1 ? 's' : ''} avec les images restantes`;

    el.feedback.className = 'feedback';
    el.feedbackText.textContent = 'Clique sur une image, ou touche 1, 2 ou 3.';
    el.btnNext.hidden = true;

    if (r.answered) revealRound();
  }

  function revealRound() {
    const r = memory.round;
    const g = memory.game;
    if (!r || !g) return;

    [...el.cards.children].forEach((card, i) => {
      const isReal = r.ids[i] === r.realId;
      card.setAttribute('aria-disabled', 'true');
      card.tabIndex = -1;
      card.classList.add(isReal ? 'is-real' : 'is-fake');
      if (i === r.choice) card.classList.add('is-picked');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = isReal ? 'Vraie photo' : 'Image IA';
      card.append(tag);
      card.setAttribute('aria-label', `Image ${i + 1} : ${isReal ? 'vraie photo' : 'image générée par IA'}`);
    });

    const right = r.ids[r.choice] === r.realId;
    const realPos = r.ids.indexOf(r.realId) + 1;
    el.feedback.className = 'feedback ' + (right ? 'good' : 'bad');

    if (right) {
      const bonus = (r.gained || 0) - BASE_POINTS;
      el.feedbackText.textContent = `Bien vu ! +${r.gained} pts` + (bonus > 0 ? ` (série +${bonus})` : '');
    } else {
      el.feedbackText.textContent = `Raté… la vraie photo était la n°${realPos}.` + (g.lives > 0 ? '' : ' Dernière vie perdue.');
    }

    el.btnNext.textContent = g.lives <= 0 ? 'Voir le résultat' : 'Tour suivant';
    el.btnNext.hidden = false;
    el.btnNext.focus({ preventScroll: true });
  }

  function showPlay() {
    el.viewStart.hidden = true;
    el.viewPlay.hidden = false;
    renderStats();
    renderRound();
  }

  function showStart() {
    el.viewPlay.hidden = true;
    el.viewStart.hidden = false;
    updateStartView();
  }

  function updateStartView() {
    const left = roundsLeft();
    const total = catalog.real.length;
    const canPlay = left >= 1;
    el.btnPlay.hidden = !canPlay;
    el.btnResetSeen.hidden = canPlay;
    el.startNotice.hidden = canPlay;
    if (!canPlay) {
      el.startNotice.textContent = total === 0
        ? 'Aucune image trouvée : vérifie data/images.json.'
        : 'Toutes les images ont déjà été vues.';
    }
    el.startHint.textContent = total
      ? `${left} tour${left > 1 ? 's' : ''} disponible${left > 1 ? 's' : ''} · ${memory.seen.length} image${memory.seen.length > 1 ? 's' : ''} déjà vue${memory.seen.length > 1 ? 's' : ''}`
      : '';
    el.btnPlay.textContent = memory.games.length ? 'Nouvelle partie' : 'Jouer';
  }

  /* ---------- Historique ---------- */
  function renderHistory() {
    const body = $('#history-body');
    body.replaceChildren(
      ...memory.games.map((g) => {
        const tr = document.createElement('tr');
        [fmtDate(g.endedAt), fmt(g.score), fmt(g.correct), fmt(g.bestStreak), fmt(g.rounds)].forEach((v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.append(td);
        });
        return tr;
      })
    );
    $('#history-empty').hidden = memory.games.length > 0;
    $('.table-wrap').hidden = memory.games.length === 0;
    $('#history-summary').textContent =
      `Record : ${fmt(memory.best.score)} pts · meilleure série : ${fmt(memory.best.streak)} · ` +
      `${memory.seen.length} image${memory.seen.length > 1 ? 's' : ''} déjà vue${memory.seen.length > 1 ? 's' : ''} sur ${catalog.real.length + catalog.fake.length}`;
  }

  function resetSeen() {
    if (!confirm('Réinitialiser les images vues ? Elles pourront de nouveau apparaître. Les scores sont conservés.')) return;
    memory.seen = [];
    memory.game = null;
    memory.round = null;
    savePlayerMemory(memory);
    renderStats();
    showStart();
    renderHistory();
  }

  function clearAll() {
    if (!confirm('Tout effacer : parties, records et images vues ?')) return;
    memory = emptyMemory();
    savePlayerMemory(memory);
    renderStats();
    showStart();
    renderHistory();
  }

  /* ---------- Événements ---------- */
  el.btnPlay.addEventListener('click', startGame);
  el.btnNext.addEventListener('click', nextRound);
  el.btnResetSeen.addEventListener('click', resetSeen);
  $('#btn-clear-seen').addEventListener('click', resetSeen);
  $('#btn-clear-all').addEventListener('click', clearAll);
  $('#btn-help').addEventListener('click', () => el.dlgHelp.showModal());
  $('#btn-history').addEventListener('click', () => { renderHistory(); el.dlgHistory.showModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (el.viewPlay.hidden) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 3) answer(n - 1);
  });

  /* ---------- Installation PWA ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btn-install').hidden = false;
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#btn-install').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btn-install').hidden = true; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ---------- Démarrage ---------- */
  async function init() {
    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      catalog = {
        real: Array.isArray(data.real) ? data.real : [],
        fake: Array.isArray(data.fake) ? data.fake : [],
      };
      [...catalog.real, ...catalog.fake].forEach((i) => byId.set(i.id, i));
    } catch {
      el.viewStart.hidden = false;
      el.btnPlay.hidden = true;
      el.startNotice.hidden = false;
      el.startNotice.textContent = 'Impossible de charger data/images.json. Lance le site via un serveur local (voir README).';
      return;
    }

    // Reprise d'une partie interrompue (rechargement de page)
    const r = memory.round;
    const roundValid = r && Array.isArray(r.ids) && r.ids.every((id) => byId.has(id)) && byId.has(r.realId);
    if (memory.game && roundValid) {
      showPlay();
    } else {
      memory.game = null;
      memory.round = null;
      renderStats();
      showStart();
    }
  }

  init();
})();
