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
              "levelPill", "starsPill", "cyclesPill", "progressText", "pips", "levelPicker",
              "sky", "skyNext", "sayrow"];
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

/* Timers run on a fake clock, so tests can assert what is heard and when. */
var NOW = 0;
var TIMERS = [];
function setTimeout(fn, ms) { TIMERS.push({ fn: fn, at: NOW + (ms || 0) }); return TIMERS.length; }
function clearTimeout(id) { if (id && TIMERS[id - 1]) TIMERS[id - 1] = null; }
function runUntil(limit) {
  for (;;) {
    var best = -1;
    for (var i = 0; i < TIMERS.length; i++) {
      if (!TIMERS[i] || TIMERS[i].at > limit) continue;
      if (best < 0 || TIMERS[i].at < TIMERS[best].at) best = i;
    }
    if (best < 0) break;
    var t = TIMERS[best];
    TIMERS[best] = null;
    NOW = t.at;
    t.fn();
  }
  NOW = limit;
}
function flushTimers() { runUntil(NOW + 100000); }
/* Null entries rather than emptying, so outstanding timer ids stay valid. */
function dropTimers() { for (var i = 0; i < TIMERS.length; i++) TIMERS[i] = null; }

/* Fake speech engine that records the exact order of cancel/speak calls. */
var SPOKEN = [];
var SPOKEN_AT = [];
var SPEECH_LOG = [];
function SpeechSynthesisUtterance(t) { this.text = t; }
var window = {
  speechSynthesis: {
    paused: false,
    resumed: 0,
    getVoices: function () { return [{ name: "Carmit", lang: "he-IL" }]; },
    cancel: function () { SPEECH_LOG.push("cancel"); },
    resume: function () { this.resumed++; SPEECH_LOG.push("resume"); },
    speak: function (u) { SPEECH_LOG.push("speak"); SPOKEN.push(u.text); SPOKEN_AT.push(NOW); }
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
    var expect;
    if (LEVELS[lvl].mode === "readword" || LEVELS[lvl].mode === "readpic") {
      expect = LEVELS[lvl].options || 3;
    } else if (LEVELS[lvl].mode === "nikud" || LEVELS[lvl].mode === "sound") {
      if (LEVELS[lvl].contrast) {
        expect = 2;
      } else {
        var union = {};
        for (var ug = 0; ug < LEVELS[lvl].groups.length; ug++) {
          var uc = LEVELS[lvl].groups[ug].chars;
          for (var uk = 0; uk < uc.length; uk++) union[uc.charAt(uk)] = true;
        }
        var avail = keysOf(union).length;
        expect = Math.min(LEVELS[lvl].options || avail, avail);
      }
    } else {
      expect = 3;
    }
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

// every button must carry a real caption, never "undefined"
var badCaption = [];
for (var cap = 0; cap < picks.length; cap++) {
  var html = picks[cap]._html;
  if (html.indexOf("undefined") !== -1 || !MODE_LABEL[LEVELS[cap + 1].mode]) {
    badCaption.push(cap + 1);
  }
}
check(badCaption.length === 0, "picker buttons show no caption for level(s): " + badCaption.join(", "));
var modesSeen = {};
for (var md = 1; md <= MAX_LEVEL; md++) modesSeen[LEVELS[md].mode] = true;
for (var mk in modesSeen) check(MODE_LABEL[mk], "mode '" + mk + "' has no picker caption");
print("all " + picks.length + " picker buttons are captioned (" + keysOf(modesSeen).join(", ") + ")");
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

// -------------------------------------------------- letter name on press
print("");
print("=== letter names spoken on press ===");
dropTimers();

// every letter that can appear as an option needs a spoken name
var allKeys = {};
for (var L = 1; L <= MAX_LEVEL; L++) {
  if (LEVELS[L].mode !== "first" && LEVELS[L].mode !== "last") continue;
  for (var gg = 0; gg < LEVELS[L].groups.length; gg++) {
    var gk = LEVELS[L].groups[gg].keys;
    for (var ki = 0; ki < gk.length; ki++) allKeys[gk[ki]] = true;
  }
}
var missingName = [];
for (var letter in allKeys) if (!LETTER_SAY[letter]) missingName.push(letter);
check(missingName.length === 0, "no spoken name for: " + missingName.join(" "));
print(keysOf(allKeys).length + " letters can appear, all have a spoken name");

// pressing a wrong option speaks that letter's name
level = 1; solved = 0; dropTimers(); SPOKEN = [];
nextQuestion();
dropTimers(); SPOKEN = [];
var wrongBtn = null, wrongVal = null, oc = opts();
for (var w2 = 0; w2 < oc.length; w2++) {
  if (oc[w2].attrs["data-value"] !== currentAnswer) { wrongBtn = oc[w2]; wrongVal = oc[w2].attrs["data-value"]; break; }
}
wrongBtn.click();
flushTimers();
check(SPOKEN.length === 1 && SPOKEN[0] === LETTER_SAY[wrongVal],
  "pressing " + wrongVal + " should say '" + LETTER_SAY[wrongVal] + "', got " + SPOKEN.join("/"));
print("wrong press says the letter name: '" + SPOKEN[0] + "'");

// pressing the right option says the letter name first, then the word
level = 1; solved = 0; dropTimers(); SPOKEN = []; SPOKEN_AT = [];
nextQuestion();
dropTimers(); SPOKEN = []; SPOKEN_AT = [];
var rightVal = currentAnswer, theWord = SAY[current.word] || current.word;
var t0 = NOW;
clickCorrect();
runUntil(t0 + 1000);          // early: only the letter name should have played
check(SPOKEN.length === 1 && SPOKEN[0] === LETTER_SAY[rightVal],
  "within 1s only the letter name should play, heard " + SPOKEN.join(" / "));
runUntil(t0 + 2500);          // later: the word follows
check(SPOKEN.length >= 2, "the word should follow the letter name, heard " + SPOKEN.join(" / "));
check(SPOKEN[1] === theWord, "second utterance should be the word, got '" + SPOKEN[1] + "'");
var gap = SPOKEN_AT[1] - SPOKEN_AT[0];
check(gap >= LETTER_NAME_MS,
  "only " + gap + "ms between the letter name and the word, need >= " + LETTER_NAME_MS + "ms");
print("correct press: '" + SPOKEN[0] + "' then '" + SPOKEN[1] + "' " + gap + "ms later");

// the vowel levels stay silent on press
for (var nl = 6; nl <= MAX_LEVEL; nl++) {
  level = nl; solved = 0; dropTimers(); SPOKEN = [];
  nextQuestion();
  dropTimers(); SPOKEN = [];
  var nc = opts();
  for (var nb = 0; nb < nc.length; nb++) {
    if (nc[nb].attrs["data-value"] !== currentAnswer) { nc[nb].click(); break; }
  }
  flushTimers();
  check(SPOKEN.length === 0, "level " + nl + " should not speak a letter name, said " + SPOKEN.join("/"));
}
print("vowel levels 6-" + MAX_LEVEL + " stay silent when an option is pressed");

// --------------------------------------------------------- sound levels
print("");
print("=== sound levels ===");
var SOUND_SPEC = { 14: "OE", 15: "OU", 16: "AEIOU" };
var SOUND_LABEL = { A: "a", E: "e", I: "i", O: "o", U: "u" };

var sTally = {};
for (var sk in NIKUD) {
  var snd = SOUND_OF[NIKUD[sk]];
  sTally[snd] = (sTally[snd] || 0) + 1;
}
print("words per sound: a=" + sTally.A + " e=" + sTally.E + " i=" + sTally.I +
      " o=" + sTally.O + " u=" + sTally.U);
for (var need in SOUND_SPEC) {
  var spec = SOUND_SPEC[need];
  for (var sc = 0; sc < spec.length; sc++) {
    check((sTally[spec.charAt(sc)] || 0) >= 8,
      "level " + need + " sound " + SOUND_LABEL[spec.charAt(sc)] +
      " has only " + (sTally[spec.charAt(sc)] || 0) + " words");
  }
}

for (var sl = 14; sl <= 16; sl++) {
  var want = LEVELS[sl].options || SOUND_SPEC[sl].length;
  var rs = sample(sl, N), ps = [], slo = 100, shi = 0, si;
  for (si = 0; si < SOUND_SPEC[sl].length; si++) {
    var sch = SOUND_SPEC[sl].charAt(si);
    var spct = Math.round((rs.hits[sch] || 0) * 100 / N);
    ps.push(SOUND_LABEL[sch] + " " + spct + "%");
    if (spct < slo) slo = spct;
    if (spct > shi) shi = spct;
  }
  var seven = Math.round(100 / SOUND_SPEC[sl].length);
  check(slo >= seven - 8 && shi <= seven + 8,
    "level " + sl + " unbalanced: " + ps.join(", ") + " (want ~" + seven + "% each)");
  var extras = keysOf(rs.hits);
  for (si = 0; si < extras.length; si++) {
    check(SOUND_SPEC[sl].indexOf(extras[si]) !== -1,
      "level " + sl + " answered " + extras[si] + ", outside spec");
  }
  print("L" + sl + " (" + want + " options): " + ps.join(", "));
}

// level 16 must always show exactly three of the five sounds
level = 16; solved = 0;
var threes = 0, sawAll = {};
for (var q15 = 0; q15 < 600; q15++) {
  nextQuestion();
  var v15 = values();
  if (v15.length === 3) threes++;
  for (var z15 = 0; z15 < v15.length; z15++) sawAll[v15[z15]] = true;
}
check(threes === 600, "level 16 should always show 3 options, got " + threes + "/600");
check(keysOf(sawAll).length === 5, "level 16 should use all five sounds as options");
print("level 16 always shows 3 of the 5 sounds");

// the button faces must use the canonical mark per sound, never leaking the answer
level = 16; solved = 0;
var leak15 = 0;
for (var f15 = 0; f15 < 400; f15++) {
  nextQuestion();
  var vv15 = values(), ff15 = faces(), first15 = current.word.charAt(0);
  for (var b15 = 0; b15 < vv15.length; b15++) {
    var expectFace;
    if (vv15[b15] === "O") expectFace = first15 + VAV + HOLAM;
    else if (vv15[b15] === "U") expectFace = first15 + VAV + DAGESH;
    else expectFace = first15 + SOUND_MARK[vv15[b15]];
    if (ff15[b15] !== expectFace) leak15++;
  }
}
check(leak15 === 0, leak15 + " buttons did not use the canonical mark for their sound");
print("every button uses the canonical mark for its sound (no shape hints)");

level = 14; solved = 0; nextQuestion();
print("sample L14 buttons: " + faces().join("  ") + "   word: " + current.word);
level = 15; solved = 0; nextQuestion();
print("sample L15 buttons: " + faces().join("  ") + "   word: " + current.word);
level = 16; solved = 0; nextQuestion();
print("sample L16 buttons: " + faces().join("  ") + "   word: " + current.word +
      "  reveal: " + revealText());

// the reveal puts holam and shuruk on the vav, not on the first letter
var checkedVav = 0, wrongVav = 0;
for (var rv = 0; rv < 400; rv++) {
  level = 15; solved = 0;
  nextQuestion();
  var cls14 = NIKUD[current.word];
  if ((cls14 === "o" || cls14 === "h" || cls14 === "u") && current.word.charAt(1) === VAV) {
    checkedVav++;
    var want14 = current.word.charAt(0) + VAV +
      (cls14 === "u" ? DAGESH : HOLAM) + current.word.slice(2);
    if (revealText() !== want14) wrongVav++;
  }
}
check(checkedVav > 0 && wrongVav === 0,
  wrongVav + " of " + checkedVav + " reveals put the mark in the wrong place");
print("holam and shuruk reveals sit on the vav (" + checkedVav + " checked)");

// -------------------------------------------------- shva contrast level
print("");
print("=== shva level (13) ===");
var SHVA = "\u05B0";
var r13 = sample(13, N);
var shvaPct = Math.round((r13.hits.s || 0) * 100 / N);
check(shvaPct >= 46 && shvaPct <= 54, "shva is the answer " + shvaPct + "% of the time, want ~50%");
var otherParts = [], ok13 = true;
for (var o13 = 0; o13 < "aqet".length; o13++) {
  var ch13 = "aqet".charAt(o13);
  otherParts.push(NAMES[ch13] + " " + Math.round((r13.hits[ch13] || 0) * 100 / N) + "%");
}
var seen13 = keysOf(r13.hits);
for (var s13 = 0; s13 < seen13.length; s13++) {
  if ("saqet".indexOf(seen13[s13]) === -1) ok13 = false;
}
check(ok13, "level 13 answered outside shva/patah/kamatz/segol/tzere: " + seen13.join(" "));
print("shva " + shvaPct + "%, others " + (100 - shvaPct) + "% (" + otherParts.join(", ") + ")");

// exactly one button is always the shva, whichever way the answer falls
level = 13; solved = 0;
var twoOpts = 0, oneShva = 0, answerShown = 0;
for (var c13 = 0; c13 < 800; c13++) {
  nextQuestion();
  var v13 = values(), shvaCount = 0, hasAnswer = false;
  if (v13.length === 2) twoOpts++;
  for (var k13 = 0; k13 < v13.length; k13++) {
    if (v13[k13] === "s") shvaCount++;
    if (v13[k13] === currentAnswer) hasAnswer = true;
  }
  if (shvaCount === 1) oneShva++;
  if (hasAnswer) answerShown++;
}
check(twoOpts === 800, "level 13 should always show 2 options, got " + twoOpts + "/800");
check(oneShva === 800, "exactly one button should be the shva, held for " + oneShva + "/800");
check(answerShown === 800, "the answer was missing from the options " + (800 - answerShown) + " times");
print("always 2 buttons, exactly one of them the shva, answer always present");

// the shva button renders as the first letter with a shva under it
level = 13; solved = 0;
var faceBad = 0;
for (var fb = 0; fb < 300; fb++) {
  nextQuestion();
  var vf = values(), ff = faces(), firstf = current.word.charAt(0);
  for (var bi = 0; bi < vf.length; bi++) {
    if (ff[bi] !== firstf + MARK[vf[bi]]) faceBad++;
  }
}
check(faceBad === 0, faceBad + " level 13 buttons rendered the wrong mark");
level = 13; solved = 0; nextQuestion();
print("sample L13 buttons: " + faces().join("  ") + "   word: " + current.word +
      "  reveal: " + revealText());

// only hand-vetted shva words may be used as shva examples
var shvaPool = {};
for (var sp in NIKUD) if (NIKUD[sp] === "s") shvaPool[sp] = true;
var notVetted = [];
for (var vp in shvaPool) if (!SHVA_SILENT[vp]) notVetted.push(vp);
check(notVetted.length === 0, "unvetted shva words in play: " + notVetted.join(" "));
print(keysOf(shvaPool).length + " vetted shva words: " + keysOf(shvaPool).join(" "));

level = 13; solved = 0;
var offPool = {};
for (var sq = 0; sq < 800; sq++) {
  nextQuestion();
  if (currentAnswer === "s" && !SHVA_SILENT[current.word]) offPool[current.word] = true;
}
check(keysOf(offPool).length === 0, "shva questions used unvetted words: " + keysOf(offPool).join(" "));
print("every shva question comes from the vetted list");

// ------------------------------------------------------------- worlds
print("");
print("=== worlds ===");
dropTimers();

/* The sky must change after levels 2, 5 and 13 and nowhere else. */
var expectedBoundaries = [3, 6, 14, 17];
var switches = [];
for (var wl = 2; wl <= MAX_LEVEL; wl++) {
  if (worldOf(wl) !== worldOf(wl - 1)) switches.push(wl);
}
check(switches.join(",") === expectedBoundaries.join(","),
  "sky changes entering levels " + switches.join(",") + ", expected " + expectedBoundaries.join(","));
print("sky changes entering levels " + switches.join(", ") + " (after 2, 5, 13 and 16)");

var wmap = [];
for (var wi = 1; wi <= MAX_LEVEL; wi++) wmap.push(worldOf(wi));
print("level -> world: " + wmap.join(" "));
check(worldOf(1) === 0 && worldOf(2) === 0, "levels 1-2 should share the first world");
check(worldOf(5) === 1 && worldOf(3) === 1, "levels 3-5 should share the second world");
check(worldOf(6) === 2 && worldOf(13) === 2, "levels 6-13 should share the third world");
check(worldOf(14) === 3 && worldOf(16) === 3, "levels 14-16 should share the fourth world");
check(worldOf(17) === 4 && worldOf(MAX_LEVEL) === 4, "levels 17+ should share the last world");

// each world needs its own distinct colours
var seenSkies = {};
for (var ws = 0; ws < WORLDS.length; ws++) {
  var sky = skyOf(ws);
  check(!seenSkies[sky], "world " + ws + " reuses another world's colours");
  check(sky.indexOf("undefined") === -1, "world " + ws + " has a broken gradient");
  seenSkies[sky] = true;
}
print(WORLDS.length + " distinct skies");

// crossing a boundary fades the spare layer in, then promotes it
level = 1; solved = 0; shownWorld = -1;
applyWorld(1);
var baseBefore = IDS.sky.style.background;
check(baseBefore.indexOf(WORLDS[0].deep) !== -1, "world 1 should be painted on load");
check(IDS.skyNext.style.opacity !== "1", "nothing should be fading on load");

applyWorld(3);
check(IDS.skyNext.style.opacity === "1", "entering a new world should fade the next sky in");
check(IDS.skyNext.style.background.indexOf(WORLDS[1].deep) !== -1,
  "the fading layer should carry the new world's colours");
check(IDS.sky.style.background === baseBefore, "the base sky should not jump before the fade");
flushTimers();
check(IDS.sky.style.background.indexOf(WORLDS[1].deep) !== -1,
  "after the fade the new sky should become the base");
check(IDS.skyNext.style.opacity === "0", "the spare layer should be reset after the fade");
print("crossing a boundary crossfades, then promotes the new sky");

// staying inside a world must not repaint
var stable = IDS.sky.style.background;
applyWorld(4);
applyWorld(5);
check(IDS.skyNext.style.opacity === "0" && IDS.sky.style.background === stable,
  "moving within a world should not change the sky");
print("moving within a world leaves the sky alone");

// jumping with the picker lands on the right world
IDS.levelPill.click();
IDS.levelPicker.children[MAX_LEVEL - 1].click();
flushTimers();
check(shownWorld === worldOf(MAX_LEVEL), "jumping to the last level should land in its world");
print("the level picker moves the sky too");

// an interrupted fade must not strand the spare layer
level = 1; solved = 0; shownWorld = -1; dropTimers();
applyWorld(1);
applyWorld(3);              // start a fade
applyWorld(6);              // interrupt it before it finishes
check(IDS.skyNext.style.opacity === "1", "the second fade should still be running");
check(IDS.sky.style.background.indexOf(WORLDS[1].deep) !== -1,
  "the interrupted world should have been committed as the base");
flushTimers();
check(IDS.sky.style.background.indexOf(WORLDS[2].deep) !== -1,
  "the final world should win after an interrupted fade");
check(IDS.skyNext.style.opacity === "0", "the spare layer should end up hidden");
print("an interrupted crossfade settles on the final world");

// -------------------------------------------------------- reading levels
print("");
print("=== reading levels (17 picture->word, 18 word->picture) ===");
dropTimers();

check(LEVELS[17].mode === "readword", "level 17 should be picture -> word");
check(LEVELS[18].mode === "readpic", "level 18 should be word -> picture");

// every word must have a vocalized form to show, and they must be unique
var noNikud = [], seenVoc = {}, dupVoc = [];
for (var wi = 0; wi < WORDS.length; wi++) {
  var vw = WORDS[wi].word;
  if (!SAY[vw]) noNikud.push(vw);
  if (seenVoc[vocalized(vw)]) dupVoc.push(vw);
  seenVoc[vocalized(vw)] = true;
}
check(noNikud.length === 0, "words with no vocalized form: " + noNikud.join(" "));
check(dupVoc.length === 0, "two words share a vocalized form: " + dupVoc.join(" "));
print(WORDS.length + " words all have a unique vocalized spelling");

// level 17: three written words, one correct, all distinct
level = 17; solved = 0;
var badCount = 0, missing = 0, dupOpt = 0, plainShown = 0, sameAsAnswer = 0;
for (var q17 = 0; q17 < 600; q17++) {
  nextQuestion();
  var v17 = values(), f17 = faces(), uniq = {}, hasAnswer = false, j;
  if (v17.length !== 3) badCount++;
  for (j = 0; j < v17.length; j++) {
    uniq[v17[j]] = true;
    if (v17[j] === currentAnswer) hasAnswer = true;
    if (f17[j] !== vocalized(v17[j])) plainShown++;
  }
  if (!hasAnswer) missing++;
  if (keysOf(uniq).length !== v17.length) dupOpt++;
  if (currentAnswer !== current.word) sameAsAnswer++;
}
check(badCount === 0, "level 17 showed the wrong number of options " + badCount + " times");
check(missing === 0, "level 17 omitted the answer " + missing + " times");
check(dupOpt === 0, "level 17 repeated an option " + dupOpt + " times");
check(plainShown === 0, "level 17 showed " + plainShown + " options without nikud");
check(sameAsAnswer === 0, "level 17 answer key does not match the word");
print("level 17: 3 vocalized words, answer always present, never duplicated");

// the picture is shown and the word is never revealed up front
level = 17; solved = 0; nextQuestion();
check(IDS.picture._text === current.pic, "level 17 should show the picture");
check(IDS.word._text === "", "level 17 leaked the word before it was earned");
check(IDS.sayrow._cls.indexOf("hidden") === -1, "level 17 should offer the listen button");
print("level 17 card: " + IDS.picture._text + "   options: " + faces().join("   "));

// level 18: three pictures, one correct, the word is the question
level = 18; solved = 0;
var picBad = 0, picMissing = 0, picDup = 0, notEmoji = 0;
for (var q18 = 0; q18 < 600; q18++) {
  nextQuestion();
  var v18 = values(), f18 = faces(), u18 = {}, has18 = false, k;
  if (v18.length !== 3) picBad++;
  for (k = 0; k < v18.length; k++) {
    u18[v18[k]] = true;
    if (v18[k] === currentAnswer) has18 = true;
    if (f18[k] !== BY_WORD[v18[k]].pic) notEmoji++;
  }
  if (!has18) picMissing++;
  if (keysOf(u18).length !== v18.length) picDup++;
}
check(picBad === 0, "level 18 showed the wrong number of options " + picBad + " times");
check(picMissing === 0, "level 18 omitted the answer " + picMissing + " times");
check(picDup === 0, "level 18 repeated a picture " + picDup + " times");
check(notEmoji === 0, "level 18 showed " + notEmoji + " options that were not pictures");
print("level 18: 3 pictures, answer always present, never duplicated");

level = 18; solved = 0; nextQuestion();
check(IDS.picture._text === vocalized(current.word), "level 18 should show the vocalized word");
check(IDS.picture._cls.indexOf("asword") !== -1, "level 18 should style the card as text");
check(IDS.sayrow._cls.indexOf("hidden") !== -1, "level 18 must hide the listen button");
check(IDS.word._text === "", "level 18 leaked the answer before it was earned");
print("level 18 card: " + IDS.picture._text + "   options: " + faces().join("  "));

// level 18 must stay silent until the child has answered, then speak the word
level = 18; solved = 0; dropTimers(); SPOKEN = [];
nextQuestion();
flushTimers();
check(SPOKEN.length === 0, "level 18 spoke the word before the answer: " + SPOKEN.join("/"));
IDS.say.click();
flushTimers();
check(SPOKEN.length === 0, "level 18 read the word aloud on demand, which gives it away");
var theWord18 = vocalized(current.word);
clickCorrect();
flushTimers();
check(SPOKEN.length > 0 && SPOKEN[SPOKEN.length - 1] === theWord18,
  "level 18 should read the word out once answered, heard " + SPOKEN.join(" / "));
print("level 18 stays silent until answered, then reads the word as a reward");

// level 17 may speak freely
level = 17; solved = 0; dropTimers(); SPOKEN = [];
nextQuestion();
flushTimers();
check(SPOKEN.length === 1, "level 17 should read the word out, heard " + SPOKEN.length);
print("level 17 reads the word out as usual");

// distractors have to be genuinely confusable
var sharedFirst = 0, sameLen = 0, total17 = 0;
level = 17; solved = 0;
for (var d17 = 0; d17 < 600; d17++) {
  nextQuestion();
  var dv = values();
  for (var di = 0; di < dv.length; di++) {
    if (dv[di] === currentAnswer) continue;
    total17++;
    if (dv[di].charAt(0) === currentAnswer.charAt(0)) sharedFirst++;
    if (dv[di].length === currentAnswer.length) sameLen++;
  }
}
var pctFirst = Math.round(sharedFirst * 100 / total17);
var pctLen = Math.round(sameLen * 100 / total17);
check(pctFirst >= 50, "only " + pctFirst + "% of distractors share the opening letter");
check(pctLen >= 50, "only " + pctLen + "% of distractors match the word length");
print("distractors share the opening letter " + pctFirst + "% and the length " + pctLen + "% of the time");

// a word must never be offered against itself
level = 18; solved = 0;
var selfClash = 0;
for (var s18 = 0; s18 < 400; s18++) {
  nextQuestion();
  var sv = values(), hits = 0;
  for (var sj = 0; sj < sv.length; sj++) if (sv[sj] === currentAnswer) hits++;
  if (hits !== 1) selfClash++;
}
check(selfClash === 0, "the answer appeared more than once in " + selfClash + " rounds");
print("the answer is offered exactly once per round");

print("");
print(failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED");
