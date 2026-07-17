# The Backspin Program

Mobile-optimized web app for working through Anderson Miller's (Unfinished
Player Development) YouTube hitting curriculum — 67 unique videos across 6
playlists, with watch tracking, per-video overviews and key takeaways, and
progress bars per playlist plus overall.

**Channel:** https://www.youtube.com/@andersonLmiller

## Run it

No build step, no dependencies. Any static server works:

```bash
python3 -m http.server 8371 --directory .
# then open http://localhost:8371 (or your Mac's LAN IP from a phone)
```

Or via Claude Code's preview: the launch config is in `.claude/launch.json`
(`backspin-program`).

To use it on a phone away from home, host the folder anywhere static
(GitHub Pages, Netlify drop, Vercel) — there is no backend.

## How it works

- **Grouping** mirrors the channel's 6 playlists. Many videos appear in 2–3
  playlists; they're deduplicated by YouTube video ID, so marking a video
  watched counts it in *every* playlist that contains it (the detail view
  says so under "Also appears in").
- **Progress**: each playlist fills to 100% (chalk bar + a baseball-diamond
  glyph that fills one base per completed quarter), and the sticky scoreboard
  at the top tracks the overall 0–67.
- **Up next** suggests the next unwatched video in *curriculum order* — the
  phased sequence (Orientation → The Setup → Backspin Fundamentals →
  Troubleshooting → In-Game Transfer → Mental Game → Applied Study). Every
  video row carries a `P0`–`P6` phase chip tying it back to that sequence.
- **Embedded playback**: tapping a video's thumbnail in the detail view
  swaps in a YouTube player (IFrame API, privacy-enhanced
  `youtube-nocookie.com` host). While it plays, a live strip shows
  `current / total · %`, and a thin amber bar on the video's row fills in
  real time. Playback position is saved every second, so a reopened video
  shows a "Resume m:ss" chip and starts where you left off. Reaching 90%
  (or the end) auto-marks the video watched — the manual diamond toggle
  still works for overrides.
- **Tracking** lives in `localStorage` (keys `backspin-program-watched-v1`
  and `backspin-program-positions-v1`), per browser/device. "Reset all
  progress" in the footer clears both.
- **"Open in YouTube" links** carry the playlist context (`watch?v=…&list=…`)
  so the video opens inside its playlist in the YouTube app. One video
  ("The Setup: Introduction") has embedding disabled by the channel and
  always opens on YouTube directly.

## Files

| File | Role |
|---|---|
| `index.html` / `styles.css` / `app.js` | The whole app — vanilla JS, no framework |
| `data.js` | Generated dataset: playlists, videos, overviews, takeaways |
| `scripts/gen_data.py` | Regenerates `data.js` from the inputs below |
| `scripts/content.json` | Hand-curated overviews/takeaways + phase sequence (source of truth for content) |
| `scripts/pl_*.json` | Raw `yt-dlp --flat-playlist` dumps of the 6 playlists (source of truth for structure) |

### Refreshing when the channel adds videos

```bash
# re-dump a playlist (repeat per playlist id, see PLAYLIST_ORDER in gen_data.py)
yt-dlp -J --flat-playlist "https://www.youtube.com/playlist?list=<PLAYLIST_ID>" > scripts/pl_<PLAYLIST_ID>.json
# add overview/takeaways for any new video ids to scripts/content.json, then:
python3 scripts/gen_data.py
```

The generator fails loudly if a playlist video has no curated content entry
(or vice versa), so ID typos can't silently break the app.

## Design decisions

- **Static + vanilla JS**: single-user tracker, no accounts or sync needed —
  a backend or framework would be pure overhead. State is small enough that
  "re-render everything on change" keeps the code simple.
- **Content vs. structure split**: playlist membership/titles/durations are
  scraped (objective, refreshable); overviews/takeaways/phases are curated
  (editorial, written from the videos' own descriptions). They merge at
  generation time with validation.
- **Visual direction**: night-game scoreboard — deep field green, chalk
  white, scoreboard amber, infield clay. Type: Graduate (varsity display),
  Oswald (scoreboard numerals/labels), Archivo (body). Signature element:
  the per-playlist baseball diamond that fills base-by-base.
- **Excluded**: one video in "Unfinished Player Development"
  (`sVHsnwgY2fA`) is unavailable/hidden on YouTube and is skipped at
  generation time.
- The 3 duplicate entries *inside* the Backspin & Hitting playlist (YouTube
  allows repeats) are deduplicated, which is why the app's 67 differs from
  the channel's raw entry count of 88.
