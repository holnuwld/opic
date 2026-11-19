"""Generate 120 per-sentence MP3s for memorize.html and extract SentenceBoundary timings for opic_study.html."""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import edge_tts

from tts import DEFAULT_VOICE, synthesize

REPO_ROOT = Path(__file__).resolve().parents[2]
MEM_HTML = REPO_ROOT / "memorize.html"
STUDY_HTML = REPO_ROOT / "opic_study.html"
MEM_OUT_DIR = REPO_ROOT / "tts" / "mem"
TIMINGS_OUT = REPO_ROOT / "dev" / "tests" / "timings.json"
CONCURRENCY = 8


def unescape_js_string(raw: str) -> str:
    escape_map = {'"': '"', "'": "'", "\\": "\\", "n": "\n", "r": "\r", "t": "\t"}
    return re.sub(r"\\(.)", lambda m: escape_map.get(m.group(1), m.group(1)), raw)


def extract_memorize_sentences(html_path: Path) -> list[tuple[int, str]]:
    text = html_path.read_text(encoding="utf-8")
    pattern = re.compile(r'\{\s*rank:\s*(\d+),.*?en:\s*"((?:[^"\\]|\\.)*)"\s*,\s*ko:', re.S)
    return [(int(r), unescape_js_string(en)) for r, en in pattern.findall(text)]


def extract_study_scripts(html_path: Path) -> list[tuple[int, str, str]]:
    text = html_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*id:\s*(\d+),.*?qEn:\s*"((?:[^"\\]|\\.)*)".*?aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.S,
    )
    return [(int(i), unescape_js_string(q), unescape_js_string(a)) for i, q, a in pattern.findall(text)]


async def fetch_sentence_offsets(text: str) -> list[float]:
    cleaned = " ".join(text.split())
    comm = edge_tts.Communicate(cleaned, voice=DEFAULT_VOICE)
    offsets: list[float] = []
    async for chunk in comm.stream():
        if chunk["type"] == "SentenceBoundary":
            sec = round(chunk["offset"] / 1e7, 2)
            offsets.append(sec)
    return offsets


async def main() -> None:
    mem_items = extract_memorize_sentences(MEM_HTML)
    study_items = extract_study_scripts(STUDY_HTML)
    if len(mem_items) != 120:
        raise RuntimeError(f"Expected 120 memorize items, got {len(mem_items)}")
    if len(study_items) != 40:
        raise RuntimeError(f"Expected 40 study items, got {len(study_items)}")

    MEM_OUT_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def gen_mem(rank: int, en: str) -> None:
        out_path = MEM_OUT_DIR / f"m{rank:03d}.mp3"
        if out_path.exists() and out_path.stat().st_size > 500:
            return
        async with sem:
            await synthesize(text=en, output_path=out_path, voice=DEFAULT_VOICE)
            if rank % 20 == 0 or rank == 120:
                print(f"[mem] generated up to m{rank:03d}.mp3")

    timings: dict[str, list[float]] = {}

    async def gen_timing(item_id: int, part: str, text: str) -> None:
        async with sem:
            timings[f"{item_id}_{part}"] = await fetch_sentence_offsets(text)

    tasks = [gen_mem(r, en) for r, en in mem_items]
    for item_id, q_text, a_text in study_items:
        tasks.append(gen_timing(item_id, "Q", q_text))
        tasks.append(gen_timing(item_id, "A", a_text))

    await asyncio.gather(*tasks)

    TIMINGS_OUT.parent.mkdir(parents=True, exist_ok=True)
    sorted_timings = {k: timings[k] for k in sorted(timings, key=lambda s: (int(s.split("_")[0]), s.split("_")[1]))}
    TIMINGS_OUT.write_text(json.dumps(sorted_timings, ensure_ascii=False), encoding="utf-8")
    print(f"Done: {len(mem_items)} mem MP3s in {MEM_OUT_DIR}, timings saved to {TIMINGS_OUT}")


if __name__ == "__main__":
    asyncio.run(main())
