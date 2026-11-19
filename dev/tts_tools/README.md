# OPIc TTS (`edge-tts`)

오픽(OPIc) 스크립트를 `edge-tts` (`en-US-AvaNeural` 기본값)로 MP3 음성 파일로 변환하는 프로젝트입니다.

## 1. 직접 `edge-tts` 명령어 사용하기

```powershell
cd c:\cowork\opic_tts
uv run edge-tts --voice en-US-AvaNeural --text "위 스크립트 내용" --write-media output\opic_home.mp3
```

## 2. `tts.py`로 스크립트 / 파일 / 폴더 일괄 변환하기

긴 스크립트나 줄바꿈이 포함된 스크립트는 텍스트 파일(`.txt`)로 저장해 변환하는 것을 권장합니다.

```powershell
cd c:\cowork\opic_tts

# 1) 텍스트 직접 입력
uv run python tts.py --text "My home is a cozy apartment in Seoul." --output output\opic_home.mp3

# 2) .txt 파일 변환 (output\<파일명>.mp3 자동 생성)
uv run python tts.py scripts\opic_home.txt

# 3) 속도 조절(-10%) 및 자막(.srt) 함께 생성
uv run python tts.py scripts\opic_home.txt --rate -10% --subtitles

# 4) 폴더 내 모든 .txt 파일 일괄 변환
uv run python tts.py scripts\
```

## 주요 옵션

| 옵션 | 설명 | 기본값 |
| --- | --- | --- |
| `-t`, `--text` | 변환할 영어 스크립트 문자열 | - |
| `-f`, `--file` | `.txt` 파일 또는 폴더 경로 (위치 인자로도 전달 가능) | - |
| `-o`, `--output`, `--write-media` | 출력 MP3 경로 | `output\<이름>.mp3` |
| `-v`, `--voice` | Edge TTS 음성 모델 | `en-US-AvaNeural` |
| `-r`, `--rate` | 말하기 속도 (예: `-10%`, `+10%`) | `+0%` |
| `-p`, `--pitch` | 음높이 (예: `-5Hz`, `+5Hz`) | `+0Hz` |
| `-s`, `--subtitles` | `.srt` 자막 파일 함께 생성 | 꺼짐 |
