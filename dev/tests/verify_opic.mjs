import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const MIRROR_DIR = "c:/cowork/오픽_2026";

function makeEl(id = "") {
  const listeners = new Map();
  return {
    id,
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    dataset: {},
    style: { setProperty() {}, display: "" },
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() { return false; }
    },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    __trigger(ev, eventObj = {}) {
      for (const fn of listeners.get(ev) || []) fn(eventObj);
    },
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    scrollIntoView() {}
  };
}

function makeSandbox() {
  const elements = new Map();
  const fakeStorageData = {};
  const scheduledTimers = [];
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
    setTimeout: (fn, ms) => {
      scheduledTimers.push({ id: scheduledTimers.length + 1, fn, ms, cleared: false });
      return scheduledTimers.length;
    },
    clearTimeout: (id) => {
      const t = scheduledTimers[id - 1];
      if (t) t.cleared = true;
    },
    Audio: function FakeAudio() {
      this.preload = "auto";
      this.src = "";
      this.playbackRate = 1.0;
      this.currentTime = 0;
      this.duration = 48;
      this.readyState = 0;
      this.seeking = false;
      this.pause = () => {};
      this.load = () => { this.readyState = 0; };
      this.removeAttribute = () => { this.src = ""; this.readyState = 0; };
      this.play = () => Promise.resolve();
    },
    AudioContext: function FakeAudioCtx() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
      this.resume = () => Promise.resolve();
      this.createOscillator = () => ({
        type: "sine",
        frequency: { setValueAtTime() {} },
        connect() {},
        start() { sandbox.__chimeCalls++; },
        stop() {}
      });
      this.createGain = () => ({
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}
      });
    },
    __chimeCalls: 0,
    __scheduledTimers: scheduledTimers,
    document: {
      body: makeEl("body"),
      visibilityState: "visible",
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelector() { return makeEl("qs"); },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(fakeStorageData, k) ? fakeStorageData[k] : null; },
      setItem(k, v) { fakeStorageData[k] = String(v); }
    },
    speechSynthesis: {
      speaking: false,
      pending: false,
      getVoices() { return []; },
      cancel() {},
      speak() {}
    },
    SpeechSynthesisUtterance: function FakeUtt(t) { this.text = t; },
    fetch: () => Promise.reject(new Error("offline test"))
  };
  sandbox.window = sandbox;
  sandbox.navigator = {};
  return { sandbox, fakeStorageData };
}

