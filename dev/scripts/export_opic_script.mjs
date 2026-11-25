import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const HTML_PATH = path.join(REPO_ROOT, "opic_study.html");
const SRC_TTS_DIR = path.join(REPO_ROOT, "tts");
const SRC_MEM_DIR = path.join(SRC_TTS_DIR, "mem");
const OUT_DIR = path.join(REPO_ROOT, "opic_script");
const OUT_MD_PATH = path.join(OUT_DIR, "opic_script.md");
const OUT_IM_MD_PATH = path.join(OUT_DIR, "opic_script_im.md");
const OUT_TTS_DIR = path.join(OUT_DIR, "tts");
const OUT_MEM_DIR = path.join(OUT_TTS_DIR, "mem");
const SRC_IM_TTS_DIR = path.join(SRC_TTS_DIR, "im");
const SRC_IM_MEM_DIR = path.join(SRC_IM_TTS_DIR, "mem");
const OUT_IM_TTS_DIR = path.join(OUT_TTS_DIR, "im");
const OUT_IM_MEM_DIR = path.join(OUT_IM_TTS_DIR, "mem");
const TIMINGS_PATH = path.join(REPO_ROOT, "dev", "tests", "timings.json");
const TIMINGS_IM_PATH = path.join(REPO_ROOT, "dev", "tests", "timings_im.json");

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
    scriptSrc + "\nwindow.__export = { TABS, OPIC_DATA, OPIC_DATA_AL, OPIC_DATA_IM, SENTENCE_TIMINGS, SENTENCE_TIMINGS_IM, sanitizeAudioFilename, stripHtmlToPlain, getStepLabel };",
    ctx
  );
  return sandbox.__export;
}

function formatStars(count) {
  const n = Number(count || 0);
  return n > 0 ? `${"★".repeat(n)} (${n}개)` : "없음";
}

