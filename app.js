/* The Backspin Program — playlist tracker logic
 *
 * Rendering strategy: full render() runs once at load. After that, all state
 * changes (watch toggles, accordion opens, live playback progress) patch the
 * DOM surgically — a full re-render would destroy an active YouTube player.
 */

const STORE_KEY = "backspin-program-watched-v1";
const POS_KEY = "backspin-program-positions-v1";
const QUIZ_KEY = "backspin-program-quiz-v1";
const AUTO_MARK_AT = 0.9; // fraction of video watched that auto-marks it

// ── State ────────────────────────────────────────────────────────────────

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

const state = {
  watched: loadJson(STORE_KEY), // videoId -> ISO timestamp
  positions: loadJson(POS_KEY), // videoId -> {t: seconds, d: duration, at: ISO}
  quiz: loadJson(QUIZ_KEY), // videoId -> {score: 0-3, at: ISO} (latest attempt, local only)
};

function saveWatched() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.watched));
  if (typeof scheduleCloudSync === "function") scheduleCloudSync();
}

function savePositions() {
  localStorage.setItem(POS_KEY, JSON.stringify(state.positions));
  if (typeof scheduleCloudSync === "function") scheduleCloudSync();
}

// Quiz results stay local-only (not cloud-synced) — Clerk metadata has an
// 8KB cap and watch state is the progress that matters cross-device.
function saveQuiz() {
  localStorage.setItem(QUIZ_KEY, JSON.stringify(state.quiz));
}

function isWatched(id) {
  return Boolean(state.watched[id]);
}

// ── Derived data ─────────────────────────────────────────────────────────

const ALL_IDS = Object.keys(DATA.videos);

// videoId -> [playlist names it appears in]
const APPEARS_IN = {};
for (const pl of DATA.playlists) {
  for (const vid of pl.videos) {
    (APPEARS_IN[vid] = APPEARS_IN[vid] || []).push(pl.name);
  }
}

function playlistProgress(pl) {
  const done = pl.videos.filter(isWatched).length;
  return { done, total: pl.videos.length, pct: Math.round((done / pl.videos.length) * 100) };
}

function overallProgress() {
  const done = ALL_IDS.filter(isWatched).length;
  return { done, total: ALL_IDS.length, pct: Math.round((done / ALL_IDS.length) * 100) };
}

// Next unwatched video in curriculum order (phase sequence).
function pickUpNext() {
  let best = null;
  for (const id of ALL_IDS) {
    if (isWatched(id)) continue;
    const v = DATA.videos[id];
    if (!best || v.seq < best.seq) best = v;
  }
  return best;
}