// === 1. Verify opic_study.html ===
const html = fs.readFileSync(path.join(REPO_ROOT, "opic_study.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error("Missing <script> tag in opic_study.html");
new vm.Script(m[1], { filename: "opic_study.js" });
console.log("opic_study.html JS syntax OK");

const { sandbox, fakeStorageData } = makeSandbox();
const ctx = vm.createContext(sandbox);
const code = m[1].replace("init();", "/* test harness */");
vm.runInContext(
  code + "\nwindow.__ex = { OPIC_DATA, DEFAULT_OPIC_DATA, SENTENCE_TIMINGS, IM3_DATA_MAP, IM3_TIMINGS, getEffectiveItem, TABS, state, splitSentences, splitHtmlBySentences, stripHtmlToPlain, sanitizeAudioFilename, getTtsAudioUrl, getItemsForTab, matchesSearchQuery, matchesStarFilter, loadVoices, loadState, advanceToNextBlock, advanceSentence, getSentenceStartSec, getSentenceEndSec, playFromPopupSentence, playSinglePart, playTabAll, playTabRandom, resumePlayback, pausePlayback, openScriptPopup, closeScriptPopup, stopPlayback, startQueue, buildQueueFromItems, audioPlayer, __bindEvents: bindEvents };",
  ctx
);
const ex = sandbox.__ex;

if (ex.OPIC_DATA.length !== 40) throw new Error(`Expected 40 items, got ${ex.OPIC_DATA.length}`);

// Check star assignments & star filters
const expectedStars = { 6: 3, 8: 5, 19: 5, 25: 5, 28: 4, 30: 5 };
for (const [idStr, st] of Object.entries(expectedStars)) {
  const it = ex.OPIC_DATA.find(x => x.id === Number(idStr));
  if (!it || it.stars !== st) throw new Error(`#${idStr} expected stars=${st}, got ${it?.stars}`);
}
if (ex.getItemsForTab("survey", true).length !== 16) {
  throw new Error(`Expected 16 survey items, got ${ex.getItemsForTab("survey", true).length}`);
}
ex.state.activeTab = "all";
ex.state.starFilter = "gte4";
const gte4 = ex.getItemsForTab("all");
if (gte4.map(x => x.id).join(",") !== "8,19,25,28,30") {
  throw new Error(`Unexpected gte4 items: ${gte4.map(x => x.id)}`);
}
ex.state.starFilter = "eq3";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "6") {
  throw new Error("Expected eq3 to return #6");
}
ex.state.starFilter = "all";
console.log("Star ratings and star filters verified.");

// Verify header buttons in opic_study.html
if (!html.includes('href="survey.html"') || !html.includes("📋 서베이") || !html.includes('href="memorize.html"') || !html.includes("🧠 암기")) {
  throw new Error("Header buttons missing or incorrect");
}
if (html.includes("서베이 테스트")) {
  throw new Error("Expected '서베이 테스트' to be shortened to '서베이'");
}
console.log("Header buttons (서베이 + 암기) verified.");

// Verify all 40 items parity, HTML tags, and 80 MP3 files on disk
let mp3Count = 0;
for (const it of ex.OPIC_DATA) {
  if (!it.qKeywords || !it.aKeywords || !it.aSections || it.aSections.length !== 3) {
    throw new Error(`#${it.id} missing required fields`);
  }
  const plainFromSections = it.aSections.map(s => ex.stripHtmlToPlain(s.enHtml)).join(" ");
  if (plainFromSections !== it.aEnPlain) {
    throw new Error(`#${it.id} aEnPlain mismatch:\n${plainFromSections}\nvs\n${it.aEnPlain}`);
  }
  const qSents = ex.splitSentences(it.qEn);
  const qRes = ex.splitHtmlBySentences(it.qEn, it.id, "Q", 0);
  if (qSents.length !== qRes.nextIdx) throw new Error(`#${it.id} Q sentence mismatch`);
  const aSents = ex.splitSentences(it.aEnPlain);
  let idx = 0;
  for (const sec of it.aSections) {
    const res = ex.splitHtmlBySentences(sec.enHtml, it.id, "A", idx);
    idx = res.nextIdx;
    const opens = (sec.enHtml.match(/<span\b/g) || []).length;
    const closes = (sec.enHtml.match(/<\/span>/g) || []).length;
    if (opens !== closes) throw new Error(`#${it.id} unbalanced spans`);
  }
  if (aSents.length !== idx) throw new Error(`#${it.id} A sentence mismatch: ${aSents.length} vs ${idx}`);

  for (const part of ["Q", "A"]) {
    const url = ex.getTtsAudioUrl(it.id, part);
    const full = path.join(REPO_ROOT, "tts", decodeURIComponent(url.slice(4)));
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size < 1000) throw new Error(`Missing or invalid MP3: ${full}`);
    mp3Count++;
  }
}
console.log(`All 40 scripts parity, balanced HTML, and ${mp3Count} Q&A MP3 files verified.`);

// Verify Yongin preservation on #19
if (!ex.OPIC_DATA.find(x => x.id === 19).aEnPlain.includes("Yongin")) {
  throw new Error("#19 Yongin edit must be preserved");
}

// === 2. Verify memorize.html ===
const memHtml = fs.readFileSync(path.join(REPO_ROOT, "memorize.html"), "utf8");
const mm = memHtml.match(/<script>([\s\S]*?)<\/script>/);
if (!mm) throw new Error("Missing <script> in memorize.html");
new vm.Script(mm[1], { filename: "memorize.js" });
console.log("memorize.html JS syntax OK");

const memSb = makeSandbox().sandbox;
const memCtx = vm.createContext(memSb);
vm.runInContext(
  mm[1].replace("init();", "/* test harness */") +
  "\nwindow.__mem = { MEMORIZE_BANK, SCOPE_COUNT, state, audioPlayer, getMemAudioUrl, getActivePool, resetDeck, handleRepeatFinished, advanceToRandomNext, speakCurrentRepeat };",
  memCtx
);
const mem = memSb.__mem;

if (mem.MEMORIZE_BANK.length !== 120) {
  throw new Error(`Expected 120 MEMORIZE_BANK entries, got ${mem.MEMORIZE_BANK.length}`);
}

