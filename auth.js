/* Clerk auth gate + cloud progress sync + coach (admin) view.
 *
 * Each user's progress lives in their own Clerk unsafeMetadata (client-
 * writable, self-only). The coach view calls /api/roster, which runs with
 * the secret key server-side and is gated on publicMetadata.role === 'admin'.
 */

const CLOUD_DEBOUNCE_MS = 2500;
let cloudTimer = null;
let cloudBusy = false;
let cloudDirty = false;

// Debounced push — called from saveWatched/savePositions in app.js.
function scheduleCloudSync() {
  if (!window.Clerk?.user) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(pushCloudProgress, CLOUD_DEBOUNCE_MS);
}

// Positions are trimmed for the cloud copy: unwatched videos only, rounded
// seconds. Keeps the metadata payload well under Clerk's 8KB limit.
function trimmedPositions() {
  const out = {};
  for (const [vid, p] of Object.entries(state.positions)) {
    if (state.watched[vid] || !p.d) continue;
    out[vid] = { t: Math.round(p.t), d: Math.round(p.d), at: p.at };
  }
  return out;
}

// Quiz scores are trimmed to videoId -> best score (0-3) — no timestamps,
// so all 67 fit in ~1.3KB of the 8KB metadata budget.
function trimmedQuiz() {
  const out = {};
  for (const [vid, r] of Object.entries(state.quiz)) out[vid] = r.score;
  return out;
}

