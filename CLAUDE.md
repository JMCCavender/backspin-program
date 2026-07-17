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
- localStorage key is versioned (`backspin-program-watched-v1`); if the
  stored shape ever changes, bump the version rather than migrating in place.
- Preview server: `.claude/launch.json` → `backspin-program` (port 8371).