const candidatePool = ex.OPIC_DATA.filter(x => x.category === "survey" || x.stars >= 4);
const candidateIds = new Set(candidatePool.map(x => x.id));
const seenRanks = new Set();
for (const entry of mem.MEMORIZE_BANK) {
  if (seenRanks.has(entry.rank)) throw new Error(`Duplicate rank ${entry.rank}`);
  seenRanks.add(entry.rank);
  if (!candidateIds.has(entry.itemId)) {
    throw new Error(`Rank #${entry.rank} itemId #${entry.itemId} is not in survey+★4+ candidate pool`);
  }
  const srcItem = ex.OPIC_DATA.find(x => x.id === entry.itemId);
  const srcSents = ex.splitSentences(srcItem.aEnPlain);
  if (!srcSents.includes(entry.en)) {
    throw new Error(`Rank #${entry.rank} sentence not found in #${entry.itemId}:\n${entry.en}`);
  }
  if (!entry.ko || entry.ko.length < 3) {
    throw new Error(`Rank #${entry.rank} missing Korean translation`);
  }
}
console.log("All 120 MEMORIZE_BANK sentences matched against candidate scripts (선택주제 + ★4+).");

// Verify scope slices: 100%=40, 150%=60, 200%=80, 300%=120
for (const [pct, expectedLen] of [[100, 40], [150, 60], [200, 80], [300, 120]]) {
  mem.state.scopePct = pct;
  if (mem.getActivePool().length !== expectedLen) {
    throw new Error(`Scope ${pct}% expected ${expectedLen}, got ${mem.getActivePool().length}`);
  }
}
console.log("Scope sizes 100%(40), 150%(60), 200%(80), 300%(120) verified.");

// Verify repeat loop (1..5) and random advance on completion
mem.state.scopePct = 100;
mem.resetDeck();
mem.state.repeatCount = 4;
mem.state.curRepeat = 1;
mem.state.playing = true;
mem.state.paused = false;
mem.state.sessionToken = 99;
const firstRank = mem.state.deck[mem.state.deckPos].rank;
mem.handleRepeatFinished(99);
if (mem.state.curRepeat !== 2 || mem.state.deck[mem.state.deckPos].rank !== firstRank) {
  throw new Error("Expected repeat 2 on same sentence");
}
mem.handleRepeatFinished(99);
mem.handleRepeatFinished(99);
if (mem.state.curRepeat !== 4 || mem.state.deck[mem.state.deckPos].rank !== firstRank) {
  throw new Error("Expected repeat 4 on same sentence");
}
mem.handleRepeatFinished(99);
if (mem.state.curRepeat !== 1 || mem.state.deck[mem.state.deckPos].rank === firstRank) {
  throw new Error("Expected advance to a different random sentence with curRepeat reset to 1");
}
console.log("Memorize 1-5 repeat loop & random advance verified.");

// Verify memorize MP3 files (120 primary + 120 mirror) & file-TTS mode
if (mem.state.audioSource !== "file") {
  throw new Error(`Expected memorize default audioSource='file', got ${mem.state.audioSource}`);
}
if (mem.getMemAudioUrl(1) !== "tts/mem/m001.mp3" || mem.getMemAudioUrl(120) !== "tts/mem/m120.mp3") {
  throw new Error("Unexpected getMemAudioUrl formatting");
}
const memDirs = [path.join(REPO_ROOT, "tts", "mem")];
if (fs.existsSync(path.join(MIRROR_DIR, "tts", "mem"))) {
  memDirs.push(path.join(MIRROR_DIR, "tts", "mem"));
}
for (let r = 1; r <= 120; r++) {
  const fname = `m${String(r).padStart(3, "0")}.mp3`;
  for (const dir of memDirs) {
    const st = fs.statSync(path.join(dir, fname));
    if (!st.isFile() || st.size < 1000) throw new Error(`Invalid memorize MP3: ${path.join(dir, fname)}`);
  }
}
let memWebSpeechCalls = 0;
memSb.speechSynthesis.speak = () => { memWebSpeechCalls++; };
mem.speakCurrentRepeat(99);
if (!mem.audioPlayer.src.endsWith("tts/mem/m" + String(mem.state.deck[mem.state.deckPos].rank).padStart(3, "0") + ".mp3")) {
  throw new Error(`Expected memorize audioPlayer.src to be set to mXXX.mp3, got ${mem.audioPlayer.src}`);
}
if (memWebSpeechCalls !== 0) {
  throw new Error("Expected file mode in memorize.html not to call Web Speech API");
}
console.log("Memorize 120 MP3 files (+ mirror) & file audio playback verified.");

