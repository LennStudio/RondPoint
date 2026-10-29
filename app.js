/* ============================================================
   Giratoire ou Fake — logique de jeu
   Mort subite · niveaux de difficulté · thèmes · sons
   ============================================================ */
(() => {
  'use strict';

  const STORE_KEY = 'giratoireoufake:v2';
  const LEGACY_KEY = 'rondpointoufake:v2'; // ancien nom : sauvegarde migrée automatiquement
  const OLD_KEYS = ['rondpointoufake:v1'];
  const CATALOG_URL = 'data/images.json';
  const BASE_POINTS = 100;
  const STREAK_STEP = 25;
  const STREAK_CAP = 10;
  const MAX_GAMES_KEPT = 50;

  const LEVELS = {
    easy: { label: 'Facile', desc: 'IA grossières' },
    medium: { label: 'Moyen', desc: 'IA crédibles' },
    hard: { label: 'Difficile', desc: 'IA très réussies' },
  };
  const LEVEL_KEYS = Object.keys(LEVELS);
  const isLevel = (k) => LEVEL_KEYS.includes(k);
  const levelLabel = (k) => (isLevel(k) ? LEVELS[k].label : '—');

  const $ = (sel) => document.querySelector(sel);
  const plural = (n, one, many) => (n > 1 ? many : one);

  /* ----------------------------------------------------------
     Mémoire du joueur (localStorage)
     memory = {
       seen:       [ids d'images déjà passées, jamais rejouées],
       games:      [parties terminées],
       best:       { easy|medium|hard: { score, correct } },
       difficulty: niveau choisi,
       settings:   { theme, colorblind, sound },
       game:       partie en cours (ou null),
       round:      tour en cours (ou null)
     }
     ---------------------------------------------------------- */
  const emptyBest = () => Object.fromEntries(LEVEL_KEYS.map((k) => [k, { score: 0, correct: 0 }]));
  const emptyMemory = () => ({
    version: 2,
    seen: [],
    games: [],
    best: emptyBest(),
    difficulty: 'easy',
    settings: { theme: 'dark', colorblind: false, sound: true },
    game: null,
    round: null,
  });

  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

  function loadPlayerMemory() {
    const base = emptyMemory();
    try {
      OLD_KEYS.forEach((k) => localStorage.removeItem(k));
      let raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_KEY); // reprise de la sauvegarde sous l'ancien nom
        if (raw) { localStorage.setItem(STORE_KEY, raw); localStorage.removeItem(LEGACY_KEY); }
      }
      if (!raw) return base;
      const d = JSON.parse(raw);
      const best = emptyBest();
      LEVEL_KEYS.forEach((k) => {
        best[k] = { score: num(d.best?.[k]?.score), correct: num(d.best?.[k]?.correct) };
      });
      const game = d.game && typeof d.game === 'object' && isLevel(d.game.difficulty) ? d.game : null;
      return {
        version: 2,
        seen: Array.isArray(d.seen) ? d.seen.filter((x) => typeof x === 'string') : [],
        games: Array.isArray(d.games) ? d.games.filter((g) => g && typeof g === 'object').slice(0, MAX_GAMES_KEPT) : [],
        best,
        difficulty: isLevel(d.difficulty) ? d.difficulty : 'easy',
        settings: {
          theme: ['dark', 'light', 'auto'].includes(d.settings?.theme) ? d.settings.theme : 'dark',
          colorblind: !!d.settings?.colorblind,
          sound: d.settings?.sound !== false,
        },
        game,
        round: game && d.round && typeof d.round === 'object' ? d.round : null,
      };
    } catch {
      return base; // stockage indisponible ou corrompu : on repart à zéro
    }
  }

  function savePlayerMemory(m) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(m));
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
    btnSound: $('#btn-sound'),
    startNotice: $('#start-notice'),
    startHint: $('#start-hint'),
    score: $('#stat-score'),
    correct: $('#stat-correct'),
    level: $('#stat-level'),
    levelSub: $('#stat-level-sub'),
    best: $('#stat-best'),
    bestSub: $('#stat-best-sub'),
    dlgEnd: $('#dlg-end'),
    dlgHistory: $('#dlg-history'),
    dlgHelp: $('#dlg-help'),
    dlgSettings: $('#dlg-settings'),
    optCb: $('#opt-cb'),
    optSound: $('#opt-sound'),
  };

  const currentLevel = () => (memory.game ? memory.game.difficulty : memory.difficulty);

  /* ----------------------------------------------------------
     Réglages : thème, mode daltonien, sons
     ---------------------------------------------------------- */
  const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

  function applySettings() {
    const s = memory.settings;
    const theme = s.theme === 'auto' ? (lightQuery.matches ? 'light' : 'dark') : s.theme;
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (s.colorblind) root.dataset.cb = 'on';
    else delete root.dataset.cb;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#F6F1DC' : '#3A0D22';

    el.optCb.checked = s.colorblind;
    el.optSound.checked = s.sound;
    document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === s.theme; });

    el.btnSound.setAttribute('aria-pressed', String(s.sound));
    el.btnSound.title = s.sound ? 'Couper les sons et vibrations' : 'Activer les sons et vibrations';
  }

  function setSetting(key, value) {
    memory.settings[key] = value;
    savePlayerMemory(memory);
    applySettings();
  }

  lightQuery.addEventListener('change', () => {
    if (memory.settings.theme === 'auto') applySettings();
  });

  /* Sons synthétisés (WebAudio) : aucun fichier à charger */
  let audioCtx = null;

  function getAudio() {
    if (!memory.settings.sound) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch {
      return null;
    }
  }

  function tone(ctx, { freq, at = 0, dur = 0.12, type = 'sine', vol = 0.045 }) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function feedbackEffects(isRight) {
    if (!memory.settings.sound) return;
    const ctx = getAudio();
    if (ctx) {
      if (isRight) {
        tone(ctx, { freq: 660, dur: 0.12 });
        tone(ctx, { freq: 880, at: 0.09, dur: 0.18 });
      } else {
        tone(ctx, { freq: 196, dur: 0.22, type: 'triangle', vol: 0.06 });
        tone(ctx, { freq: 147, at: 0.16, dur: 0.32, type: 'triangle', vol: 0.06 });
      }
    }
    if (navigator.vibrate) navigator.vibrate(isRight ? [18] : [40, 50, 70]);
  }

  /* ---------- Sélection d'un tour ---------- */
  // Fakes : le niveau est lu dans le champ `difficulty` (« moyen » par défaut).
  // Vraies photos : utilisables partout, sauf si elles portent un `difficulty`.
  function pools(level, ignoreSeen = false) {
    const seen = ignoreSeen ? new Set() : new Set(memory.seen);
    return {
      real: catalog.real.filter((i) => !seen.has(i.id) && (!isLevel(i.difficulty) || i.difficulty === level)),
      fake: catalog.fake.filter((i) => !seen.has(i.id) && (isLevel(i.difficulty) ? i.difficulty : 'medium') === level),
    };
  }
  const roundsOf = (p) => Math.min(p.real.length, p.fake.length); // un tour = 1 vraie + 1 IA
  const roundsLeft = (level) => roundsOf(pools(level));
  const roundsTotal = (level) => roundsOf(pools(level, true));

  function pickRound(level) {
    const pool = pools(level);
    if (pool.real.length < 1 || pool.fake.length < 1) return null;
    const real = shuffle(pool.real)[0];
    const fake = shuffle(pool.fake)[0];
    return {
      ids: shuffle([real, fake]).map((i) => i.id),
      realId: real.id,
      answered: false,
      choice: null,
    };
  }

  /* ---------- Partie (mort subite) ---------- */
  function newGame(level) {
    return {
      difficulty: level,
      startedAt: Date.now(),
      score: 0,
      correct: 0,
      rounds: 0,
      over: false, // passe à true à la première erreur
    };
  }

  function startGame() {
    const level = memory.difficulty;
    if (roundsLeft(level) < 1) return updateStartView();
    memory.game = newGame(level);
    memory.round = pickRound(level);
    savePlayerMemory(memory);
    showPlay();
  }

  function answer(index) {
    const g = memory.game;
    const r = memory.round;
    if (!g || !r || r.answered || g.over) return;

    const isRight = r.ids[index] === r.realId;
    r.answered = true;
    r.choice = index;
    g.rounds += 1;

    let gained = 0;
    if (isRight) {
      g.correct += 1;
      // en mort subite, la série en cours est égale au nombre de bonnes réponses
      gained = BASE_POINTS + Math.min(g.correct - 1, STREAK_CAP) * STREAK_STEP;
      g.score += gained;
    } else {
      g.over = true;
    }
    r.gained = gained;

    // Les deux images sont désormais « passées » : elles ne reviendront plus.
    r.ids.forEach((id) => { if (!memory.seen.includes(id)) memory.seen.push(id); });

    // Meilleur score du niveau, mis à jour en temps réel
    const b = memory.best[g.difficulty];
    b.score = Math.max(b.score, g.score);
    b.correct = Math.max(b.correct, g.correct);

    savePlayerMemory(memory);
    renderStats(isRight);
    revealRound();
    feedbackEffects(isRight);
  }

  function nextRound() {
    const g = memory.game;
    if (!g) return;
    if (g.over) return endGame('wrong');
    const next = pickRound(g.difficulty);
    if (!next) return endGame('pool');
    memory.round = next;
    savePlayerMemory(memory);
    renderRound();
  }

  function endGame(reason) {
    const g = memory.game;
    if (!g) return;
    const level = g.difficulty;
    const prevRecord = memory.games
      .filter((x) => x.difficulty === level)
      .reduce((m, x) => Math.max(m, x.score), 0);
    const isRecord = g.score > 0 && g.score > prevRecord;

    memory.games.unshift({
      endedAt: Date.now(),
      difficulty: level,
      score: g.score,
      correct: g.correct,
      rounds: g.rounds,
      reason,
    });
    memory.games = memory.games.slice(0, MAX_GAMES_KEPT);
    memory.game = null;
    memory.round = null;
    savePlayerMemory(memory);

    $('#end-title').textContent = reason === 'wrong' ? 'Mort subite' : 'Sans-faute !';
    $('#end-text').textContent =
      reason === 'wrong'
        ? 'Une seule erreur suffit : la partie s\'arrête ici.'
        : 'Toutes les images de ce niveau sont passées sans une erreur. Impressionnant.';
    $('#end-summary').innerHTML = [
      ['Score', fmt(g.score)],
      ['Bonnes réponses', fmt(g.correct)],
      ['Niveau', levelLabel(level)],
      ['Record du niveau', fmt(memory.best[level].score)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#end-record').hidden = !isRecord;

    renderStats();
    showStart();
    el.dlgEnd.showModal();
  }

  /* ---------- Rendu ---------- */
  function renderStats(pulse = false) {
    const level = currentLevel();
    const g = memory.game;
    const best = memory.best[level];

    el.score.textContent = fmt(g ? g.score : 0);
    el.correct.textContent = fmt(g ? g.correct : 0);
    el.level.textContent = LEVELS[level].label;
    el.levelSub.textContent = LEVELS[level].desc;
    el.best.textContent = fmt(best.score);
    el.bestSub.textContent = `série max : ${fmt(best.correct)}`;

    if (pulse) {
      [el.score, el.correct].forEach((n) => {
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

    const g = memory.game;
    const played = g ? g.rounds : 0;
    const left = roundsLeft(g.difficulty);
    el.roundInfo.textContent = r.answered
      ? `${levelLabel(g.difficulty)} · tour ${played}`
      : `${levelLabel(g.difficulty)} · tour ${played + 1} sur ${played + left} max`;

    el.feedback.className = 'feedback';
    el.feedbackText.textContent = 'Clique sur une image, ou touche 1 ou 2. Une erreur et c\'est fini.';
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
      if (i === r.choice) {
        card.classList.add('is-picked');
        const pick = document.createElement('span');
        pick.className = 'pick';
        pick.textContent = 'Ton choix';
        card.append(pick);
      }
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = isReal ? '✓ Vraie photo' : '✕ Image IA';
      card.append(tag);
      card.setAttribute('aria-label', `Image ${i + 1} : ${isReal ? 'vraie photo' : 'image générée par IA'}`);
    });

    const right = r.ids[r.choice] === r.realId;
    const realPos = r.ids.indexOf(r.realId) + 1;
    el.feedback.className = 'feedback ' + (right ? 'good' : 'bad');

    if (right) {
      const bonus = (r.gained || 0) - BASE_POINTS;
      el.feedbackText.textContent = `✓ Bien vu ! +${r.gained} pts` + (bonus > 0 ? ` (série +${bonus})` : '');
    } else {
      el.feedbackText.textContent = `✕ Raté… la vraie photo était la n°${realPos}.`;
    }

    const finished = g.over || roundsLeft(g.difficulty) < 1;
    el.btnNext.textContent = finished ? 'Voir le résultat' : 'Tour suivant';
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
    const left = Object.fromEntries(LEVEL_KEYS.map((k) => [k, roundsLeft(k)]));
    const total = Object.fromEntries(LEVEL_KEYS.map((k) => [k, roundsTotal(k)]));

    // Si le niveau choisi est épuisé, on bascule sur un niveau encore jouable.
    if (left[memory.difficulty] < 1) {
      const alt = LEVEL_KEYS.find((k) => left[k] > 0);
      if (alt) {
        memory.difficulty = alt;
        savePlayerMemory(memory);
      }
    }

    document.querySelectorAll('input[name="level"]').forEach((input) => {
      const k = input.value;
      input.checked = k === memory.difficulty;
      input.disabled = left[k] < 1;
      const n = left[k];
      const text = $(`[data-count="${k}"]`);
      if (text) {
        text.textContent = total[k] < 1 ? 'pas d\'images' : n < 1 ? 'épuisé' : `${n} ${plural(n, 'tour', 'tours')}`;
      }
    });

    const anyTotal = LEVEL_KEYS.some((k) => total[k] > 0);
    const canPlay = left[memory.difficulty] >= 1;

    el.btnPlay.hidden = !canPlay;
    el.btnResetSeen.hidden = canPlay || !anyTotal || memory.seen.length === 0;
    el.startNotice.hidden = canPlay;
    if (!canPlay) {
      el.startNotice.textContent = anyTotal
        ? 'Toutes les images ont été vues.'
        : 'Aucune image jouable : il faut au moins 1 vraie photo et 1 image IA d\'un même niveau. Ajoute tes fichiers dans images/ puis lance tools/build_images_json.py (voir le README).';
    }

    const seen = memory.seen.length;
    el.startHint.textContent = seen ? `${seen} ${plural(seen, 'image déjà vue', 'images déjà vues')}` : '';
    el.btnPlay.textContent = memory.games.length ? 'Nouvelle partie' : 'Jouer';
    renderStats();
  }

  /* ---------- Historique ---------- */
  function renderHistory() {
    const body = $('#history-body');
    body.replaceChildren(
      ...memory.games.map((g) => {
        const tr = document.createElement('tr');
        [fmtDate(g.endedAt), levelLabel(g.difficulty), fmt(g.score), fmt(g.correct)].forEach((v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.append(td);
        });
        return tr;
      })
    );
    $('#history-empty').hidden = memory.games.length > 0;
    $('.table-wrap').hidden = memory.games.length === 0;

    const records = LEVEL_KEYS.map((k) => `${LEVELS[k].label} ${fmt(memory.best[k].score)}`).join(' · ');
    const seen = memory.seen.length;
    $('#history-summary').textContent =
      `Records : ${records} · ${seen} ${plural(seen, 'image déjà vue', 'images déjà vues')} sur ${catalog.real.length + catalog.fake.length}`;
  }

  function resetSeen() {
    if (!confirm('Réinitialiser les images vues ? Elles pourront de nouveau apparaître. Les scores sont conservés.')) return;
    memory.seen = [];
    memory.game = null;
    memory.round = null;
    savePlayerMemory(memory);
    showStart();
    renderHistory();
  }

  function clearAll() {
    if (!confirm('Tout effacer : parties, records, images vues et réglages ?')) return;
    memory = emptyMemory();
    savePlayerMemory(memory);
    applySettings();
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
  $('#btn-settings').addEventListener('click', () => el.dlgSettings.showModal());
  $('#btn-history').addEventListener('click', () => { renderHistory(); el.dlgHistory.showModal(); });

  el.btnSound.addEventListener('click', () => {
    setSetting('sound', !memory.settings.sound);
    if (memory.settings.sound) feedbackEffects(true); // petit aperçu à la réactivation
  });
  el.optSound.addEventListener('change', () => setSetting('sound', el.optSound.checked));
  el.optCb.addEventListener('change', () => setSetting('colorblind', el.optCb.checked));
  document.querySelectorAll('input[name="theme"]').forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) setSetting('theme', r.value); });
  });

  document.querySelectorAll('input[name="level"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked || memory.game) return;
      memory.difficulty = r.value;
      savePlayerMemory(memory);
      renderStats();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (el.viewPlay.hidden) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 2) answer(n - 1);
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
    applySettings();
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
      el.startNotice.textContent = 'Impossible de charger data/images.json. Lance le site via un serveur local (voir le README).';
      renderStats();
      return;
    }

    // Reprise d'une partie interrompue (rechargement de page)
    const r = memory.round;
    // (un tour sauvegardé avec un autre nombre d'images est abandonné)
    const roundValid = r && Array.isArray(r.ids) && r.ids.length === 2 && r.ids.every((id) => byId.has(id)) && byId.has(r.realId);
    if (memory.game && roundValid) {
      showPlay();
    } else {
      memory.game = null;
      memory.round = null;
      showStart();
    }
  }

  init();
})();
