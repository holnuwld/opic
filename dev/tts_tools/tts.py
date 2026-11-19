"""OPIc script to MP3 TTS converter powered by edge-tts."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import edge_tts

DEFAULT_VOICE = "en-US-AvaNeural"


async def synthesize(
    text: str,
    output_path: Path,
    voice: str = DEFAULT_VOICE,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    subtitle_path: Path | None = None,
) -> None:
    """Convert text to an MP3 audio file (and optional SRT subtitles)."""
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Input text is empty.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(cleaned, voice=voice, rate=rate, pitch=pitch)

    if subtitle_path is None:
        await communicate.save(str(output_path))
        return

    subtitle_path.parent.mkdir(parents=True, exist_ok=True)
    submaker = edge_tts.SubMaker()
    with output_path.open("wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)

    subtitle_path.write_text(submaker.get_srt(), encoding="utf-8")


def resolve_output_path(
    output_arg: str | None,
    input_file: Path | None,
    default_name: str = "opic_output.mp3",
) -> Path:
    """Determine the target MP3 path from CLI arguments."""
    if output_arg:
        return Path(output_arg)
    if input_file is not None:
        return Path("output") / f"{input_file.stem}.mp3"
    return Path("output") / default_name


def build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Convert OPIc scripts to MP3 using edge-tts.",
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        help="Optional path to a .txt script file or directory of .txt files.",
    )
    parser.add_argument(
        "-t",
        "--text",
        help="Script text to synthesize directly.",
    )
    parser.add_argument(
        "-f",
        "--file",
        dest="file_path",
        help="Path to a .txt script file (UTF-8) or directory of .txt files.",
    )
    parser.add_argument(
        "-o",
        "--output",
        "--write-media",
        dest="output",
        help="Output MP3 file path (default: output/<name>.mp3).",
    )
    parser.add_argument(
        "-v",
        "--voice",
        default=DEFAULT_VOICE,
        help=f"Edge TTS voice name (default: {DEFAULT_VOICE}).",
    )
    parser.add_argument(
        "-r",
        "--rate",
        default="+0%",
        help="Speech rate adjustment, e.g. -10%% or +10%% (default: +0%%).",
    )
    parser.add_argument(
        "-p",
        "--pitch",
        default="+0Hz",
        help="Pitch adjustment, e.g. -5Hz or +5Hz (default: +0Hz).",
    )
    parser.add_argument(
        "-s",
        "--subtitles",
        action="store_true",
        help="Also generate an .srt subtitle file alongside the MP3.",
    )
    return parser


async def run_cli(args: argparse.Namespace) -> None:
    """Execute TTS synthesis based on parsed CLI arguments."""
    source_arg = args.file_path or args.input_path

    if args.text and source_arg:
        raise SystemExit("Specify either --text or a file/directory path, not both.")

    if args.text:
        out_path = resolve_output_path(args.output, None)
        srt_path = out_path.with_suffix(".srt") if args.subtitles else None
        await synthesize(
            text=args.text,
            output_path=out_path,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
            subtitle_path=srt_path,
        )
        print(f"Saved: {out_path}")
        if srt_path:
            print(f"Saved: {srt_path}")
        return

    if not source_arg:
        raise SystemExit("Provide --text \"...\" or a script file path.")

    source_path = Path(source_arg)
    if not source_path.exists():
        raise SystemExit(f"Path not found: {source_path}")

    if source_path.is_dir():
        txt_files = sorted(source_path.glob("*.txt"))
        if not txt_files:
            raise SystemExit(f"No .txt files found in: {source_path}")
        out_dir = Path(args.output) if args.output else Path("output")
        for txt_file in txt_files:
            out_path = out_dir / f"{txt_file.stem}.mp3"
            srt_path = out_path.with_suffix(".srt") if args.subtitles else None
            content = txt_file.read_text(encoding="utf-8")
            await synthesize(
                text=content,
                output_path=out_path,
                voice=args.voice,
                rate=args.rate,
                pitch=args.pitch,
                subtitle_path=srt_path,
            )
            print(f"Saved: {out_path}")
        return

    out_path = resolve_output_path(args.output, source_path)
    srt_path = out_path.with_suffix(".srt") if args.subtitles else None
    content = source_path.read_text(encoding="utf-8")
    await synthesize(
        text=content,
        output_path=out_path,
        voice=args.voice,
        rate=args.rate,
        pitch=args.pitch,
        subtitle_path=srt_path,
    )
    print(f"Saved: {out_path}")
    if srt_path:
        print(f"Saved: {srt_path}")


def main() -> None:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(run_cli(args))


if __name__ == "__main__":
    main()