// === 3. Verify opic_study.html SENTENCE_TIMINGS, expanded keywords, single-sentence tap, resume & top-restart ===
// 3a. Expanded front keywords across all 40 items (>= 3 arrows / >= 4 beats each)
for (const it of ex.OPIC_DATA) {
  const arrows = (it.aKeywords.match(/➔/g) || []).length;
  if (arrows < 3) {
    throw new Error(`#${it.id} expected >= 3 arrows (>= 4 beats) in aKeywords, got ${arrows}: ${it.aKeywords}`);
  }
}
console.log("All 40 items expanded aKeywords (>= 4 beats each) verified.");

// 3b. All 80/80 SENTENCE_TIMINGS match splitSentences count 1:1
if (Object.keys(ex.SENTENCE_TIMINGS).length !== 80) {
  throw new Error(`Expected 80 blocks in SENTENCE_TIMINGS, got ${Object.keys(ex.SENTENCE_TIMINGS).length}`);
}
for (const it of ex.OPIC_DATA) {
  const qSents = ex.splitSentences(it.qEn);
  const aSents = ex.splitSentences(it.aEnPlain);
  if (ex.SENTENCE_TIMINGS[`${it.id}_Q`]?.length !== qSents.length) {
    throw new Error(`#${it.id}_Q timing mismatch: ${ex.SENTENCE_TIMINGS[`${it.id}_Q`]?.length} vs ${qSents.length}`);
  }
  if (ex.SENTENCE_TIMINGS[`${it.id}_A`]?.length !== aSents.length) {
    throw new Error(`#${it.id}_A timing mismatch: ${ex.SENTENCE_TIMINGS[`${it.id}_A`]?.length} vs ${aSents.length}`);
  }
}
console.log("All 80/80 SENTENCE_TIMINGS match splitSentences 1:1.");

const block1A = { itemId: 1, part: "A", sentences: ex.splitSentences(ex.OPIC_DATA[0].aEnPlain) };
const sec1A3 = ex.getSentenceStartSec(block1A, 3, 50);
if (Math.abs(sec1A3 - 13.56) > 0.02) {
  throw new Error(`Expected exact timing seek ~13.56 for 1_A[3], got ${sec1A3}`);
}

// 3c. playFromPopupSentence(1, "A", 2) in file mode plays ONLY sentence 2, auto-pauses at end & points sentIndex to 3 (sidx + 1)
ex.state.prefs.audioSource = "file";
ex.playFromPopupSentence(1, "A", 2);
if (!ex.state.playback.active || ex.state.playback.scope !== "single" || ex.state.playback.sentIndex !== 2 || ex.state.playback.stopAfterSentIdx !== 2) {
  throw new Error("playFromPopupSentence did not initialize single-sentence stop mode at sentIndex=2");
}
ex.audioPlayer.duration = 50;
ex.audioPlayer.readyState = 4;
if (typeof ex.audioPlayer.onloadedmetadata === "function") ex.audioPlayer.onloadedmetadata();
const expectedStart2 = ex.SENTENCE_TIMINGS["1_A"][2] - 0.05;
if (Math.abs(ex.audioPlayer.currentTime - expectedStart2) > 0.02) {
  throw new Error(`Expected audioPlayer.currentTime ~${expectedStart2} after loadedmetadata, got ${ex.audioPlayer.currentTime}`);
}
// Advance audioPlayer.currentTime to end boundary of sentence 2
const stopSec2 = ex.getSentenceEndSec(block1A, 2, 50);
ex.audioPlayer.currentTime = stopSec2 + 0.01;
if (typeof ex.audioPlayer.ontimeupdate === "function") ex.audioPlayer.ontimeupdate();
if (!ex.state.playback.paused || !ex.state.playback.pausedFromSingleTap || ex.state.playback.stopAfterSentIdx !== null || ex.state.playback.sentIndex !== 3) {
  throw new Error(`Single sentence auto-pause failed: paused=${ex.state.playback.paused}, fromTap=${ex.state.playback.pausedFromSingleTap}, sentIndex=${ex.state.playback.sentIndex}`);
}

