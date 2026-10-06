/*
 * Headless tests for the Hebrew letters game.
 *
 *   cd /storage/home/gilkeren/code/hebrew-letters-game && jjs test/run-tests.js
 *
 * Runs the real game logic from index.html against a tiny fake DOM, so the
 * level pools, answer balance, progression and answer-reveal rules can be
 * checked without a browser.
 */

// ---------------------------------------------------------------- fake DOM
function mkEl(tag) {
  var node = {
    tagName: tag, children: [], style: {}, attrs: {}, disabled: false,
    offsetWidth: 1, listeners: {}, _html: "", _text: "", _cls: "", parentNode: null
  };
  var classes = {};
  function syncCls() {
    var out = [];
    for (var c in classes) if (classes[c]) out.push(c);
    node._cls = out.join(" ");
  }
  node.classList = {
    add: function (c) { classes[c] = true; syncCls(); },
    remove: function (c) { delete classes[c]; syncCls(); },
    contains: function (c) { return !!classes[c]; }
  };
  Object.defineProperty(node, "className", {
    get: function () { return node._cls; },
    set: function (v) {
      classes = {};
      var parts = String(v).split(/\s+/);
      for (var i = 0; i < parts.length; i++) if (parts[i]) classes[parts[i]] = true;
      syncCls();
    }
  });
  Object.defineProperty(node, "innerHTML", {
    get: function () { return node._html; },
    set: function (v) { node._html = v; if (v === "") node.children = []; }
  });
  Object.defineProperty(node, "textContent", {
    get: function () { return node._text; }, set: function (v) { node._text = v; }
  });
  node.setAttribute = function (k, v) { node.attrs[k] = v; };
  node.getAttribute = function (k) { return node.attrs[k]; };
  node.appendChild = function (c) { node.children.push(c); c.parentNode = node; return c; };
  node.removeChild = function (c) {
    var out = [];
    for (var i = 0; i < node.children.length; i++) if (node.children[i] !== c) out.push(node.children[i]);
    node.children = out;
  };
  node.addEventListener = function (t, f) {
    if (!node.listeners[t]) node.listeners[t] = [];
    node.listeners[t].push(f);
  };
  node.removeEventListener = function () {};
  node.click = function () {
    var ls = node.listeners.click || [];
    for (var i = 0; i < ls.length; i++) ls[i]();
  };
  node.querySelectorAll = function () { return node.children; };
  return node;
}

var IDS = {};
var idList = ["picture", "word", "options", "banner", "prompt", "say", "reset",
              "levelPill", "starsPill", "cyclesPill", "progressText", "pips", "levelPicker"];
for (var ii = 0; ii < idList.length; ii++) IDS[idList[ii]] = mkEl("div");

var DOC_LISTENERS = {};
var document = {
  getElementById: function (i) { return IDS[i]; },
  querySelector: function () { return mkEl("div"); },
  createElement: mkEl,
  addEventListener: function (t, f) {
    if (!DOC_LISTENERS[t]) DOC_LISTENERS[t] = [];
    DOC_LISTENERS[t].push(f);
  },
  removeEventListener: function (t, f) {
    var ls = DOC_LISTENERS[t] || [], out = [];
    for (var i = 0; i < ls.length; i++) if (ls[i] !== f) out.push(ls[i]);
    DOC_LISTENERS[t] = out;
  },
  body: mkEl("body")
};
function fire(type) {
  var ls = (DOC_LISTENERS[type] || []).slice();
  for (var i = 0; i < ls.length; i++) ls[i]();
}

/* Timers are recorded, never auto-run. Tests flush them when they want to. */
var TIMERS = [];
function setTimeout(fn, ms) { TIMERS.push({ fn: fn, ms: ms || 0 }); return TIMERS.length; }
function clearTimeout(id) { if (id && TIMERS[id - 1]) TIMERS[id - 1] = null; }
function flushTimers() {
  var list = TIMERS;
  TIMERS = [];
  list.sort(function (a, b) { return (a ? a.ms : 0) - (b ? b.ms : 0); });
  for (var i = 0; i < list.length; i++) if (list[i]) list[i].fn();
}
function dropTimers() { TIMERS = []; }

