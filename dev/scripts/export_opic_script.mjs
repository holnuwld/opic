import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const HTML_PATH = path.join(REPO_ROOT, "opic_study.html");
const SRC_TTS_DIR = path.join(REPO_ROOT, "tts");
const SRC_MEM_DIR = path.join(SRC_TTS_DIR, "mem");
const OUT_DIR = path.join(REPO_ROOT, "opic_script");
const OUT_MD_PATH = path.join(OUT_DIR, "opic_script.md");
const OUT_IM3_MD_PATH = path.join(OUT_DIR, "opic_script_im3.md");
const OUT_TTS_DIR = path.join(OUT_DIR, "tts");
const OUT_IM3_TTS_DIR = path.join(OUT_TTS_DIR, "im3");
const OUT_MEM_DIR = path.join(OUT_TTS_DIR, "mem");
const SRC_IM3_DIR = path.join(SRC_TTS_DIR, "im3");
const TIMINGS_PATH = path.join(REPO_ROOT, "dev", "tests", "timings.json");
const IM3_TIMINGS_PATH = path.join(REPO_ROOT, "dev", "tests", "timings_im3.json");

function makeDummyEl() {
  return {
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    dataset: {},
    style: { setProperty() {}, display: "" },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    scrollIntoView() {}
  };
}