// 3d. Mini-player ▶ (#btnPlayPause -> resumePlayback) continues from sentIndex=3 onward without stopAfterSentIdx
ex.resumePlayback();
if (ex.state.playback.paused || ex.state.playback.sentIndex !== 3 || ex.state.playback.stopAfterSentIdx !== null) {
  throw new Error(`resumePlayback failed to continue from sentIndex=3: paused=${ex.state.playback.paused}, sentIndex=${ex.state.playback.sentIndex}`);
}

// 3e. Pause again from single tap at sentIndex=4, then top Play button (#btnPopupPlay -> playSinglePart) restarts from beginning (sentIndex=0)
ex.playFromPopupSentence(1, "A", 3);
ex.audioPlayer.readyState = 4;
if (typeof ex.audioPlayer.onloadedmetadata === "function") ex.audioPlayer.onloadedmetadata();
const stopSec3 = ex.getSentenceEndSec(block1A, 3, 50);
ex.audioPlayer.currentTime = stopSec3 + 0.01;
if (typeof ex.audioPlayer.ontimeupdate === "function") ex.audioPlayer.ontimeupdate();
if (!ex.state.playback.paused || ex.state.playback.sentIndex !== 4) {
  throw new Error("Expected pause at sentIndex=4 before testing top play restart");
}
ex.playSinglePart(1, "A");
if (ex.state.playback.paused || ex.state.playback.sentIndex !== 0 || ex.state.playback.stopAfterSentIdx !== null || ex.audioPlayer.currentTime !== 0) {
  throw new Error(`Top play button should restart from beginning (0): paused=${ex.state.playback.paused}, sentIndex=${ex.state.playback.sentIndex}, t=${ex.audioPlayer.currentTime}`);
}

// 3f. Same active block in 'tab' queue preserves 'tab' scope & pauses at sidx+1 on single-sentence tap
const q = ex.buildQueueFromItems([ex.OPIC_DATA[0], ex.OPIC_DATA[1]]);
ex.startQueue(q, "tab", 0);
ex.state.playback.queueIndex = 1; // 1_A
ex.state.playback.usingAudioFile = true;
ex.audioPlayer.src = "tts/1_A.mp3";
ex.audioPlayer.readyState = 4;
ex.audioPlayer.duration = 50;
ex.playFromPopupSentence(1, "A", 5);
if (ex.state.playback.scope !== "tab" || ex.state.playback.sentIndex !== 5 || ex.state.playback.stopAfterSentIdx !== 5 || Math.abs(ex.audioPlayer.currentTime - 23.65) > 0.02) {
  throw new Error(`Active tab single-sentence seek failed: scope=${ex.state.playback.scope}, sentIndex=${ex.state.playback.sentIndex}, t=${ex.audioPlayer.currentTime}`);
}
const stopSec5 = ex.getSentenceEndSec(block1A, 5, 50);
ex.audioPlayer.currentTime = stopSec5 + 0.01;
if (typeof ex.audioPlayer.ontimeupdate === "function") ex.audioPlayer.ontimeupdate();
if (!ex.state.playback.paused || ex.state.playback.sentIndex !== 6 || ex.state.playback.scope !== "tab") {
  throw new Error(`Tab queue single-sentence auto-pause failed: scope=${ex.state.playback.scope}, sentIndex=${ex.state.playback.sentIndex}`);
}
ex.resumePlayback();
if (ex.state.playback.paused || ex.state.playback.scope !== "tab" || ex.state.playback.sentIndex !== 6) {
  throw new Error("Tab queue resume from sentIndex=6 failed");
}
// Clicking top ▶ 전체 재생 while paused restarts tab from beginning (queueIndex=0, sentIndex=0)
ex.pausePlayback();
ex.playTabAll();
if (ex.state.playback.paused || ex.state.playback.queueIndex !== 0 || ex.state.playback.sentIndex !== 0) {
  throw new Error("Top btnPlayTab while paused did not restart tab from beginning");
}
ex.stopPlayback();