/* Fake speech engine that records the exact order of cancel/speak calls. */
var SPOKEN = [];
var SPEECH_LOG = [];
function SpeechSynthesisUtterance(t) { this.text = t; }
var window = {
  speechSynthesis: {
    paused: false,
    resumed: 0,
    getVoices: function () { return [{ name: "Carmit", lang: "he-IL" }]; },
    cancel: function () { SPEECH_LOG.push("cancel"); },
    resume: function () { this.resumed++; SPEECH_LOG.push("resume"); },
    speak: function (u) { SPEECH_LOG.push("speak"); SPOKEN.push(u.text); }
  }
};

// ------------------------------------------------- load the real game code
var html = new java.lang.String(
  java.nio.file.Files.readAllBytes(
    java.nio.file.Paths.get(__DIR__ + "../index.html")
  ),
  java.nio.charset.StandardCharsets.UTF_8
) + "";
var body = html.substring(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* Give the fake elements the same starting classes they have in the markup, so
   things like the picker's initial "hidden" state are reproduced faithfully. */
for (var ci = 0; ci < idList.length; ci++) {
  var tag = (html.match(new RegExp('<[^>]*id="' + idList[ci] + '"[^>]*>')) || [""])[0];
  var cm = tag.match(/class="([^"]*)"/);
  if (cm) IDS[idList[ci]].className = cm[1];
}

eval(body.replace('"use strict";', ""));

// ------------------------------------------------------------------ helpers
var failures = 0;
function check(ok, msg) { if (!ok) { failures++; print("FAIL: " + msg); } }
function opts() { return IDS.options.children; }
function values() {
  var v = [], c = opts();
  for (var i = 0; i < c.length; i++) v.push(c[i].attrs["data-value"]);
  return v;
}
function faces() {
  var v = [], c = opts();
  for (var i = 0; i < c.length; i++) v.push(c[i]._text);
  return v;
}
function clickCorrect() {
  var c = opts();
  for (var i = 0; i < c.length; i++) if (c[i].attrs["data-value"] === currentAnswer) { c[i].click(); return; }
  throw new Error("no button matched the answer");
}
function clickWrong() {
  var c = opts();
  for (var i = 0; i < c.length; i++) if (c[i].attrs["data-value"] !== currentAnswer) { c[i].click(); return; }
}
function keysOf(o) { var k = []; for (var x in o) k.push(x); k.sort(); return k; }

var SIMPLE = "בגדזחטכלמנספצקרשת";
var FINALS = "ךםןףץ";
var VOWELS = "אהוי";
var NAMES = { a: "patah", i: "hirik", q: "kamatz", y: "hirik+yud", e: "segol", t: "tzere" };
var N = 3000;

function sample(lvl, n) {
  level = lvl; solved = 0;
  var hits = {}, groupA = 0, i, j;
  for (i = 0; i < n; i++) {
    nextQuestion();
    var vals = values();
    var expect = LEVELS[lvl].mode === "nikud" ? LEVELS[lvl].groups[0].chars.length : 3;
    check(vals.length === expect, "level " + lvl + " gave " + vals.length + " options, want " + expect);
    var uniq = {}; for (j = 0; j < vals.length; j++) uniq[vals[j]] = true;
    var nU = 0; for (j in uniq) nU++;
    check(nU === vals.length, "level " + lvl + " duplicate options");
    var found = false;
    for (j = 0; j < vals.length; j++) if (vals[j] === currentAnswer) found = true;
    check(found, "level " + lvl + " correct answer missing from the options");
    hits[currentAnswer] = (hits[currentAnswer] || 0) + 1;
    if (LEVELS[lvl].groups[0].chars.indexOf(currentAnswer) !== -1) groupA++;
  }
  return { hits: hits, pctA: Math.round(groupA * 100 / n) };
}

// --------------------------------------------------------- letter levels
print("=== letter levels ===");

var r1 = sample(1, N), k1 = keysOf(r1.hits), bad = 0, a;
for (a = 0; a < k1.length; a++) if (SIMPLE.indexOf(k1[a]) === -1) bad++;
check(bad === 0, "level 1 included letters outside its list: " + k1.join(""));
print("L1 first letters (" + k1.length + "): " + k1.join(" "));

