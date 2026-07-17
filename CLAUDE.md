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
  `backspin-program-positions-v1`); if a stored shape ever changes, bump the
  version rather than migrating in place.
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