// 3g. Web TTS fallback mode single-sentence tap -> advanceSentence stops & pauses at sidx+1, resume continues
ex.state.prefs.audioSource = "web";
let webSpoken = [];
sandbox.speechSynthesis.speak = (utt) => { webSpoken.push(utt.text); };
ex.playFromPopupSentence(1, "A", 2);
// fire scheduled timer for web speech
const webTimer = sandbox.__scheduledTimers[sandbox.__scheduledTimers.length - 1];
webTimer.fn();
ex.advanceSentence(ex.state.playback.sessionToken);
if (!ex.state.playback.paused || !ex.state.playback.pausedFromSingleTap || ex.state.playback.sentIndex !== 3) {
  throw new Error(`Web TTS single-sentence auto-pause failed: paused=${ex.state.playback.paused}, sentIndex=${ex.state.playback.sentIndex}`);
}
ex.resumePlayback();
if (ex.state.playback.paused || ex.state.playback.sentIndex !== 3 || webSpoken[webSpoken.length - 1] !== block1A.sentences[3]) {
  throw new Error("Web TTS resumePlayback did not speak sentence 3");
}
ex.state.prefs.audioSource = "file";
ex.stopPlayback();

// 3h. Legacy 3-beat saved edits in localStorage upgrade cleanly when loaded
fakeStorageData["opic_study_edits_v1"] = JSON.stringify({
  "19": {
    stars: 4,
    aKeywords: "🏢 Yongin 3-bed apt (quiet) ➔ 🛋️ Bright living room & sofa ➔ ❤️ Love my home",
    qEn: ex.OPIC_DATA.find(x => x.id === 19).qEn,
    aEnPlain: ex.OPIC_DATA.find(x => x.id === 19).aEnPlain
  }
});
ex.loadState();
if ((ex.OPIC_DATA.find(x => x.id === 19).aKeywords.match(/➔/g) || []).length < 3 || ex.OPIC_DATA.find(x => x.id === 19).stars !== 4) {
  throw new Error("loadState failed to upgrade saved 3-beat keywords while preserving user star edit");
}
console.log("Saved 3-beat keyword migration verified.");

// 3i. Double-tap close & single-tap sentence playback inside popupBody
ex.__bindEvents();
ex.openScriptPopup(1, "A");
const popupBody = sandbox.document.getElementById("popupBody");

// Single tap on blank non-sentence area must NOT close popup
popupBody.__trigger("click", { target: { closest: () => null } });
if (!ex.state.popup.isOpen) throw new Error("Single tap on popupBody must not close popup");

// Wait (> 300ms simulation via overwriting lastTapTime) and tap sentence 4 once -> schedules playback, keeps popup open
ex.state.popup.lastTapTime = Date.now() - 500;
const sentTarget = { closest: (sel) => sel === ".tts-sentence" ? { dataset: { sidx: "4" } } : null };
const timerCountBefore = sandbox.__scheduledTimers.length;
popupBody.__trigger("click", { target: sentTarget });
if (!ex.state.popup.isOpen) throw new Error("Single tap on sentence must keep popup open");
if (sandbox.__scheduledTimers.length <= timerCountBefore) throw new Error("Expected single tap on sentence to schedule playback timer");
const tapTimer = sandbox.__scheduledTimers[sandbox.__scheduledTimers.length - 1];
if (tapTimer.cleared) throw new Error("Tap timer should not be cleared yet");
tapTimer.fn();
if (!ex.state.playback.active || ex.state.playback.sentIndex !== 4 || ex.state.playback.stopAfterSentIdx !== 4) {
  throw new Error("Scheduled tap timer did not start single-sentence playback at sentence 4");
}
ex.stopPlayback();

// Rapid double-tap on sentence closes popup AND cancels pending tap timer
ex.state.popup.lastTapTime = 0;
popupBody.__trigger("click", { target: sentTarget });
const tapTimer2 = sandbox.__scheduledTimers[sandbox.__scheduledTimers.length - 1];
popupBody.__trigger("click", { target: sentTarget });
if (ex.state.popup.isOpen) throw new Error("Double-tap inside popupBody should close popup");
if (!tapTimer2.cleared) throw new Error("Double-tap should cancel pending single-tap playback timer");
console.log("opic_study.html SENTENCE_TIMINGS, single-sentence tap, resume/top-restart, and double-tap popup close verified.");

// 3j. Script search bar replaces #voiceSelect
if (html.includes('id="voiceSelect"') || !html.includes('id="searchInput"') || !html.includes('id="btnClearSearch"')) {
  throw new Error("Expected #searchInput and #btnClearSearch in utility bar with #voiceSelect removed");
}
// loadVoices must not throw when #voiceSelect is absent
const origGetEl = sandbox.document.getElementById.bind(sandbox.document);
sandbox.document.getElementById = (id) => (id === "voiceSelect" ? null : origGetEl(id));
ex.loadVoices();
sandbox.document.getElementById = origGetEl;