var r2 = sample(2, N);
check(r2.pctA >= 71 && r2.pctA <= 79, "level 2 non-L1 share is " + r2.pctA + "%, want ~75%");
print("L2 first letters (" + keysOf(r2.hits).length + "): non-L1 " + r2.pctA + "%");

var r3 = sample(3, N), k3 = keysOf(r3.hits);
bad = 0;
for (a = 0; a < k3.length; a++) if (SIMPLE.indexOf(k3[a]) === -1) bad++;
check(bad === 0, "level 3 included endings outside its list: " + k3.join(""));
print("L3 last letters (" + k3.length + "): " + k3.join(" "));

var r4 = sample(4, N), seenF = 0;
check(r4.pctA >= 71 && r4.pctA <= 79, "level 4 sofit share is " + r4.pctA + "%, want ~75%");
for (a = 0; a < FINALS.length; a++) if (r4.hits[FINALS.charAt(a)]) seenF++;
check(seenF === 5, "level 4 saw only " + seenF + "/5 sofit letters");
print("L4 last letters (" + keysOf(r4.hits).length + "): sofit " + r4.pctA + "%, all 5 finals seen");

var r5 = sample(5, N), seenV = 0;
check(r5.pctA >= 71 && r5.pctA <= 79, "level 5 vowel-ending share is " + r5.pctA + "%, want ~75%");
for (a = 0; a < VOWELS.length; a++) if (r5.hits[VOWELS.charAt(a)]) seenV++;
check(seenV === 4, "level 5 saw only " + seenV + "/4 vowel endings");
print("L5 last letters (" + keysOf(r5.hits).length + "): אהוי " + r5.pctA + "%");

// distractors must stay inside the answer's own group
level = 4; solved = 0;
var mixed = 0;
for (var q = 0; q < 500; q++) {
  nextQuestion();
  if (FINALS.indexOf(currentAnswer) === -1) continue;
  var vv = values();
  for (var z = 0; z < vv.length; z++) if (FINALS.indexOf(vv[z]) === -1) mixed++;
}
check(mixed === 0, "level 4 offered " + mixed + " non-sofit distractors on sofit questions");
print("L4 sofit questions offer only sofit choices");

// ---------------------------------------------------------- nikud levels
print("");
print("=== nikud levels ===");
var SPEC = { 6: "ai", 7: "qi", 8: "ya", 9: "ea", 10: "aye", 11: "ti", 12: "tqy" };
var tally = {};
for (var kk in NIKUD) tally[NIKUD[kk]] = (tally[NIKUD[kk]] || 0) + 1;
print("class sizes: a=" + tally.a + " i=" + tally.i + " q=" + tally.q +
      " y=" + tally.y + " e=" + tally.e + " t=" + tally.t);

for (var lvl = 6; lvl <= 12; lvl++) {
  var r = sample(lvl, N), parts = [], lo = 100, hi = 0, j;
  for (j = 0; j < SPEC[lvl].length; j++) {
    var c = SPEC[lvl].charAt(j);
    var pct = Math.round((r.hits[c] || 0) * 100 / N);
    parts.push(NAMES[c] + " " + pct + "%");
    if (pct < lo) lo = pct;
    if (pct > hi) hi = pct;
  }
  var even = Math.round(100 / SPEC[lvl].length);
  check(lo >= even - 8 && hi <= even + 8,
    "level " + lvl + " unbalanced: " + parts.join(", ") + " (want ~" + even + "% each)");
  var extra = keysOf(r.hits);
  for (j = 0; j < extra.length; j++) {
    check(SPEC[lvl].indexOf(extra[j]) !== -1, "level " + lvl + " answered " + NAMES[extra[j]] + ", outside spec");
  }
  print("L" + lvl + ": " + parts.join(", "));
}

// hirik male must display its yud
level = 8; solved = 0;
var withYud = 0, checkedY = 0;
for (q = 0; q < 200; q++) {
  nextQuestion();
  var vs = values(), fs = faces();
  for (z = 0; z < vs.length; z++) {
    if (vs[z] === "y") { checkedY++; if (fs[z].charAt(fs[z].length - 1) === "\u05d9") withYud++; }
  }
}
check(checkedY > 0 && withYud === checkedY, "hirik male buttons missing the yud");
print("hirik-male buttons carry their yud (" + withYud + "/" + checkedY + ")");

