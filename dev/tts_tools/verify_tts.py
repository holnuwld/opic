"""Verify TTS MP3 files in c:\\cowork\\opic\\tts against scripts in opic_study.html."""

from __future__ import annotations

import difflib
import re
from pathlib import Path

import av
import numpy as np
from faster_whisper import WhisperModel


def load_audio_16k(path: Path) -> np.ndarray:
    """Decode audio file to 16kHz mono float32 numpy array using PyAV."""
    resampler = av.AudioResampler(format="flt", layout="mono", rate=16000)
    chunks: list[np.ndarray] = []
    with av.open(str(path)) as container:
        for frame in container.decode(audio=0):
            for out_frame in resampler.resample(frame):
                chunks.append(out_frame.to_ndarray().reshape(-1))
    for out_frame in resampler.resample(None):
        chunks.append(out_frame.to_ndarray().reshape(-1))
    return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)

REPO_ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = REPO_ROOT / "opic_study.html"
TTS_DIR = REPO_ROOT / "tts"
REPORT_PATH = Path(__file__).resolve().parent / "output" / "verify_report.txt"


def normalize(text: str) -> list[str]:
    """Normalize English text to lowercase word tokens for comparison."""
    text = text.lower()
    text = text.replace("’", "'").replace("—", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9'\s]", " ", text)
    return text.split()


def extract_html_scripts(html_path: Path) -> dict[int, dict[str, str]]:
    """Extract {id: {title, qEn, aEnPlain}} from opic_study.html."""
    text = html_path.read_text(encoding="utf-8")
    blocks = re.split(r"\n\s*\{\s*\n\s*id:\s*(\d+),", text)
    items: dict[int, dict[str, str]] = {}
    for idx in range(1, len(blocks), 2):
        item_id = int(blocks[idx])
        body = blocks[idx + 1]
        title_m = re.search(r'title:\s*"((?:[^"\\]|\\.)*)"', body)
        q_m = re.search(r'qEn:\s*"((?:[^"\\]|\\.)*)"', body)
        a_m = re.search(r'aEnPlain:\s*"((?:[^"\\]|\\.)*)"', body)
        items[item_id] = {
            "title": title_m.group(1) if title_m else "",
            "qEn": q_m.group(1).replace('\\"', '"') if q_m else "",
            "aEnPlain": a_m.group(1).replace('\\"', '"') if a_m else "",
        }
    return items


def word_diff_summary(expected: str, actual: str) -> str:
    """Return a concise word-level diff summary."""
    exp_w = normalize(expected)
    act_w = normalize(actual)
    sm = difflib.SequenceMatcher(None, exp_w, act_w)
    diffs: list[str] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        exp_seg = " ".join(exp_w[i1:i2])
        act_seg = " ".join(act_w[j1:j2])
        diffs.append(f"[{tag}: script='{exp_seg}' vs tts='{act_seg}']")
    return " | ".join(diffs)


def main() -> None:
    """Transcribe all Q and A MP3s and compare against opic_study.html."""
    items = extract_html_scripts(HTML_PATH)
    mp3s = sorted(TTS_DIR.glob("*.mp3"))
    model = WhisperModel("base.en", device="cpu", compute_type="int8")

    lines: list[str] = []
    flagged: list[str] = []

    for mp3 in mp3s:
        m = re.match(r"^(\d+)_(Q_)?(.+)\.mp3$", mp3.name)
        if not m:
            continue
        item_id = int(m.group(1))
        is_q = bool(m.group(2))
        item = items.get(item_id)
        if not item:
            flagged.append(f"{mp3.name}: NO MATCHING ID {item_id} in opic_study.html")
            continue

        expected = item["qEn"] if is_q else item["aEnPlain"]
        audio = load_audio_16k(mp3)
        segments, _ = model.transcribe(audio, beam_size=1, language="en")
        actual = " ".join(seg.text.strip() for seg in segments)

        exp_w = normalize(expected)
        act_w = normalize(actual)
        ratio = difflib.SequenceMatcher(None, exp_w, act_w).ratio()
        diff_str = word_diff_summary(expected, actual)

        kind = "Q" if is_q else "A"
        status = "OK" if ratio >= 0.94 else "DIFF"
        line = f"[{status}] {item_id:02d} ({kind}) ratio={ratio:.3f} | {mp3.name}"
        lines.append(line)
        if diff_str:
            lines.append(f"       {diff_str}")
        if ratio < 0.94:
            flagged.append(f"{line}\n       {diff_str}")
        print(line, flush=True)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nDone. Total={len(lines)}, Flagged(ratio<0.94)={len(flagged)}")
    print(f"Report saved to {REPORT_PATH}")


if __name__ == "__main__":
    main()