ex.state.activeTab = "all";
ex.state.starFilter = "all";
ex.state.searchQuery = "차은우";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "16") {
  throw new Error(`Search '차은우' expected [16], got [${ex.getItemsForTab("all").map(x => x.id)}]`);
}
ex.state.searchQuery = "용인";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "19") {
  throw new Error(`Search '용인' expected [19], got [${ex.getItemsForTab("all").map(x => x.id)}]`);
}
ex.state.searchQuery = "porridge";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "1") {
  throw new Error(`Search 'porridge' expected [1], got [${ex.getItemsForTab("all").map(x => x.id)}]`);
}
ex.state.searchQuery = "#40";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "40") {
  throw new Error(`Search '#40' expected [40], got [${ex.getItemsForTab("all").map(x => x.id)}]`);
}
ex.state.searchQuery = "wife covid";
if (ex.getItemsForTab("all").map(x => x.id).join(",") !== "3") {
  throw new Error(`Multi-token search 'wife covid' expected [3], got [${ex.getItemsForTab("all").map(x => x.id)}]`);
}
// Interactive #searchInput & #btnClearSearch events
const searchInputEl = sandbox.document.getElementById("searchInput");
const btnClearEl = sandbox.document.getElementById("btnClearSearch");
searchInputEl.value = "해변";
searchInputEl.__trigger("input", { target: searchInputEl });
if (ex.state.searchQuery !== "해변" || btnClearEl.hidden !== false || ex.getItemsForTab("all").length !== 2) {
  throw new Error("Interactive search input event failed");
}
searchInputEl.focus = () => {};
btnClearEl.__trigger("click", {});
if (ex.state.searchQuery !== "" || btnClearEl.hidden !== true || ex.getItemsForTab("all").length !== 40) {
  throw new Error("Clear search button did not reset search results to 40");
}
console.log("Top script search bar (#searchInput + #btnClearSearch) & multi-field filtering verified.");

// === 4. Verify opic_script/opic_script.md, numbered opic_script/tts/, and dev/tests/timings.json ===
const scriptMdPath = path.join(REPO_ROOT, "opic_script", "opic_script.md");
const scriptMd = fs.readFileSync(scriptMdPath, "utf8");
const scriptTtsDir = path.join(REPO_ROOT, "opic_script", "tts");
const scriptMemDir = path.join(scriptTtsDir, "mem");

const actualQaFiles = fs.readdirSync(scriptTtsDir, { withFileTypes: true })
  .filter(d => d.isFile() && d.name.endsWith(".mp3"))
  .map(d => d.name);
if (actualQaFiles.length !== 80) {
  throw new Error(`Expected 80 Q/A MP3s in opic_script/tts, got ${actualQaFiles.length}`);
}

for (const it of ex.OPIC_DATA) {
  const numStr = String(it.id).padStart(2, "0");
  const safeTitle = ex.sanitizeAudioFilename(it.title);
  if (!scriptMd.includes(`## #${numStr}. ${it.title}`) || !scriptMd.includes(it.aEnPlain)) {
    throw new Error(`opic_script.md missing complete #${numStr} section or answer`);
  }
  for (const part of ["Q", "A"]) {
    const mp3Name = `${numStr}_${part}_${safeTitle}.mp3`;
    const st = fs.statSync(path.join(scriptTtsDir, mp3Name));
    if (!st.isFile() || st.size < 1000) {
      throw new Error(`Missing or invalid numbered MP3: opic_script/tts/${mp3Name}`);
    }
  }
}
for (let r = 1; r <= 120; r++) {
  const fname = `m${String(r).padStart(3, "0")}.mp3`;
  const st = fs.statSync(path.join(scriptMemDir, fname));
  if (!st.isFile() || st.size < 1000) {
    throw new Error(`Invalid memorize MP3 in opic_script/tts/mem/${fname}`);
  }
}
const timingsJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "dev", "tests", "timings.json"), "utf8"));
if (Object.keys(timingsJson).length !== 80) {
  throw new Error(`Expected 80 entries in dev/tests/timings.json, got ${Object.keys(timingsJson).length}`);
}
console.log("Consolidated opic_script/opic_script.md, 80 numbered Q/A MP3s, 120 mem MP3s, and dev/tests/timings.json verified.");