// Percent of a video actually played (0 when watched — the bar hides then).
function positionPct(vid) {
  const p = state.positions[vid];
  if (!p || !p.d) return 0;
  return Math.min(100, Math.round((p.t / p.d) * 100));
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtTotal(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function watchUrl(videoId, playlistId) {
  return `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`;
}

function thumbUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ── Rendering ────────────────────────────────────────────────────────────

const el = (sel) => document.querySelector(sel);

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Baseball diamond: outline + 4 bases that fill as the playlist progresses
// (1 base per completed quarter; all 4 = complete).
function diamondGlyph(pct) {
  const bases = pct >= 100 ? 4 : Math.floor((pct / 100) * 4);
  // base positions: home (bottom), 1st (right), 2nd (top), 3rd (left)
  const pos = [
    [50, 88],
    [88, 50],
    [50, 12],
    [12, 50],
  ];
  const baseSquares = pos
    .map(([x, y], i) => {
      const on = i < bases;
      return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="2.5"
        transform="rotate(45 ${x} ${y})"
        fill="${on ? "var(--amber)" : "none"}"
        stroke="${on ? "var(--amber)" : "var(--chalk-dim)"}" stroke-width="4"/>`;
    })
    .join("");
  const complete = pct >= 100;
  return `<svg class="diamond-glyph" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 12 88 50 50 88 12 50Z" fill="${complete ? "rgba(76,155,98,0.25)" : "none"}"
      stroke="${complete ? "var(--grass)" : "var(--line)"}" stroke-width="3"/>
    ${baseSquares}
  </svg>`;
}

function checkGlyph() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path class="diamond-outline" d="M50 8 92 50 50 92 8 50Z"/>
    <path class="diamond-fill" d="M50 16 84 50 50 84 16 50Z"/>
  </svg>`;
}

function renderScoreboard() {
  const { done, total, pct } = overallProgress();
  el("#sb-watched").textContent = done;
  el("#sb-total").textContent = total;
  el("#sb-pct").textContent = pct + "%";
  el("#sb-bar").setAttribute("aria-valuenow", pct);
  const fill = el("#sb-fill");
  fill.style.width = pct + "%";
  fill.classList.toggle("complete", pct === 100);
}

function renderUpNext() {
  const box = el("#upnext");
  const next = pickUpNext();
  if (!next) {
    box.innerHTML = `<div class="upnext-done">🏆 Curriculum complete — all ${ALL_IDS.length} videos watched. Go hit.</div>`;
    return;
  }
  const phaseName = DATA.phaseNames[next.phase];
  box.innerHTML = `
    <button class="upnext-card" id="upnext-card" aria-label="Up next: ${esc(next.title)}">
      <img class="upnext-thumb" src="${thumbUrl(next.id)}" alt="" loading="lazy">
      <span class="upnext-body">
        <span class="eyebrow">Up next · Phase ${next.phase}: ${esc(phaseName)}</span>
        <span class="upnext-title">${esc(next.title)}</span>
        <span class="upnext-meta">${fmtDuration(next.duration)}</span>
      </span>
    </button>`;
  el("#upnext-card").addEventListener("click", () => jumpToVideo(next.id, true));
}

// The player shell shows the thumbnail until tapped, then swaps in the
// YouTube IFrame player. Restored to a thumbnail when playback is torn down.
// Videos with embedding disabled by the channel link straight to YouTube.
function shellThumbHtml(vid, key) {
  const v = DATA.videos[vid];
  if (v.noEmbed) {
    return `
    <a class="thumb-btn" href="${watchUrl(vid, key.split(":")[0])}" target="_blank" rel="noopener"
       aria-label="Watch ${esc(v.title)} on YouTube">
      <img class="thumb" src="${thumbUrl(vid)}" alt="" loading="lazy">
      <span class="play-badge"><span>▶</span></span>
      <span class="resume-chip">Plays on YouTube</span>
    </a>`;
  }
  const p = state.positions[vid];
  const resume = !isWatched(vid) && p && p.t > 15 && p.d && p.t < p.d * AUTO_MARK_AT
    ? `<span class="resume-chip">Resume ${fmtDuration(p.t)}</span>` : "";
  return `
    <button class="thumb-btn" data-play="${key}" aria-label="Play ${esc(v.title)} here">
      <img class="thumb" src="${thumbUrl(vid)}" alt="" loading="lazy">
      <span class="play-badge"><span>▶</span></span>
      ${resume}
    </button>`;
}

function videoRowHtml(pl, vid) {
  const v = DATA.videos[vid];
  const key = `${pl.id}:${vid}`;
  const watched = isWatched(vid);
  const vpct = watched ? 0 : positionPct(vid);
  const others = APPEARS_IN[vid].filter((n) => n !== pl.name);
  return `
  <div class="video ${watched ? "watched" : ""}" data-video="${vid}">
    <button class="video-row" data-key="${key}" aria-expanded="false">
      <span class="check" data-check="${vid}" role="checkbox" aria-checked="${watched}"
        aria-label="Mark ${esc(v.title)} as watched" tabindex="0">${checkGlyph()}</span>
      <span>
        <span class="video-title">${esc(v.title)}</span>
        <span class="video-meta">
          <span class="phase-chip">P${v.phase}</span>
          <span class="duration">${fmtDuration(v.duration)}</span>
        </span>
        <span class="vprogress" ${vpct ? "" : "hidden"}><span class="vprogress-fill" style="width:${vpct}%"></span></span>
      </span>
      <span class="video-caret">▼</span>
    </button>
    <div class="video-detail" hidden>
      <div class="player-shell" data-shell="${key}">${shellThumbHtml(vid, key)}</div>
      <p class="overview">${esc(v.overview)}</p>
      <p class="takeaways-label">Key takeaways</p>
      <ul class="takeaways">${v.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      ${others.length ? `<p class="also-in">Also appears in: ${others.map(esc).join(", ")} — watching it once counts everywhere.</p>` : ""}
      <div class="detail-actions">
        ${v.noEmbed
          ? `<a class="btn btn-watch" href="${watchUrl(vid, pl.id)}" target="_blank" rel="noopener">Watch on YouTube</a>`
          : `<button class="btn btn-watch" data-play="${key}">▶ Play here</button>`}
        <button class="btn btn-mark" data-mark="${vid}">${watched ? "Watched ✓" : "Mark watched"}</button>
        <button class="btn btn-quiz" data-quiz="${vid}" ${watched ? "" : "hidden"}>${quizBtnLabel(vid)}</button>
      </div>
      ${v.noEmbed ? "" : `<p class="yt-link"><a href="${watchUrl(vid, pl.id)}" target="_blank" rel="noopener">Open in YouTube ↗</a></p>`}
    </div>
  </div>`;
}

function renderPlaylists() {
  const main = el("#playlists");
  main.innerHTML = DATA.playlists
    .map((pl) => {
      const { done, total, pct } = playlistProgress(pl);
      return `
      <section class="playlist" data-playlist="${pl.id}">
        <button class="playlist-head" aria-expanded="false" data-pl="${pl.id}">
          ${diamondGlyph(pct)}
          <span>
            <span class="playlist-name">${esc(pl.name)}</span>
            <span class="playlist-blurb">${esc(pl.blurb)}</span>
          </span>
          <span class="playlist-stat">${done}/${total}<span class="caret">▼</span></span>
        </button>
        <div class="chalkbar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="${pct}" aria-label="${esc(pl.name)}: ${pct}% complete">
          <div class="chalkbar-fill ${pct === 100 ? "complete" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="playlist-body" hidden>
          ${pl.videos.map((vid) => videoRowHtml(pl, vid)).join("")}
        </div>
      </section>`;
    })
    .join("");

  main.querySelectorAll(".playlist-head").forEach((btn) =>
    btn.addEventListener("click", () => togglePlaylistDom(btn.dataset.pl))
  );

  main.querySelectorAll(".video-row").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-check]")) return; // checkbox handles itself
      toggleVideoDom(btn.dataset.key);
    })
  );

  main.querySelectorAll("[data-check]").forEach((chk) => {
    const act = (e) => {
      e.stopPropagation();
      toggleWatched(chk.dataset.check);
    };
    chk.addEventListener("click", act);
    chk.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); act(e); }
    });
  });

  main.querySelectorAll("[data-mark]").forEach((btn) =>
    btn.addEventListener("click", () => toggleWatched(btn.dataset.mark))
  );

  main.querySelectorAll("[data-quiz]").forEach((btn) =>
    btn.addEventListener("click", () => openQuiz(btn.dataset.quiz))
  );

  // Play buttons are created dynamically (shells get re-thumbed), so delegate.
  main.addEventListener("click", (e) => {
    const playBtn = e.target.closest("[data-play]");
    if (playBtn) playInline(playBtn.dataset.play);
  });
}

