# anderson-miller — The Backspin Program

Static, mobile-first tracker for Anderson Miller's YouTube hitting curriculum.
See README.md for the full architecture and refresh workflow.

## Gotchas

- **Never edit `data.js` by hand** — it's generated. Content changes go in
  `scripts/content.json`; structural changes come from re-dumping playlists
  with yt-dlp; then run `python3 scripts/gen_data.py`.
- `scripts/gen_data.py` intentionally exits non-zero if the set of video IDs
  in the playlist dumps and in `content.json` don't match exactly. That's
  the safety net — don't weaken it.
- Video `sVHsnwgY2fA` (in the "Unfinished Player Development" playlist) is
  unavailable on YouTube and is skipped by the generator. If it ever
  reappears, the generator will fail asking for content — that's expected.
- "Backspin & Hitting" contains 3 duplicated entries within the playlist
  itself; within-playlist dedupe in the generator handles it.
- All strings rendered via `innerHTML` in `app.js` must pass through `esc()`.
  Data is locally generated (no user input), but keep the habit.
- localStorage keys are versioned (`backspin-program-watched-v1`,
  `backspin-program-positions-v1`, `backspin-program-quiz-v1`); if a stored
  shape ever changes, bump the version rather than migrating in place.
- Post-video quizzes live in `scripts/quiz.json` (3 questions per video:
  choices, answer index, explanation, review timestamp `t` in seconds).
  The generator validates the ID set and question shape the same way it
  does `content.json`. The `t` values were seeded at ~15/45/75% of each
  video's duration — refine them in `quiz.json` as videos get rewatched.
  Quiz scores are intentionally NOT cloud-synced (Clerk 8KB metadata cap).
- Elements hidden via the `hidden` attribute must not get an author
  `display` value without a `[hidden] { display: none; }` override — see
  `.quiz-overlay` and `.btn-quiz` in styles.css for the pattern.
- **Never call full `render()` after page load** — it destroys an active
  embedded YouTube player. All post-load updates go through the surgical
  helpers in app.js (`updateWatchedUI`, `updateLiveProgress`,
  `togglePlaylistDom`, `toggleVideoDom`). Full render is init/reset-only.
- `playInline` claims `player.key` *before* awaiting the IFrame API and every
  async continuation re-checks it — that guard prevents a double-tap race
  that orphans players. Keep it.
- Embed-disabled videos (YouTube error 150/101) are flagged `noEmbed` in
  `data.js` via the `NO_EMBED` set in `scripts/gen_data.py` (currently just
  `kiUMz_HTyFw`). The app also handles unknown ones at runtime via `onError`,
  but add newly discovered ones to `NO_EMBED` for a better first tap.
- Preview server: `.claude/launch.json` → `backspin-program` (port 8371).
- **Auth**: Clerk app `backspin-program` (dev instance
  `settling-rattler-88.clerk.accounts.dev`), username+password, restricted
  sign-ups. Secret key: Vercel env `CLERK_SECRET_KEY` +
  `~/.secrets/backspin-clerk-sk` locally — never commit it, never print it.
- **Deploys go to Vercel** (`vercel deploy --prod --yes`, project
  `backspin-program`) — GitHub Pages still serves the static app but lacks
  `/api/roster`, so the coach view only works on the Vercel URL.
- `initApp()` (app.js) is only called by auth.js after sign-in + cloud
  merge; don't reintroduce an auto-run at the bottom of app.js.
- Progress pushed to Clerk unsafeMetadata is TRIMMED (`trimmedPositions()` in
  auth.js): unwatched-only, rounded seconds — Clerk metadata has an 8KB
  cap. Don't sync raw `state.positions`.
- Admin role lives in `publicMetadata.role` (server-set only, via
  `scripts/grant_admin.sh`). `unsafeMetadata` is client-writable — never put
  authorization data there.