// ------------------------------------------------- answer must stay hidden
print("");
print("=== the answer must not leak ===");
var leaks = 0, checkedQ = 0;
for (lvl = 1; lvl <= 12; lvl++) {
  level = lvl; solved = 0;
  for (q = 0; q < 40; q++) {
    nextQuestion();
    checkedQ++;
    if (IDS.word._text !== "") leaks++;
  }
}
check(leaks === 0, leaks + " of " + checkedQ + " questions showed the word before it was earned");
print(checkedQ + " questions checked, " + leaks + " leaks");

level = 1; solved = 0; nextQuestion();
clickWrong();
check(IDS.word._text === "", "a wrong answer revealed the word");
clickCorrect();
check(IDS.word._text === current.word, "the correct answer should reveal the word");
print("hidden after a wrong answer, revealed after the right one");

// ------------------------------------------------------------ progression
print("");
print("=== progression ===");
print("CONFIG: correctAnswersPerLevel=" + CONFIG.correctAnswersPerLevel +
      ", numberOfLevels=" + CONFIG.numberOfLevels +
      "  ->  TARGET=" + TARGET + ", LAST_LEVEL=" + LAST_LEVEL + " of " + MAX_LEVEL);
check(TARGET === CONFIG.correctAnswersPerLevel, "TARGET does not follow CONFIG");
check(LAST_LEVEL === Math.min(CONFIG.numberOfLevels, MAX_LEVEL), "LAST_LEVEL does not follow CONFIG");

level = 1; solved = 0; stars = 0; cycles = 0;
nextQuestion();
for (var t = 0; t < TARGET - 1; t++) { clickCorrect(); nextQuestion(); }
check(level === 1, "should still be on level 1 after " + (TARGET - 1) + " correct");
clickCorrect();
check(level === 2 && solved === 0, "should advance to level 2 with progress reset");
print(TARGET + " correct -> level " + level + ", progress " + solved);

nextQuestion(); clickCorrect();
nextQuestion(); clickCorrect();
var before = solved;
nextQuestion(); clickWrong();
check(solved === before, "a mistake must not change progress");
clickCorrect();
check(solved === before, "the retry after a mistake must not earn credit");
print("progress " + before + " survived a mistake; retry earned nothing");

level = 1; solved = 0; stars = 0; cycles = 0;
nextQuestion();
var sweep = TARGET * LAST_LEVEL, visited = {};
for (t = 0; t < sweep - 1; t++) { visited[level] = true; clickCorrect(); nextQuestion(); }
visited[level] = true;
clickCorrect();
check(cycles === 1, "expected one trophy after " + sweep + " correct, got " + cycles);
check(level === 1, "should wrap back to level 1, got " + level);
check(keysOf(visited).length === LAST_LEVEL, "visited " + keysOf(visited).length + " levels, expected " + LAST_LEVEL);
print(sweep + " correct -> levels " + keysOf(visited).join(",") + ", trophy " + cycles + ", back to level " + level);

// ---------------------------------------------------------------- speech
print("");
print("=== speech ===");
dropTimers();
SPOKEN = []; SPEECH_LOG = [];

check(speechState === "ok", "a Hebrew voice should have been picked, state=" + speechState);
check(hebrewVoice && hebrewVoice.name === "Carmit", "should prefer the Carmit voice");

// nothing may be spoken before the first touch
level = 1; solved = 0; nextQuestion();
flushTimers();
check(SPOKEN.length === 0, "spoke " + SPOKEN.length + " time(s) before the first touch");

// the first touch unlocks speech and says the current word exactly once
SPOKEN = []; SPEECH_LOG = [];
fire("pointerdown");
flushTimers();
check(touched === true, "the first touch should unlock audio");
check(SPOKEN.length === 1, "first touch should speak once, spoke " + SPOKEN.length);
check(SPOKEN[0] === (SAY[current.word] || current.word),
  "should speak the vocalized form, got '" + SPOKEN[0] + "'");
print("first touch speaks once: '" + SPOKEN[0] + "'");

// a cancel must never land in the same tick as a speak
SPOKEN = []; SPEECH_LOG = [];
sayWord(0.75);
check(SPEECH_LOG.join(",").indexOf("speak") === -1,
  "speak happened in the same tick as cancel: " + SPEECH_LOG.join(","));
