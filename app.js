/* The Backspin Program — playlist tracker logic */

const STORE_KEY = "backspin-program-watched-v1";

// ── State ────────────────────────────────────────────────────────────────

function loadWatched() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

const state = {
  watched: loadWatched(), // videoId -> ISO timestamp
  openPlaylists: new Set(), // playlist ids expanded
  openVideos: new Set(), // `${playlistId}:${videoId}` expanded
};

function saveWatched() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.watched));
}

function isWatched(id) {
  return Boolean(state.watched[id]);
}

function toggleWatched(id) {
  if (isWatched(id)) delete state.watched[id];
  else state.watched[id] = new Date().toISOString();
  saveWatched();
  render();
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

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
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
  el("#upnext-card").addEventListener("click", () => jumpToVideo(next.id));
}

function videoRowHtml(pl, vid) {
  const v = DATA.videos[vid];
  const key = `${pl.id}:${vid}`;
  const open = state.openVideos.has(key);
  const watched = isWatched(vid);
  const others = APPEARS_IN[vid].filter((n) => n !== pl.name);
  return `
  <div class="video ${watched ? "watched" : ""}" data-video="${vid}">
    <button class="video-row" data-key="${key}" aria-expanded="${open}">
      <span class="check" data-check="${vid}" role="checkbox" aria-checked="${watched}"
        aria-label="Mark ${esc(v.title)} as watched" tabindex="0">${checkGlyph()}</span>
      <span>
        <span class="video-title">${esc(v.title)}</span>
        <span class="video-meta">
          <span class="phase-chip">P${v.phase}</span>
          <span class="duration">${fmtDuration(v.duration)}</span>
        </span>
      </span>
      <span class="video-caret">▼</span>
    </button>
    <div class="video-detail" ${open ? "" : "hidden"}>
      <a class="thumb-link" href="${watchUrl(vid, pl.id)}" target="_blank" rel="noopener"
         aria-label="Watch ${esc(v.title)} on YouTube">
        <img class="thumb" src="${thumbUrl(vid)}" alt="" loading="lazy">
        <span class="play-badge"><span>▶</span></span>
      </a>
      <p class="overview">${esc(v.overview)}</p>
      <p class="takeaways-label">Key takeaways</p>
      <ul class="takeaways">${v.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      ${others.length ? `<p class="also-in">Also appears in: ${others.map(esc).join(", ")} — watching it once counts everywhere.</p>` : ""}
      <div class="detail-actions">
        <a class="btn btn-watch" href="${watchUrl(vid, pl.id)}" target="_blank" rel="noopener">Watch on YouTube</a>
        <button class="btn btn-mark" data-mark="${vid}">${watched ? "Watched ✓" : "Mark watched"}</button>
      </div>
    </div>
  </div>`;
}

function renderPlaylists() {
  const main = el("#playlists");
  main.innerHTML = DATA.playlists
    .map((pl) => {
      const { done, total, pct } = playlistProgress(pl);
      const open = state.openPlaylists.has(pl.id);
      return `
      <section class="playlist" data-playlist="${pl.id}">
        <button class="playlist-head" aria-expanded="${open}" data-pl="${pl.id}">
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
        <div class="playlist-body" ${open ? "" : "hidden"}>
          ${pl.videos.map((vid) => videoRowHtml(pl, vid)).join("")}
        </div>
      </section>`;
    })
    .join("");

  // Delegated events
  main.querySelectorAll(".playlist-head").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.pl;
      state.openPlaylists.has(id) ? state.openPlaylists.delete(id) : state.openPlaylists.add(id);
      render();
    })
  );

  main.querySelectorAll(".video-row").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-check]")) return; // checkbox handles itself
      const key = btn.dataset.key;
      state.openVideos.has(key) ? state.openVideos.delete(key) : state.openVideos.add(key);
      render();
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

// Expand the playlist containing a video, open its detail, scroll to it.
function jumpToVideo(vid) {
  const pl = DATA.playlists.find((p) => p.videos.includes(vid));
  state.openPlaylists.add(pl.id);
  state.openVideos.add(`${pl.id}:${vid}`);
  render();
  document.querySelector(`.playlist[data-playlist="${pl.id}"] [data-video="${vid}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── Init ─────────────────────────────────────────────────────────────────

el("#reset-btn").addEventListener("click", () => {
  if (confirm("Clear all watch progress? This can't be undone.")) {
    state.watched = {};
    saveWatched();
    render();
  }
});

// Start with the first incomplete playlist expanded.
const firstIncomplete = DATA.playlists.find((pl) => playlistProgress(pl).done < pl.videos.length);
if (firstIncomplete) state.openPlaylists.add(firstIncomplete.id);

render();