function main() {
  const { TABS, OPIC_DATA_AL, OPIC_DATA_IM, SENTENCE_TIMINGS, SENTENCE_TIMINGS_IM, sanitizeAudioFilename, stripHtmlToPlain, getStepLabel } = loadOpicData();
  const OPIC_DATA = OPIC_DATA_AL;
  const tabLabelMap = Object.fromEntries(TABS.map(t => [t.id, t.label]));

  fs.mkdirSync(OUT_MEM_DIR, { recursive: true });
  fs.mkdirSync(OUT_IM_MEM_DIR, { recursive: true });
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

  // Export IM markdown & IM TTS copies
  const imMdLines = [
    "# OPIc 스터디 IM(쉬운 버전) 전체 스크립트 모음 (#01 ~ #40)",
    "",
    `- **기준 파일:** [opic_study.html](../opic_study.html) (IM 난이도, 총 **${OPIC_DATA_IM.length}개** 문항)`,
    `- **음성 파일:** Q \`tts/01_Q_*.mp3\` + IM A \`tts/im/01_A_*.mp3\` ~ \`tts/im/40_A_*.mp3\` + IM 암기 120문장 \`tts/im/mem/m001.mp3\` ~ \`tts/im/mem/m120.mp3\``,
    "",
    "## 목차 (Index)",
    "",
    "| 번호 | 카테고리 | 유형 | 별표 | 제목 | Q TTS | IM A TTS |",
    "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
  ];

  const expectedImNames = new Set();
  const expectedImMemNames = new Set();

  for (const item of OPIC_DATA_IM) {
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const starLabel = item.stars > 0 ? `${"★".repeat(item.stars)}` : "-";
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const srcImAName = `${numStr}_${safeTitle}.mp3`;
    const outImAName = `${numStr}_A_${safeTitle}.mp3`;
    expectedImNames.add(outImAName);

    const srcImAPath = path.join(SRC_IM_TTS_DIR, srcImAName);
    if (!fs.existsSync(srcImAPath)) throw new Error(`Missing source IM A MP3: ${srcImAPath}`);
    fs.copyFileSync(srcImAPath, path.join(OUT_IM_TTS_DIR, outImAName));

    imMdLines.push(
      `| #${numStr} | ${catLabel} | ${item.badge} | ${starLabel} | [#${numStr} ${item.title}](#${numStr}-${item.title.replace(/[^\w\uAC00-\uD7A3-]+/g, "-").replace(/^-|-$/g, "")}) | [${outQName}](tts/${encodeURIComponent(outQName)}) | [${outImAName}](tts/im/${encodeURIComponent(outImAName)}) |`
    );
  }

  for (const entry of fs.readdirSync(OUT_IM_TTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mp3") && !expectedImNames.has(entry.name)) {
      fs.unlinkSync(path.join(OUT_IM_TTS_DIR, entry.name));
    }
  }

  for (let r = 1; r <= 120; r++) {
    const fname = `m${String(r).padStart(3, "0")}.mp3`;
    expectedImMemNames.add(fname);
    const srcMem = path.join(SRC_IM_MEM_DIR, fname);
    if (!fs.existsSync(srcMem)) throw new Error(`Missing source IM memorize MP3: ${srcMem}`);
    fs.copyFileSync(srcMem, path.join(OUT_IM_MEM_DIR, fname));
  }
  for (const entry of fs.readdirSync(OUT_IM_MEM_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mp3") && !expectedImMemNames.has(entry.name)) {
      fs.unlinkSync(path.join(OUT_IM_MEM_DIR, entry.name));
    }
  }

  imMdLines.push("");
  for (const item of OPIC_DATA_IM) {
    const numStr = String(item.id).padStart(2, "0");
    const safeTitle = sanitizeAudioFilename(item.title);
    const catLabel = tabLabelMap[item.category] || item.category;
    const outQName = `${numStr}_Q_${safeTitle}.mp3`;
    const outImAName = `${numStr}_A_${safeTitle}.mp3`;

    imMdLines.push(
      "---",
      "",
      `## #${numStr}. ${item.title}`,
      "",
      `- **카테고리:** ${catLabel} | **유형:** ${item.badge} | **중요도:** ${formatStars(item.stars)}`,
      `- **TTS 파일:** [Q: ${outQName}](tts/${encodeURIComponent(outQName)}) · [IM A: ${outImAName}](tts/im/${encodeURIComponent(outImAName)})`,
      "",
      "### Question (Q)",
      `- **키워드:** ${item.qKeywords}`,
      `- **영문:** ${item.qEn}`,
      `- **한국어 번역:** ${item.qKo}`,
      "",
      "### Answer (IM A)",
      `- **키워드:** ${item.aKeywords}`,
      ""
    );

    for (const sec of item.aSections) {
      imMdLines.push(
        `#### ${sec.step} (${getStepLabel(sec.step)}) — ${sec.summary}`,
        `${stripHtmlToPlain(sec.enHtml)}`,
        "",
        `> ${sec.ko}`,
        ""
      );
    }

    imMdLines.push(
      "#### 전체 영문 스크립트 (복사/TTS용)",
      "```text",
      item.aEnPlain,
      "```",
      ""
    );
  }

  fs.writeFileSync(OUT_IM_MD_PATH, imMdLines.join("\n"), "utf8");
  fs.writeFileSync(TIMINGS_IM_PATH, JSON.stringify(SENTENCE_TIMINGS_IM), "utf8");

  console.log(`Exported ${OPIC_DATA.length} numbered scripts to ${OUT_MD_PATH} and ${OUT_IM_MD_PATH}`);
  console.log(`Copied ${expectedQaNames.size} AL Q/A MP3s + ${expectedImNames.size} IM A MP3s`);
  console.log(`Copied ${expectedMemNames.size} AL mem MP3s + ${expectedImMemNames.size} IM mem MP3s`);
  console.log(`Exported timings to ${TIMINGS_PATH} (${Object.keys(SENTENCE_TIMINGS).length}) and ${TIMINGS_IM_PATH} (${Object.keys(SENTENCE_TIMINGS_IM).length})`);
}

main();
