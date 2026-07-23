#!/usr/bin/env python3
"""Fetch per-video metadata + English transcript straight from YouTube watch
pages (no player API — that path trips YouTube's datacenter bot-check, the
watch page itself doesn't).

For each id in scripts/yt_fetch_ids.txt, writes scripts/yt_meta/<id>.meta.json:
  {id, title, duration, description, chapters: [{t, title}],
   transcript: [{t, text}]}
Failures land in scripts/yt_meta/_failures.txt. Run from anywhere; paths are
relative to this file. Works locally and in the fetch-yt-meta workflow.
"""
import json
import pathlib
import re
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).parent
OUT_DIR = HERE / "yt_meta"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+cb; SOCS=CAI",
}


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def extract_json_after(html, marker):
    """Parse the JS object literal that follows `marker` in the page source."""
    i = html.find(marker)
    if i == -1:
        return None
    start = html.index("{", i)
    return json.JSONDecoder().raw_decode(html[start:])[0]


def parse_chapters(description):
    """Timestamp lines in the description ("0:45 Grip pressure") -> chapters."""
    chapters = []
    for line in description.splitlines():
        m = re.match(r"\s*\(?((?:\d+:)?\d+:\d{2})\)?\s*[-–—:]?\s*(\S.*)?$", line)
        if not m:
            continue
        parts = [int(p) for p in m.group(1).split(":")]
        t = parts[-1] + parts[-2] * 60 + (parts[-3] * 3600 if len(parts) == 3 else 0)
        chapters.append({"t": t, "title": (m.group(2) or "").strip()})
    return chapters


def parse_transcript(raw):
    """timedtext fmt=json3 -> [{t, text}] with rolling cues joined."""
    events = json.loads(raw).get("events", [])
    out = []
    for e in events:
        segs = e.get("segs")
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if text:
            out.append({"t": e["tStartMs"] // 1000, "text": text})
    return out


def fetch_video(vid):
    html = get(f"https://www.youtube.com/watch?v={vid}&bpctr=9999999999&has_verified=1")
    pr = extract_json_after(html, "ytInitialPlayerResponse")
    if not pr or "videoDetails" not in pr:
        raise RuntimeError("no ytInitialPlayerResponse in watch page")
    vd = pr["videoDetails"]
    meta = {
        "id": vid,
        "title": vd.get("title"),
        "duration": int(vd.get("lengthSeconds") or 0),
        "description": vd.get("shortDescription", ""),
        "chapters": parse_chapters(vd.get("shortDescription", "")),
        "transcript": [],
    }
    tracks = (pr.get("captions", {})
                .get("playerCaptionsTracklistRenderer", {})
                .get("captionTracks", []))
    track = next((t for t in tracks if t.get("languageCode", "").startswith("en")),
                 tracks[0] if tracks else None)
    if track:
        url = track["baseUrl"].replace("&fmt=srv3", "")
        sep = "&" if "?" in url else "?"
        try:
            meta["transcript"] = parse_transcript(get(f"{url}{sep}fmt=json3"))
        except Exception as e:  # noqa: BLE001 - transcript is best-effort
            meta["transcript_error"] = str(e)
    return meta


def main():
    OUT_DIR.mkdir(exist_ok=True)
    ids = [l.strip() for l in (HERE / "yt_fetch_ids.txt").read_text().splitlines() if l.strip()]
    failures = []
    for vid in ids:
        try:
            meta = fetch_video(vid)
        except Exception as e:  # noqa: BLE001 - record and continue
            print(f"FAIL {vid}: {e}")
            failures.append(vid)
        else:
            (OUT_DIR / f"{vid}.meta.json").write_text(
                json.dumps(meta, indent=1, ensure_ascii=False))
            print(f"ok   {vid}: {meta['title']!r} "
                  f"chapters={len(meta['chapters'])} transcript={len(meta['transcript'])}")
        time.sleep(1.5)
    (OUT_DIR / "_failures.txt").write_text("\n".join(failures) + ("\n" if failures else ""))
    print(f"done: {len(ids) - len(failures)}/{len(ids)} ok")
    sys.exit(1 if len(failures) == len(ids) else 0)


if __name__ == "__main__":
    main()