// === 5. Verify IM3 mode, 40 IM3 scripts, IM3_TIMINGS, 40 IM3 MP3s, and opic_script_im3.md ===
const im3MdPath = path.join(REPO_ROOT, "opic_script", "opic_script_im3.md");
const im3Md = fs.readFileSync(im3MdPath, "utf8");
const im3TtsDir = path.join(REPO_ROOT, "tts", "im3");
const im3ExportTtsDir = path.join(scriptTtsDir, "im3");
if (Object.keys(ex.IM3_DATA_MAP).length !== 40) {
  throw new Error(`Expected 40 IM3 scripts, got ${Object.keys(ex.IM3_DATA_MAP).length}`);
}
if (Object.keys(ex.IM3_TIMINGS).length !== 40) {
  throw new Error(`Expected 40 IM3_TIMINGS entries, got ${Object.keys(ex.IM3_TIMINGS).length}`);
}
ex.state.prefs.level = "im3";
for (const it of ex.OPIC_DATA) {
  const eff = ex.getEffectiveItem(it);
  const im3 = ex.IM3_DATA_MAP[it.id];
  if (!im3 || eff.aEnPlain !== im3.aEnPlain) {
    throw new Error(`getEffectiveItem IM3 mismatch on #${it.id}`);
  }
  if (!eff.aSections || eff.aSections.length !== 3) {
    throw new Error(`IM3 #${it.id} missing 3 sections`);
  }
  const plainFromSections = eff.aSections.map(s => ex.stripHtmlToPlain(s.enHtml)).join(" ");
  if (plainFromSections !== eff.aEnPlain) {
    throw new Error(`IM3 #${it.id} aEnPlain mismatch`);
  }
  for (const sec of eff.aSections) {
    const opens = (sec.enHtml.match(/<span\b/g) || []).length;
    const closes = (sec.enHtml.match(/<\/span>/g) || []).length;
    if (opens !== closes) throw new Error(`IM3 #${it.id} unbalanced spans`);
  }
  const sents = ex.splitSentences(eff.aEnPlain);
  if (ex.IM3_TIMINGS[`${it.id}_A`]?.length !== sents.length) {
    throw new Error(`IM3 #${it.id}_A timing mismatch: ${ex.IM3_TIMINGS[`${it.id}_A`]?.length} vs ${sents.length}`);
  }
  const numStr = String(it.id).padStart(2, "0");
  const safeTitle = ex.sanitizeAudioFilename(it.title);
  const mp3Name = `${numStr}_A_${safeTitle}.mp3`;
  if (ex.getTtsAudioUrl(it.id, "A") !== `tts/im3/${encodeURIComponent(mp3Name)}`) {
    throw new Error(`IM3 #${it.id} getTtsAudioUrl mismatch`);
  }
  for (const dir of [im3TtsDir, im3ExportTtsDir]) {
    const st = fs.statSync(path.join(dir, mp3Name));
    if (!st.isFile() || st.size < 1000) throw new Error(`Invalid IM3 MP3: ${path.join(dir, mp3Name)}`);
  }
  if (!im3Md.includes(`## #${numStr}. ${it.title}`) || !im3Md.includes(eff.aEnPlain)) {
    throw new Error(`opic_script_im3.md missing #${numStr}`);
  }
}
ex.playFromPopupSentence(1, "A", 2);
if (!ex.state.playback.active || ex.state.playback.sentIndex !== 2 || !ex.audioPlayer.src.includes("tts/im3/")) {
  throw new Error("IM3 single-sentence tap playback failed");
}
ex.stopPlayback();
ex.state.prefs.level = "al";
console.log("All 40 IM3 scripts, IM3_TIMINGS, 40 IM3 MP3s, opic_script_im3.md, and IM3 playback verified.");

// Verify SHA-256 mirror parity
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
if (sha(path.join(REPO_ROOT, "opic_study.html")) !== sha(path.join(REPO_ROOT, "index.html"))) {
  throw new Error("opic_study.html and index.html differ!");
}
if (fs.existsSync(MIRROR_DIR)) {
  if (sha(path.join(REPO_ROOT, "opic_study.html")) !== sha(path.join(MIRROR_DIR, "opic_study.html"))) {
    throw new Error("opic_study.html mirror differs!");
  }
  if (sha(path.join(REPO_ROOT, "memorize.html")) !== sha(path.join(MIRROR_DIR, "memorize.html"))) {
    throw new Error("memorize.html mirror differs!");
  }
}
console.log("All HTML mirror SHA-256 hashes match identically.");