flushTimers();
check(SPOKEN.length === 1, "the deferred utterance should have been spoken");
print("cancel and speak are in separate ticks: " + SPEECH_LOG.join(" -> "));

// the real say button: one tap reaching both pointerdown and click speaks once
SPOKEN = []; SPEECH_LOG = [];
fire("pointerdown");          // no-op now, the once-handler already ran
IDS.say.click();
IDS.say.click();              // an impatient double tap
flushTimers();
check(SPOKEN.length === 1, "a rapid double tap should speak once, spoke " + SPOKEN.length);
print("rapid double tap on the say button speaks once");

// repeated taps must never go permanently silent
SPOKEN = [];
for (var tap = 0; tap < 25; tap++) { IDS.say.click(); flushTimers(); }
check(SPOKEN.length === 25, "25 taps should give 25 utterances, got " + SPOKEN.length);
print("25 consecutive taps -> " + SPOKEN.length + " utterances, never silent");

// a tap landing while an answer's delayed speech is pending still speaks
SPOKEN = []; dropTimers();
level = 1; solved = 0; nextQuestion();
clickCorrect();               // queues its own delayed sayWord + nextQuestion
IDS.say.click();              // child taps during the celebration
flushTimers();
check(SPOKEN.length > 0, "a tap during the answer animation went silent");
print("tapping during the answer animation still speaks");

// a paused queue is resumed rather than left stuck
SPOKEN = []; SPEECH_LOG = []; dropTimers();
window.speechSynthesis.paused = true;
IDS.say.click();
flushTimers();
check(window.speechSynthesis.resumed > 0, "a paused speech queue was not resumed");
check(SPOKEN.length === 1, "should still speak after resuming a paused queue");
window.speechSynthesis.paused = false;
print("a paused queue is resumed before speaking");

// -------------------------------------------------------- level picker
print("");
print("=== level picker ===");
dropTimers();

var picks = IDS.levelPicker.children;
check(picks.length === LAST_LEVEL,
  "picker should offer " + LAST_LEVEL + " levels, has " + picks.length);
check(IDS.levelPicker.classList.contains("hidden"), "picker should start closed");
print("picker offers " + picks.length + " levels and starts closed");

// the pill opens and closes it
IDS.levelPill.click();
check(!IDS.levelPicker.classList.contains("hidden"), "the pill should open the picker");
check(IDS.levelPill.attrs["aria-expanded"] === "true", "aria-expanded should follow the panel");
IDS.levelPill.click();
check(IDS.levelPicker.classList.contains("hidden"), "the pill should close the picker again");
print("the level pill toggles the picker open and closed");

// jumping to each level works, resets progress and closes the panel
level = 1; solved = 0; stars = 7; cycles = 2;
for (var p = LAST_LEVEL; p >= 1; p--) {
  IDS.levelPill.click();            // open
  solved = 4;                       // pretend some progress on the old level
  picks[p - 1].click();             // choose level p
  check(level === p, "picking level " + p + " landed on level " + level);
  check(solved === 0, "jumping to level " + p + " should reset progress, got " + solved);
  check(IDS.levelPicker.classList.contains("hidden"), "picking a level should close the picker");
  check(currentAnswer === keyOf(current, LEVELS[p].mode),
    "level " + p + " served a question from the wrong mode");
  var onCount = 0;
  for (var m = 0; m < picks.length; m++) if (picks[m].classList.contains("on")) onCount++;
  check(onCount === 1 && picks[p - 1].classList.contains("on"),
    "level " + p + " should be the only highlighted button");
}
check(stars === 7 && cycles === 2, "jumping levels must not touch stars or trophies");
print("jumped to every level 1.." + LAST_LEVEL + "; progress reset, stars and trophies kept");

// a jump mid-level still advances normally from there
IDS.levelPill.click();
picks[0].click();                   // back to level 1
for (var s = 0; s < TARGET; s++) { clickCorrect(); if (solved !== 0) nextQuestion(); }
check(level === 2, "after a jump, finishing the level should still advance; got " + level);
print("after jumping, completing a level advances as usual");

print("");
print(failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED");