async function pushCloudProgress() {
  if (cloudBusy) { cloudDirty = true; return; }
  cloudBusy = true;
  try {
    await Clerk.user.update({
      unsafeMetadata: {
        progress: {
          watched: state.watched,
          positions: trimmedPositions(),
          quiz: trimmedQuiz(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
    setSyncBadge("synced");
  } catch (e) {
    setSyncBadge("offline");
  } finally {
    cloudBusy = false;
    if (cloudDirty) { cloudDirty = false; scheduleCloudSync(); }
  }
}

// Merge cloud progress into localStorage before the app first renders.
// Watched: union (earliest timestamp wins). Positions: newest `at` wins.
// Quiz: best score wins (cloud stores bare scores, local stores {score, at}).
function mergeCloudProgress(cloud) {
  if (!cloud) return;
  const watched = JSON.parse(localStorage.getItem("backspin-program-watched-v1") || "{}");
  for (const [vid, ts] of Object.entries(cloud.watched || {})) {
    if (!watched[vid] || ts < watched[vid]) watched[vid] = ts;
  }
  const positions = JSON.parse(localStorage.getItem("backspin-program-positions-v1") || "{}");
  for (const [vid, p] of Object.entries(cloud.positions || {})) {
    if (!positions[vid] || (p.at || "") > (positions[vid].at || "")) positions[vid] = p;
  }
  const quiz = JSON.parse(localStorage.getItem("backspin-program-quiz-v1") || "{}");
  for (const [vid, score] of Object.entries(cloud.quiz || {})) {
    if (!quiz[vid] || score > quiz[vid].score) quiz[vid] = { score };
  }
  localStorage.setItem("backspin-program-watched-v1", JSON.stringify(watched));
  localStorage.setItem("backspin-program-positions-v1", JSON.stringify(positions));
  localStorage.setItem("backspin-program-quiz-v1", JSON.stringify(quiz));
}

function setSyncBadge(mode) {
  const el = document.getElementById("sync-badge");
  if (!el) return;
  el.textContent = mode === "synced" ? "Synced" : "Offline — will retry";
  el.classList.toggle("offline", mode !== "synced");
}

// ── Coach (admin) view ───────────────────────────────────────────────────

// Per-user expandable list: every video in curriculum order with watched
// state and best quiz score, grouped by phase.
function rosterVideosHtml(watched, quiz) {
  const vids = Object.values(DATA.videos).sort((a, b) => a.seq - b.seq);
  let phase = -1;
  const rows = vids.map((v) => {
    const header = v.phase !== phase
      ? `<p class="rv-phase">Phase ${v.phase}: ${esc(DATA.phaseNames[v.phase])}</p>` : "";
    phase = v.phase;
    const score = quiz[v.id];
    return `${header}
    <div class="rv-row ${watched[v.id] ? "watched" : ""}">
      <span class="rv-check">${watched[v.id] ? "✓" : "·"}</span>
      <span class="rv-title">${esc(v.title)}</span>
      <span class="rv-quiz ${score === 3 ? "perfect" : ""}">${score == null ? "—" : `${score}/3`}</span>
    </div>`;
  }).join("");
  return `<details class="roster-videos">
    <summary>Videos & quizzes</summary>
    <div class="rv-list">${rows}</div>
  </details>`;
}

function rosterRowHtml(u) {
  const watched = u.progress?.watched || {};
  const quiz = u.progress?.quiz || {};
  const allIds = Object.keys(DATA.videos);
  const done = allIds.filter((id) => watched[id]).length;
  const pct = Math.round((done / allIds.length) * 100);
  const inProgress = Object.keys(u.progress?.positions || {}).length;
  const perPlaylist = DATA.playlists.map((pl) => {
    const plDone = pl.videos.filter((id) => watched[id]).length;
    const plPct = Math.round((plDone / pl.videos.length) * 100);
    return `<div class="roster-pl" title="${pl.name}: ${plDone}/${pl.videos.length}">
      <span class="roster-pl-name">${pl.name.replace(/^(The |Unfinished )/, "").split(" ")[0]}</span>
      <span class="chalkbar"><span class="chalkbar-fill ${plPct === 100 ? "complete" : ""}" style="width:${plPct}%"></span></span>
    </div>`;
  }).join("");
  const scores = Object.values(quiz);
  const quizLine = scores.length
    ? `${scores.length}/${allIds.length} quizzes · avg ${(scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1)}/3 · ${scores.filter((n) => n === 3).length} perfect`
    : "no quizzes yet";
  const last = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "—";
  return `
  <div class="roster-card">
    <div class="roster-head">
      <span class="roster-name">${esc(u.name || u.username || "?")}</span>
      <span class="roster-user">@${esc(u.username || "?")}</span>
      <span class="roster-stat">${done}/${allIds.length} · ${pct}%</span>
    </div>
    <div class="chalkbar roster-overall"><span class="chalkbar-fill ${pct === 100 ? "complete" : ""}" style="width:${pct}%"></span></div>
    <div class="roster-playlists">${perPlaylist}</div>
    <div class="roster-meta">${quizLine}</div>
    <div class="roster-meta">${inProgress ? `${inProgress} video${inProgress > 1 ? "s" : ""} in progress · ` : ""}last active ${last}</div>
    ${rosterVideosHtml(watched, quiz)}
  </div>`;
}

async function openCoachView() {
  const section = document.getElementById("coach-view");
  const body = document.getElementById("coach-body");
  section.hidden = !section.hidden;
  if (section.hidden) return;
  body.innerHTML = `<p class="coach-note">Loading roster…</p>`;
  try {
    const token = await Clerk.session.getToken();
    const res = await fetch("/api/roster", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { users } = await res.json();
    const sorted = users.sort((a, b) =>
      Object.keys(b.progress?.watched || {}).length - Object.keys(a.progress?.watched || {}).length);
    body.innerHTML = sorted.map(rosterRowHtml).join("") ||
      `<p class="coach-note">No players yet — add users in the Clerk dashboard.</p>`;
  } catch (e) {
    body.innerHTML = `<p class="coach-note">Couldn't load the roster (${e.message}). The coach view only works on the deployed site, and your account needs the admin role.</p>`;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────

window.addEventListener("load", async () => {
  const gate = document.getElementById("auth-gate");
  const shell = document.getElementById("app-shell");
  try {
    await Clerk.load();
  } catch (e) {
    // Clerk unreachable — run in local-only mode rather than a dead page.
    gate.hidden = true;
    shell.hidden = false;
    initApp();
    setSyncBadge("offline");
    return;
  }

  if (!Clerk.isSignedIn) {
    shell.hidden = true;
    gate.hidden = false;
    Clerk.mountSignIn(document.getElementById("sign-in"));
    return;
  }

  mergeCloudProgress(Clerk.user.unsafeMetadata?.progress);
  gate.hidden = true;
  shell.hidden = false;
  initApp();
  setSyncBadge("synced");

  document.getElementById("user-name").textContent =
    Clerk.user.firstName || Clerk.user.username || "";
  Clerk.mountUserButton(document.getElementById("user-button"));

  if (Clerk.user.publicMetadata?.role === "admin") {
    const btn = document.getElementById("coach-btn");
    btn.hidden = false;
    btn.addEventListener("click", openCoachView);
  }

  // Push any progress made while offline/local-only.
  scheduleCloudSync();
});