function loadOpicData() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`Missing <script> block in ${HTML_PATH}`);
  }
  const dummy = makeDummyEl();
  const sandbox = {
    console,
    Math,
    Date,
    Set,
    Map,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Promise,
    encodeURI,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    Audio: function FakeAudio() {},
    document: {
      body: dummy,
      visibilityState: "visible",
      getElementById: () => dummy,
      querySelector: () => dummy,
      querySelectorAll: () => [],
      addEventListener() {}
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: {}
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  const scriptSrc = match[1].replace("init();", "/* export harness */");
  vm.runInContext(
    scriptSrc + "\nwindow.__export = { TABS, OPIC_DATA, SENTENCE_TIMINGS, IM3_DATA_MAP, IM3_TIMINGS, sanitizeAudioFilename, stripHtmlToPlain, getStepLabel };",
    ctx
  );
  return sandbox.__export;
}

function formatStars(count) {
  const n = Number(count || 0);
  return n > 0 ? `${"★".repeat(n)} (${n}개)` : "없음";
}

function main() {
  const { TABS, OPIC_DATA, SENTENCE_TIMINGS, IM3_DATA_MAP, IM3_TIMINGS, sanitizeAudioFilename, stripHtmlToPlain, getStepLabel } = loadOpicData();
  const tabLabelMap = Object.fromEntries(TABS.map(t => [t.id, t.label]));

  fs.mkdirSync(OUT_MEM_DIR, { recursive: true });
  fs.mkdirSync(OUT_IM3_TTS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(TIMINGS_PATH), { recursive: true });

  const mdLines = [
    "# OPIc 스터디 전체 스크립트 모음 (#01 ~ #40)",
    "",
    `- **기준 파일:** [opic_study.html](../opic_study.html) (총 **${OPIC_DATA.length}개** 문항)`,
    `- **음성 파일:** Q/A 번호별 파일 \`tts/01_Q_*.mp3\` ~ \`tts/40_A_*.mp3\` (${OPIC_DATA.length * 2}개) + 빈출 암기 120문장 \`tts/mem/m001.mp3\` ~ \`tts/mem/m120.mp3\``,
    "",
    "## 목차 (Index)",
    "",
    "| 번호 | 카테고리 | 유형 | 별표 | 제목 | Q TTS | A TTS |",
    "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
  ];

  const expectedQaNames = new Set();
  const expectedMemNames = new Set();

  for (const item of OPIC_DATA) {
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const starLabel = item.stars > 0 ? `${"★".repeat(item.stars)}` : "-";

    const srcQName = `${numStr}_Q_${safeTitle}.mp3`;
    const srcAName = `${numStr}_${safeTitle}.mp3`;
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const outAName = `${numStr}_A_${safeTitle}.mp3`;

    expectedQaNames.add(outQName);
    expectedQaNames.add(outAName);

    const srcQPath = path.join(SRC_TTS_DIR, srcQName);
    const srcAPath = path.join(SRC_TTS_DIR, srcAName);
    if (!fs.existsSync(srcQPath)) throw new Error(`Missing source Q MP3: ${srcQPath}`);
    if (!fs.existsSync(srcAPath)) throw new Error(`Missing source A MP3: ${srcAPath}`);

    fs.copyFileSync(srcQPath, path.join(OUT_TTS_DIR, outQName));
    fs.copyFileSync(srcAPath, path.join(OUT_TTS_DIR, outAName));

    mdLines.push(
      `| #${numStr} | ${catLabel} | ${item.badge} | ${starLabel} | [#${numStr} ${item.title}](#${numStr}-${item.title.replace(/[^\w\uAC00-\uD7A3-]+/g, "-").replace(/^-|-$/g, "")}) | [${outQName}](tts/${encodeURIComponent(outQName)}) | [${outAName}](tts/${encodeURIComponent(outAName)}) |`
    );
  }

  // Clean stale Q/A MP3 files in opic_script/tts/
  for (const entry of fs.readdirSync(OUT_TTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mp3") && !expectedQaNames.has(entry.name)) {
      fs.unlinkSync(path.join(OUT_TTS_DIR, entry.name));
    }
  }

  // Copy 120 memorize sentence MP3s
  for (let r = 1; r <= 120; r++) {
    const fname = `m${String(r).padStart(3, "0")}.mp3`;
    expectedMemNames.add(fname);
    const srcMem = path.join(SRC_MEM_DIR, fname);
    if (!fs.existsSync(srcMem)) throw new Error(`Missing source memorize MP3: ${srcMem}`);
    fs.copyFileSync(srcMem, path.join(OUT_MEM_DIR, fname));
  }
  for (const entry of fs.readdirSync(OUT_MEM_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mp3") && !expectedMemNames.has(entry.name)) {
      fs.unlinkSync(path.join(OUT_MEM_DIR, entry.name));
    }
  }

  mdLines.push("");

  for (const item of OPIC_DATA) {
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const outAName = `${numStr}_A_${safeTitle}.mp3`;

    mdLines.push(
      "---",
      "",
      `## #${numStr}. ${item.title}`,
      "",
      `- **카테고리:** ${catLabel} | **유형:** ${item.badge} | **중요도:** ${formatStars(item.stars)}`,
      `- **TTS 파일:** [Q: ${outQName}](tts/${encodeURIComponent(outQName)}) · [A: ${outAName}](tts/${encodeURIComponent(outAName)})`,
      "",
      "### Question (Q)",
      `- **키워드:** ${item.qKeywords}`,
      `- **영문:** ${item.qEn}`,
      `- **한국어 번역:** ${item.qKo}`,
      "",
      "### Answer (A)",
      `- **키워드:** ${item.aKeywords}`,
      ""
    );

    for (const sec of item.aSections) {
      mdLines.push(
        `#### ${sec.step} (${getStepLabel(sec.step)}) — ${sec.summary}`,
        `${stripHtmlToPlain(sec.enHtml)}`,
        "",
        `> ${sec.ko}`,
        ""
      );
    }

    mdLines.push(
      "#### 전체 영문 스크립트 (복사/TTS용)",
      "```text",
      item.aEnPlain,
      "```",
      ""
    );
  }

  fs.writeFileSync(OUT_MD_PATH, mdLines.join("\n"), "utf8");
  fs.writeFileSync(TIMINGS_PATH, JSON.stringify(SENTENCE_TIMINGS), "utf8");

  // Export IM3 script collection & IM3 MP3s
  const im3Lines = [
    "# OPIc 스터디 IM3 버전 스크립트 모음 (#01 ~ #40)",
    "",
    `- **기준 파일:** [opic_study.html](../opic_study.html) (🌱 **IM3 난이도** · 총 **${OPIC_DATA.length}개** 문항)`,
    `- **특징:** AL 버전과 동일한 내용·스토리·인물(` + "`Sam` / `wife` / `younger sister` / `Jake` / `Lia`" + `)을 유지하되, 짧고 쉬운 문장(~80단어)과 일상 표현으로 재구성`,
    `- **음성 파일:** 질문 \`tts/XX_Q_*.mp3\` + IM3 답변 \`tts/im3/XX_A_*.mp3\``,
    "",
    "## 목차 (Index)",
    "",
    "| 번호 | 카테고리 | 유형 | 별표 | 제목 | Q TTS | IM3 A TTS |",
    "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
  ];

  const expectedIm3Names = new Set();
  for (const item of OPIC_DATA) {
    const im3 = IM3_DATA_MAP[item.id];
    if (!im3) throw new Error(`Missing IM3_DATA_MAP entry for #${item.id}`);
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const starLabel = item.stars > 0 ? `${"★".repeat(item.stars)}` : "-";
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const outIm3Name = `${numStr}_A_${safeTitle}.mp3`;
    expectedIm3Names.add(outIm3Name);

    const srcIm3Path = path.join(SRC_IM3_DIR, outIm3Name);
    if (!fs.existsSync(srcIm3Path)) throw new Error(`Missing source IM3 MP3: ${srcIm3Path}`);
    fs.copyFileSync(srcIm3Path, path.join(OUT_IM3_TTS_DIR, outIm3Name));

    im3Lines.push(
      `| #${numStr} | ${catLabel} | ${item.badge} | ${starLabel} | [#${numStr} ${item.title}](#${numStr}-${item.title.replace(/[^\w\uAC00-\uD7A3-]+/g, "-").replace(/^-|-$/g, "")}) | [${outQName}](tts/${encodeURIComponent(outQName)}) | [${outIm3Name}](tts/im3/${encodeURIComponent(outIm3Name)}) |`
    );
  }

  for (const entry of fs.readdirSync(OUT_IM3_TTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mp3") && !expectedIm3Names.has(entry.name)) {
      fs.unlinkSync(path.join(OUT_IM3_TTS_DIR, entry.name));
    }
  }

  im3Lines.push("");
  for (const item of OPIC_DATA) {
    const im3 = IM3_DATA_MAP[item.id];
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const outIm3Name = `${numStr}_A_${safeTitle}.mp3`;

    im3Lines.push(
      "---",
      "",
      `## #${numStr}. ${item.title}`,
      "",
      `- **난이도:** 🌱 **IM3** | **카테고리:** ${catLabel} | **유형:** ${item.badge} | **중요도:** ${formatStars(item.stars)}`,
      `- **TTS 파일:** [Q: ${outQName}](tts/${encodeURIComponent(outQName)}) · [IM3 A: ${outIm3Name}](tts/im3/${encodeURIComponent(outIm3Name)})`,
      "",
      "### Question (Q)",
      `- **키워드:** ${item.qKeywords}`,
      `- **영문:** ${item.qEn}`,
      `- **한국어 번역:** ${item.qKo}`,
      "",
      "### Answer (IM3)",
      `- **키워드:** ${im3.aKeywords}`,
      ""
    );

    for (const sec of im3.aSections) {
      im3Lines.push(
        `#### ${sec.step} (${getStepLabel(sec.step)}) — ${sec.summary}`,
        `${stripHtmlToPlain(sec.enHtml)}`,
        "",
        `> ${sec.ko}`,
        ""
      );
    }

    im3Lines.push(
      "#### 전체 영문 스크립트 (복사/TTS용)",
      "```text",
      im3.aEnPlain,
      "```",
      ""
    );
  }

  fs.writeFileSync(OUT_IM3_MD_PATH, im3Lines.join("\n"), "utf8");
  fs.writeFileSync(IM3_TIMINGS_PATH, JSON.stringify(IM3_TIMINGS), "utf8");

  console.log(`Exported ${OPIC_DATA.length} numbered scripts to ${OUT_MD_PATH}`);
  console.log(`Exported ${OPIC_DATA.length} IM3 scripts to ${OUT_IM3_MD_PATH}`);
  console.log(`Copied ${expectedQaNames.size} numbered Q/A MP3s to ${OUT_TTS_DIR}`);
  console.log(`Copied ${expectedIm3Names.size} IM3 A MP3s to ${OUT_IM3_TTS_DIR}`);
  console.log(`Copied ${expectedMemNames.size} memorize MP3s to ${OUT_MEM_DIR}`);
  console.log(`Exported ${Object.keys(SENTENCE_TIMINGS).length} AL timing entries to ${TIMINGS_PATH}`);
  console.log(`Exported ${Object.keys(IM3_TIMINGS).length} IM3 timing entries to ${IM3_TIMINGS_PATH}`);
}

main();
