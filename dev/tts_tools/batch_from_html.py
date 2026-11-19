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
    """Extract (id, title, qEn, aEnPlain) tuples from opic_study.html."""
    html = html_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*id:\s*(\d+),.*?title:\s*"((?:[^"\\]|\\.)*)".*?'
        r'qEn:\s*"((?:[^"\\]|\\.)*)".*?'
        r'aEnPlain:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.S,
    )
    results: list[tuple[int, str, str, str]] = []
    for raw_id, raw_title, raw_q, raw_a in pattern.findall(html):
        results.append(
            (
                int(raw_id),
                unescape_js_string(raw_title),
                unescape_js_string(raw_q),
                unescape_js_string(raw_a),
            )
        )
    return results


async def main() -> None:
    """Synthesize extracted Q & A scripts with bounded concurrency."""
    parser = argparse.ArgumentParser(description="Generate Q&A MP3 files from opic_study.html")
    parser.add_argument("--force", action="store_true", help="Regenerate existing MP3 files too")
    args = parser.parse_args()

    scripts = extract_scripts(HTML_PATH)
    if len(scripts) < 40:
        raise RuntimeError(f"Expected >= 40 scripts in OPIC_DATA, extracted {len(scripts)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs: list[tuple[int, str, str, Path]] = []
    expected_names: set[str] = set()

    for script_id, title, q_text, a_text in scripts:
        safe_title = sanitize_filename(title)
        q_name = f"{script_id:02d}_Q_{safe_title}.mp3"
        a_name = f"{script_id:02d}_{safe_title}.mp3"
        expected_names.add(q_name)
        expected_names.add(a_name)
        for part, text, name in (("Q", q_text, q_name), ("A", a_text, a_name)):
            out_path = OUT_DIR / name
            if args.force or not out_path.exists():
                jobs.append((script_id, part, text, out_path))

    for existing in OUT_DIR.glob("*.mp3"):
        if existing.name not in expected_names:
            existing.unlink()

    if not jobs:
        print(f"All {len(expected_names)} MP3 files already exist in {OUT_DIR}")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    total = len(jobs)

    async def process(idx: int, job: tuple[int, str, str, Path]) -> None:
        script_id, part, text, out_path = job
        async with sem:
            await synthesize(text=text, output_path=out_path, voice=DEFAULT_VOICE)
            print(f"[{idx:02d}/{total}] #{script_id:02d} {part} -> {out_path.name}")

    await asyncio.gather(*(process(i + 1, job) for i, job in enumerate(jobs)))
    print(f"Done: {total} new/updated MP3 files saved to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
