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
IM_MEM_OUT_DIR = REPO_ROOT / "tts" / "im" / "mem"
TIMINGS_OUT = REPO_ROOT / "dev" / "tests" / "timings.json"
TIMINGS_IM_OUT = REPO_ROOT / "dev" / "tests" / "timings_im.json"
CONCURRENCY = 8


def unescape_js_string(raw: str) -> str:
    escape_map = {'"': '"', "'": "'", "\\": "\\", "n": "\n", "r": "\r", "t": "\t"}
    return re.sub(r"\\(.)", lambda m: escape_map.get(m.group(1), m.group(1)), raw)


def extract_memorize_sentences(html_path: Path) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    text = html_path.read_text(encoding="utf-8")
    al_sec = text.split("const MEMORIZE_BANK_IM =", 1)[0]
    pattern = re.compile(r'\{\s*rank:\s*(\d+),.*?en:\s*"((?:[^"\\]|\\.)*)"\s*,\s*ko:', re.S)
    al_items = [(int(r), unescape_js_string(en)) for r, en in pattern.findall(al_sec)]
    im_items: list[tuple[int, str]] = []
    if "const MEMORIZE_BANK_IM =" in text:
        im_sec = text.split("const MEMORIZE_BANK_IM =", 1)[1].split("const MEMORIZE_BANK_AL =", 1)[0]
        im_items = [(int(r), unescape_js_string(en)) for r, en in pattern.findall(im_sec)]
    return al_items, im_items


def extract_study_scripts(html_path: Path) -> tuple[list[tuple[int, str, str]], list[tuple[int, str]]]:
    text = html_path.read_text(encoding="utf-8")
    al_sec = text.split("const IM_ANSWERS =", 1)[0]
    pattern = re.compile(
        r'\{\s*id:\s*(\d+),.*?qEn:\s*"((?:[^"\\]|\\.)*)".*?aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.S,
    )
    al_items = [(int(i), unescape_js_string(q), unescape_js_string(a)) for i, q, a in pattern.findall(al_sec)]
    im_items: list[tuple[int, str]] = []
    if "const IM_ANSWERS =" in text:
        im_sec = text.split("const IM_ANSWERS =", 1)[1].split("const OPIC_DATA_AL =", 1)[0]
        im_pattern = re.compile(r'(\d+):\s*\{\s*aKeywords:.*?aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}', re.S)
        im_items = [(int(i), unescape_js_string(a)) for i, a in im_pattern.findall(im_sec)]
    return al_items, im_items


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
    mem_al, mem_im = extract_memorize_sentences(MEM_HTML)
    study_al, study_im = extract_study_scripts(STUDY_HTML)
    if len(mem_al) != 120:
        raise RuntimeError(f"Expected 120 AL memorize items, got {len(mem_al)}")
    if len(mem_im) != 120:
        raise RuntimeError(f"Expected 120 IM memorize items, got {len(mem_im)}")
    if len(study_al) != 40:
        raise RuntimeError(f"Expected 40 AL study items, got {len(study_al)}")
    if len(study_im) != 40:
        raise RuntimeError(f"Expected 40 IM study items, got {len(study_im)}")

    MEM_OUT_DIR.mkdir(parents=True, exist_ok=True)
    IM_MEM_OUT_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def gen_mem(out_dir: Path, label: str, rank: int, en: str) -> None:
        out_path = out_dir / f"m{rank:03d}.mp3"
        if out_path.exists() and out_path.stat().st_size > 500:
            return
        async with sem:
            await synthesize(text=en, output_path=out_path, voice=DEFAULT_VOICE)
            if rank % 20 == 0 or rank == 120:
                print(f"[mem-{label}] generated up to m{rank:03d}.mp3")

    timings: dict[str, list[float]] = {}
    timings_im: dict[str, list[float]] = {}

    async def gen_timing(target: dict[str, list[float]], item_id: int, part: str, text: str) -> None:
        async with sem:
            target[f"{item_id}_{part}"] = await fetch_sentence_offsets(text)

    tasks = [gen_mem(MEM_OUT_DIR, "AL", r, en) for r, en in mem_al]
    tasks.extend(gen_mem(IM_MEM_OUT_DIR, "IM", r, en) for r, en in mem_im)
    for item_id, q_text, a_text in study_al:
        tasks.append(gen_timing(timings, item_id, "Q", q_text))
        tasks.append(gen_timing(timings, item_id, "A", a_text))
    for item_id, a_text in study_im:
        tasks.append(gen_timing(timings_im, item_id, "A", a_text))

    await asyncio.gather(*tasks)

    TIMINGS_OUT.parent.mkdir(parents=True, exist_ok=True)
    sorted_timings = {k: timings[k] for k in sorted(timings, key=lambda s: (int(s.split("_")[0]), s.split("_")[1]))}
    TIMINGS_OUT.write_text(json.dumps(sorted_timings, ensure_ascii=False), encoding="utf-8")

    sorted_timings_im = {k: timings_im[k] for k in sorted(timings_im, key=lambda s: (int(s.split("_")[0]), s.split("_")[1]))}
    TIMINGS_IM_OUT.write_text(json.dumps(sorted_timings_im, ensure_ascii=False), encoding="utf-8")
    print(f"Done: AL+IM mem MP3s and timings saved to {TIMINGS_OUT} and {TIMINGS_IM_OUT}")


if __name__ == "__main__":
    asyncio.run(main())