function renderFooter() {
  const totalSecs = ALL_IDS.reduce((s, id) => s + DATA.videos[id].duration, 0);
  const watchedSecs = ALL_IDS.filter(isWatched).reduce((s, id) => s + DATA.videos[id].duration, 0);
  el("#footer-stats").textContent =
    `${fmtTotal(watchedSecs)} watched of ${fmtTotal(totalSecs)} total instruction`;
}

function render() {
  renderScoreboard();
  renderUpNext();
  renderPlaylists();
  renderFooter();
}

// ── Surgical DOM updates (no full re-render after load) ──────────────────

function togglePlaylistDom(plId, forceOpen) {
  const section = document.querySelector(`.playlist[data-playlist="${plId}"]`);
  const head = section.querySelector(".playlist-head");
  const body = section.querySelector(".playlist-body");
  const open = forceOpen ?? body.hidden;
  body.hidden = !open;
  head.setAttribute("aria-expanded", open);
}

function toggleVideoDom(key, forceOpen) {
  const row = document.querySelector(`.video-row[data-key="${key}"]`);
  const detail = row.parentElement.querySelector(".video-detail");
  const open = forceOpen ?? detail.hidden;
  detail.hidden = !open;
  row.setAttribute("aria-expanded", open);
  // Closing the row that hosts the active player stops playback.
  if (!open && player.key === key) destroyPlayer();
}

