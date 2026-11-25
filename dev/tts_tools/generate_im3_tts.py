"""Generate 40 IM3 answer MP3 files and SentenceBoundary timings."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import edge_tts

from tts import DEFAULT_VOICE, synthesize

REPO_ROOT = Path(__file__).resolve().parents[2]
JOBS_PATH = REPO_ROOT / "dev" / "tests" / "im3_tts_jobs.json"
OUT_DIR = REPO_ROOT / "tts" / "im3"
TIMINGS_OUT = REPO_ROOT / "dev" / "tests" / "timings_im3.json"
CONCURRENCY = 6


async def fetch_offsets(text: str) -> list[float]:
    cleaned = " ".join(text.split())
    comm = edge_tts.Communicate(cleaned, voice=DEFAULT_VOICE)
    offsets: list[float] = []
    async for chunk in comm.stream():
        if chunk["type"] == "SentenceBoundary":
            offsets.append(round(chunk["offset"] / 1e7, 2))
    return offsets


async def main() -> None:
    jobs = json.loads(JOBS_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    timings: dict[str, list[float]] = {}

    async def process(job: dict) -> None:
        item_id = int(job["id"])
        out_path = OUT_DIR / job["filename"]
        text = job["aEnPlain"]
        async with sem:
            if not out_path.exists() or out_path.stat().st_size < 1000:
                await synthesize(text=text, output_path=out_path, voice=DEFAULT_VOICE)
            offsets = await fetch_offsets(text)
            timings[f"{item_id}_A"] = offsets
            print(f"[IM3] #{item_id:02d} -> {job['filename']} (sents={job['sentenceCount']}, boundaries={len(offsets)})")

    await asyncio.gather(*(process(j) for j in jobs))
    sorted_timings = {k: timings[k] for k in sorted(timings, key=lambda s: int(s.split("_")[0]))}
    TIMINGS_OUT.write_text(json.dumps(sorted_timings, ensure_ascii=False), encoding="utf-8")
    print(f"Done: {len(jobs)} IM3 MP3s in {OUT_DIR}, timings saved to {TIMINGS_OUT}")


if __name__ == "__main__":
    asyncio.run(main())
