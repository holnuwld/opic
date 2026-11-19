# OPIc Study & Practice Web App

모바일·PC에서 오픽(OPIc) 스크립트 학습, 문장별 TTS 청취, 빈출 문장 반복 암기, 서베이 모의 선택을 한 번에 연습할 수 있는 정적 웹 앱 및 개발 도구 저장소입니다.

## 주요 웹 페이지

| 파일 | 설명 |
| :--- | :--- |
| [index.html](index.html) / [opic_study.html](opic_study.html) | 40개 문항 스터디 페이지 (키워드 넛지, 문장 1회/연속 재생, 더블터치 팝업 닫기, 통합 검색, 별표 필터, 편집 저장) |
| [memorize.html](memorize.html) | 선택주제 + 별표 4개 이상 후보 스크립트에서 선별한 빈출 120문장 반복 암기 페이지 (`en-US-AvaNeural` MP3) |
| [survey.html](survey.html) | Background Survey 정답 기준 모의 체크 테스트 페이지 |

## 디렉터리 구조

```text
c:\cowork\opic\
├── index.html                  # 웹 앱 진입점 (opic_study.html 동일 미러)
├── opic_study.html             # 메인 스터디 앱
├── memorize.html               # 빈출 문장 암기 앱
├── survey.html                 # 서베이 모의 테스트 앱
├── tts/                        # 웹 앱 런타임용 MP3 (Q/A 80개 + mem/m001~m120.mp3)
├── opic_script/                # 번호순 정리 스크립트 & TTS 배포본
│   ├── opic_script.md          # #01 ~ #40 통합 마크다운 스크립트
│   └── tts/                    # XX_Q_*.mp3 / XX_A_*.mp3 (80개) + mem/m001~m120.mp3 (120개)
└── dev/                        # 개발·빌드·검증 자료 모음
    ├── tts_tools/              # edge-tts 기반 MP3 생성 & Whisper 대조 검증 Python 도구 (uv)
    ├── scripts/                # HTML -> opic_script/ 및 timings.json 내보내기 스크립트
    ├── tests/                  # Node.js 자동 검증 스위트 (verify_opic.mjs) & timings.json
    ├── source_docs/            # 초기 원문·전략 마크다운 참고 자료
    └── raw_assets/             # 초기 녹음(.m4a) 및 서베이 캡처 이미지(.jpg) 원본
```

## 개발 및 배포 워크플로

### 1. 통합 스크립트·번호별 TTS 내보내기
`opic_study.html` 수정 후 아래 명령으로 `opic_script/opic_script.md`, `opic_script/tts/`, `dev/tests/timings.json`을 한 번에 동기화합니다.

```powershell
node dev/scripts/export_opic_script.mjs
```

### 2. 전체 동작 & 정합성 검증
```powershell
node dev/tests/verify_opic.mjs
```

### 3. TTS 음성 파일 재생성 (`dev/tts_tools/`)
```powershell
cd dev/tts_tools
uv run python batch_from_html.py
uv run python generate_mem_and_timings.py
uv run python verify_tts.py
```