// Refresh watched styling for every instance of a video (it can appear in
// several playlists), plus everything derived from watch state.
function updateWatchedUI(vid) {
  const watched = isWatched(vid);
  document.querySelectorAll(`.video[data-video="${vid}"]`).forEach((box) => {
    box.classList.toggle("watched", watched);
    box.querySelector("[data-check]").setAttribute("aria-checked", watched);
    box.querySelector("[data-mark]").textContent = watched ? "Watched ✓" : "Mark watched";
    const quizBtn = box.querySelector("[data-quiz]");
    quizBtn.hidden = !watched;
    quizBtn.textContent = quizBtnLabel(vid);
    const bar = box.querySelector(".vprogress");
    const vpct = watched ? 0 : positionPct(vid);
    bar.hidden = !vpct;
    bar.querySelector(".vprogress-fill").style.width = vpct + "%";
  });
  document.querySelectorAll(".playlist").forEach((section) => {
    const pl = DATA.playlists.find((p) => p.id === section.dataset.playlist);
    const { done, total, pct } = playlistProgress(pl);
    section.querySelector(".playlist-stat").innerHTML =
      `${done}/${total}<span class="caret">▼</span>`;
    const outerBar = section.querySelector(".chalkbar");
    outerBar.setAttribute("aria-valuenow", pct);
    const fill = outerBar.querySelector(".chalkbar-fill");
    fill.style.width = pct + "%";
    fill.classList.toggle("complete", pct === 100);
    section.querySelector(".diamond-glyph").outerHTML = diamondGlyph(pct);
  });
  renderScoreboard();
  renderUpNext();
  renderFooter();
}

function toggleWatched(id) {
  if (isWatched(id)) delete state.watched[id];
  else state.watched[id] = new Date().toISOString();
  saveWatched();
  updateWatchedUI(id);
}

// Live progress bars for one video, across every row it appears in.
function updateLiveProgress(vid) {
  const vpct = isWatched(vid) ? 0 : positionPct(vid);
  document.querySelectorAll(`.video[data-video="${vid}"]`).forEach((box) => {
    const bar = box.querySelector(".vprogress");
    bar.hidden = !vpct;
    bar.querySelector(".vprogress-fill").style.width = vpct + "%";
  });
}

