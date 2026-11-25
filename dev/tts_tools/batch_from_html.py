"""Batch-convert all Q & A scripts in opic_study.html to MP3 using edge-tts."""

from __future__ import annotations

import argparse
import asyncio
import re
from pathlib import Path

from tts import DEFAULT_VOICE, synthesize

REPO_ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = REPO_ROOT / "opic_study.html"
OUT_DIR = REPO_ROOT / "tts"
IM_OUT_DIR = OUT_DIR / "im"
CONCURRENCY = 5


def sanitize_filename(name: str) -> str:
    """Replace characters invalid in Windows filenames."""
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", name).strip()
    return re.sub(r"\s+", "_", cleaned)


def unescape_js_string(raw: str) -> str:
    """Decode standard JavaScript double-quoted string escapes safely for UTF-8."""
    escape_map = {
        '"': '"',
        "'": "'",
        "\\": "\\",
        "n": "\n",
        "r": "\r",
        "t": "\t",
    }
    return re.sub(r"\\(.)", lambda m: escape_map.get(m.group(1), m.group(1)), raw)


def extract_scripts(html_path: Path) -> list[tuple[int, str, str, str]]:
    """Extract AL (id, title, qEn, aEnPlain) tuples from opic_study.html."""
    html = html_path.read_text(encoding="utf-8")
    data_section = html.split("const IM_ANSWERS =", 1)[0]
    pattern = re.compile(
        r'\{\s*id:\s*(\d+),.*?title:\s*"((?:[^"\\]|\\.)*)".*?'
        r'qEn:\s*"((?:[^"\\]|\\.)*)".*?'
        r'aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.S,
    )
    results: list[tuple[int, str, str, str]] = []
    for raw_id, raw_title, raw_q, raw_a in pattern.findall(data_section):
        results.append(
            (
                int(raw_id),
                unescape_js_string(raw_title),
                unescape_js_string(raw_q),
                unescape_js_string(raw_a),
            )
        )
    return results


def extract_im_answers(html_path: Path, titles_by_id: dict[int, str]) -> list[tuple[int, str, str]]:
    """Extract IM (id, title, aEnPlain) tuples from IM_ANSWERS in opic_study.html."""
    html = html_path.read_text(encoding="utf-8")
    if "const IM_ANSWERS =" not in html:
        return []
    im_section = html.split("const IM_ANSWERS =", 1)[1].split("const OPIC_DATA_AL =", 1)[0]
    pattern = re.compile(
        r'(\d+):\s*\{\s*aKeywords:.*?aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.S,
    )
    results: list[tuple[int, str, str]] = []
    for raw_id, raw_a in pattern.findall(im_section):
        item_id = int(raw_id)
        title = titles_by_id.get(item_id, f"item_{item_id}")
        results.append((item_id, title, unescape_js_string(raw_a)))
    return results


async def main() -> None:
    """Synthesize extracted Q & A scripts (AL + IM) with bounded concurrency."""
    parser = argparse.ArgumentParser(description="Generate Q&A MP3 files from opic_study.html")
    parser.add_argument("--force", action="store_true", help="Regenerate existing MP3 files too")
    parser.add_argument("--level", choices=["all", "al", "im"], default="all", help="Which level to generate")
    args = parser.parse_args()

    scripts = extract_scripts(HTML_PATH)
    if len(scripts) < 40:
        raise RuntimeError(f"Expected >= 40 scripts in OPIC_DATA, extracted {len(scripts)}")

    titles_by_id = {script_id: title for script_id, title, _, _ in scripts}
    im_answers = extract_im_answers(HTML_PATH, titles_by_id)
    if args.level in ("all", "im") and len(im_answers) < 40:
        raise RuntimeError(f"Expected >= 40 IM answers in IM_ANSWERS, extracted {len(im_answers)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs: list[tuple[str, int, str, str, Path]] = []
    expected_al_names: set[str] = set()
    expected_im_names: set[str] = set()

    if args.level in ("all", "al"):
        for script_id, title, q_text, a_text in scripts:
            safe_title = sanitize_filename(title)
            q_name = f"{script_id:02d}_Q_{safe_title}.mp3"
            a_name = f"{script_id:02d}_{safe_title}.mp3"
            expected_al_names.add(q_name)
            expected_al_names.add(a_name)
            for part, text, name in (("Q", q_text, q_name), ("A", a_text, a_name)):
                out_path = OUT_DIR / name
                if args.force or not out_path.exists():
                    jobs.append(("AL", script_id, part, text, out_path))

        for existing in OUT_DIR.glob("*.mp3"):
            if existing.name not in expected_al_names:
                existing.unlink()

    if args.level in ("all", "im"):
        IM_OUT_DIR.mkdir(parents=True, exist_ok=True)
        for script_id, title, a_text in im_answers:
            safe_title = sanitize_filename(title)
            a_name = f"{script_id:02d}_{safe_title}.mp3"
            expected_im_names.add(a_name)
            out_path = IM_OUT_DIR / a_name
            if args.force or not out_path.exists():
                jobs.append(("IM", script_id, "A", a_text, out_path))

        for existing in IM_OUT_DIR.glob("*.mp3"):
            if existing.name not in expected_im_names:
                existing.unlink()

    if not jobs:
        print(f"All requested MP3 files already exist (AL={len(expected_al_names)}, IM={len(expected_im_names)})")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    total = len(jobs)

    async def process(idx: int, job: tuple[str, int, str, str, Path]) -> None:
        lvl, script_id, part, text, out_path = job
        async with sem:
            await synthesize(text=text, output_path=out_path, voice=DEFAULT_VOICE)
            print(f"[{idx:02d}/{total}] [{lvl}] #{script_id:02d} {part} -> {out_path.name}")

    await asyncio.gather(*(process(i + 1, job) for i, job in enumerate(jobs)))
    print(f"Done: {total} new/updated MP3 files saved")


if __name__ == "__main__":
    asyncio.run(main())