// Expand the playlist containing a video, open its detail, scroll to it.
// With autoplay, start the inline player too (skipped for noEmbed videos).
function jumpToVideo(vid, autoplay = false) {
  const pl = DATA.playlists.find((p) => p.videos.includes(vid));
  togglePlaylistDom(pl.id, true);
  toggleVideoDom(`${pl.id}:${vid}`, true);
  document.querySelector(`.playlist[data-playlist="${pl.id}"] [data-video="${vid}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (autoplay && !DATA.videos[vid].noEmbed) playInline(`${pl.id}:${vid}`);
}

// ── Post-video quiz ──────────────────────────────────────────────────────
// Finishing a video (player ENDED) opens a 3-question multiple-choice quiz.
// Every answer — right or wrong — shows an explanation plus a timestamped
// link back into the video. Results live in localStorage only.

const activeQuiz = { vid: null, idx: 0, correct: 0, order: null, locked: false };

function quizBtnLabel(vid) {
  const r = state.quiz[vid];
  return r ? `Quiz ${r.score}/3 · retake` : "Take the quiz";
}

function updateQuizUI(vid) {
  document.querySelectorAll(`.video[data-video="${vid}"] [data-quiz]`).forEach((btn) => {
    btn.textContent = quizBtnLabel(vid);
  });
}

// Timestamped "review this part" link, carrying playlist context like the
// app's other YouTube links.
function reviewLinkHtml(vid, t) {
  const pl = DATA.playlists.find((p) => p.videos.includes(vid));
  return `<a href="${watchUrl(vid, pl.id)}&t=${Math.floor(t)}s" target="_blank" rel="noopener">
    Review this part of the video at ${fmtDuration(t)} ↗</a>`;
}

function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openQuiz(vid) {
  // Pause inline playback so the quiz has the floor.
  if (player.yt && player.vid === vid) {
    try { player.yt.pauseVideo(); } catch { /* mid-teardown */ }
  }
  activeQuiz.vid = vid;
  activeQuiz.idx = 0;
  activeQuiz.correct = 0;
  el("#quiz-overlay").hidden = false;
  renderQuizQuestion();
}

function closeQuiz() {
  el("#quiz-overlay").hidden = true;
  activeQuiz.vid = null;
}

function renderQuizQuestion() {
  const v = DATA.videos[activeQuiz.vid];
  const q = v.quiz[activeQuiz.idx];
  activeQuiz.order = shuffled(q.choices.length); // display slot -> choice index
  activeQuiz.locked = false;
  el("#quiz-overlay").innerHTML = `
  <div class="quiz-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-q">
    <div class="quiz-head">
      <span class="eyebrow">Post-video quiz · ${activeQuiz.idx + 1} of ${v.quiz.length}</span>
      <button class="quiz-close" aria-label="Close quiz">✕</button>
    </div>
    <p class="quiz-video">${esc(v.title)}</p>
    <p class="quiz-q" id="quiz-q">${esc(q.q)}</p>
    <div class="quiz-choices">
      ${activeQuiz.order.map((ci, slot) => `
        <button class="quiz-choice" data-choice="${ci}">
          <span class="quiz-letter">${"ABCD"[slot]}</span>${esc(q.choices[ci])}
        </button>`).join("")}
    </div>
    <div class="quiz-feedback" hidden>
      <p class="quiz-verdict"></p>
      <p class="quiz-explain">${esc(q.explain)}</p>
      <p class="quiz-review">${reviewLinkHtml(v.id, q.t)}</p>
      <button class="btn btn-watch quiz-next"></button>
    </div>
  </div>`;
  el("#quiz-overlay .quiz-close").addEventListener("click", closeQuiz);
  el("#quiz-overlay .quiz-choices").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-choice]");
    if (btn) answerQuiz(Number(btn.dataset.choice));
  });
  el("#quiz-overlay .quiz-choice").focus();
}

function answerQuiz(choice) {
  if (activeQuiz.locked) return;
  activeQuiz.locked = true;
  const v = DATA.videos[activeQuiz.vid];
  const q = v.quiz[activeQuiz.idx];
  const right = choice === q.answer;
  if (right) activeQuiz.correct++;
  document.querySelectorAll("#quiz-overlay .quiz-choice").forEach((btn) => {
    const ci = Number(btn.dataset.choice);
    btn.disabled = true;
    if (ci === q.answer) btn.classList.add("correct");
    else if (ci === choice) btn.classList.add("wrong");
  });
  const fb = el("#quiz-overlay .quiz-feedback");
  fb.hidden = false;
  const verdict = fb.querySelector(".quiz-verdict");
  verdict.textContent = right ? "✓ Correct" : "✗ Not quite";
  verdict.classList.toggle("right", right);
  const next = fb.querySelector(".quiz-next");
  const last = activeQuiz.idx === v.quiz.length - 1;
  next.textContent = last ? "See results" : "Next question";
  next.addEventListener("click", () => {
    if (last) renderQuizResults();
    else { activeQuiz.idx++; renderQuizQuestion(); }
  });
  next.focus();
}

function renderQuizResults() {
  const v = DATA.videos[activeQuiz.vid];
  const score = activeQuiz.correct;
  state.quiz[v.id] = { score, at: new Date().toISOString() };
  saveQuiz();
  updateQuizUI(v.id);
  const line = score === 3 ? "Perfect — you own this one. On to the next video."
    : score === 2 ? "Solid — one got away. Retake it or rewatch that part and move on."
    : "Worth a rewatch — retake the quiz and use the review links to jump straight to the answers.";
  el("#quiz-overlay").innerHTML = `
  <div class="quiz-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-score">
    <div class="quiz-head">
      <span class="eyebrow">Post-video quiz · results</span>
      <button class="quiz-close" aria-label="Close quiz">✕</button>
    </div>
    <p class="quiz-video">${esc(v.title)}</p>
    <p class="quiz-score" id="quiz-score">${score}<span>/3</span></p>
    <p class="quiz-explain">${line}</p>
    <div class="detail-actions">
      <button class="btn btn-watch quiz-done">Done</button>
      <button class="btn btn-mark quiz-retake">Retake quiz</button>
    </div>
  </div>`;
  el("#quiz-overlay .quiz-close").addEventListener("click", closeQuiz);
  el("#quiz-overlay .quiz-done").addEventListener("click", closeQuiz);
  el("#quiz-overlay .quiz-retake").addEventListener("click", () => openQuiz(v.id));
  el("#quiz-overlay .quiz-done").focus();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeQuiz.vid) closeQuiz();
});

// ── Embedded YouTube player ──────────────────────────────────────────────

let ytApi = null;
function loadYtApi() {
  if (!ytApi) {
    ytApi = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytApi;
}

const player = { yt: null, key: null, vid: null, poll: null };

function savePlayerPosition() {
  if (!player.yt || !player.vid) return;
  try {
    const t = player.yt.getCurrentTime();
    const d = player.yt.getDuration();
    if (d > 0 && t > 0) {
      state.positions[player.vid] = { t, d, at: new Date().toISOString() };
      savePositions();
      updateLiveProgress(player.vid);
      const strip = document.querySelector(`[data-shell="${player.key}"] .live-time`);
      if (strip) strip.textContent =
        `${fmtDuration(t)} / ${fmtDuration(d)} · ${Math.min(100, Math.round((t / d) * 100))}%`;
      if (t / d >= AUTO_MARK_AT && !isWatched(player.vid)) {
        state.watched[player.vid] = new Date().toISOString();
        saveWatched();
        updateWatchedUI(player.vid);
      }
    }
  } catch { /* player mid-teardown */ }
}

function destroyPlayer() {
  savePlayerPosition();
  clearInterval(player.poll);
  const { key, vid } = player;
  try { player.yt?.destroy(); } catch { /* iframe already gone */ }
  player.yt = player.key = player.vid = null;
  player.poll = null;
  // Restore the thumbnail in the shell we vacated, with a fresh resume chip.
  const shell = key && document.querySelector(`[data-shell="${key}"]`);
  if (shell) shell.innerHTML = shellThumbHtml(vid, key);
}

async function playInline(key) {
  const vid = key.split(":")[1];
  if (player.key === key) return;
  destroyPlayer();
  // Claim the slot before awaiting the API so a second tap can't race us;
  // every async continuation below re-checks the claim before acting.
  player.key = key;
  player.vid = vid;
  const shell = document.querySelector(`[data-shell="${key}"]`);
  shell.innerHTML = `<div class="player-frame"><div id="yt-host"></div></div>
    <div class="live-strip"><span class="live-dot" aria-hidden="true"></span><span class="live-time">Loading…</span></div>`;
  const YT = await loadYtApi();
  if (player.key !== key) return; // superseded while the API loaded
  const start = Math.floor(state.positions[vid]?.t || 0);
  player.yt = new YT.Player("yt-host", {
    videoId: vid,
    host: "https://www.youtube-nocookie.com",
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      // restart near-finished videos from the top
      start: start > 0 && state.positions[vid].d && start < state.positions[vid].d * AUTO_MARK_AT ? start : 0,
    },
    events: {
      onReady: (e) => {
        if (player.key === key) e.target.playVideo();
      },
      onStateChange: (e) => {
        if (player.key !== key) return;
        clearInterval(player.poll);
        if (e.data === YT.PlayerState.PLAYING) {
          player.poll = setInterval(savePlayerPosition, 1000);
        } else if (e.data === YT.PlayerState.PAUSED) {
          savePlayerPosition();
        } else if (e.data === YT.PlayerState.ENDED) {
          if (!isWatched(vid)) {
            state.watched[vid] = new Date().toISOString();
            saveWatched();
            updateWatchedUI(vid);
          }
          // First completion opens the quiz; retakes live on the detail button.
          if (!state.quiz[vid]) openQuiz(vid);
        }
      },
      onError: () => {
        if (player.key !== key) return;
        // Embedding disabled by the channel for this video — fall back to a link.
        const url = watchUrl(vid, key.split(":")[0]);
        destroyPlayer();
        const s = document.querySelector(`[data-shell="${key}"]`);
        if (s) s.insertAdjacentHTML("beforeend",
          `<p class="embed-note">This video can't be embedded — <a href="${url}" target="_blank" rel="noopener">watch it on YouTube</a>.</p>`);
      },
    },
  });
}

// Save the latest position when the tab is backgrounded or closed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") savePlayerPosition();
});

// ── Init ─────────────────────────────────────────────────────────────────

el("#reset-btn").addEventListener("click", () => {
  if (confirm("Clear all watch progress? This can't be undone.")) {
    state.watched = {};
    state.positions = {};
    state.quiz = {};
    saveWatched();
    savePositions();
    saveQuiz();
    destroyPlayer();
    closeQuiz();
    render();
    openFirstIncomplete();
  }
});

function openFirstIncomplete() {
  const pl = DATA.playlists.find((p) => playlistProgress(p).done < p.videos.length);
  if (pl) togglePlaylistDom(pl.id, true);
}

// Called by auth.js once the user is signed in and cloud progress is merged.
// eslint-disable-next-line no-unused-vars
function initApp() {
  state.watched = loadJson(STORE_KEY);
  state.positions = loadJson(POS_KEY);
  state.quiz = loadJson(QUIZ_KEY);
  render();
  openFirstIncomplete();
}
