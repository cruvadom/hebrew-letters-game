# משחק האותיות — Hebrew Letters Game

A single-file browser game for children learning to read Hebrew. A picture appears,
the word is read aloud, and the child picks the right letter or vowel.

No build step, no server, no internet, no dependencies — just one HTML file.
Open it and play.

![levels](https://img.shields.io/badge/levels-15-f5a623) ![words](https://img.shields.io/badge/words-280-2f9e44) ![license](https://img.shields.io/badge/license-MIT-blue)

## Playing

Download `index.html` and double-click it. That's it.

Each round shows an emoji picture, speaks the Hebrew word, and offers big letter
buttons. A correct answer on the first try earns a star and advances the level
progress; a wrong answer just lets the child try again, with no penalty beyond
not scoring that round. Finishing the last level awards a trophy and starts over.

Tap the level pill in the corner to jump straight to any level.

### Sound

The game speaks each word using the browser's built-in speech engine, and feeds it
a fully vocalized spelling (`סֻלָּם` rather than `סולם`) so the pronunciation is
correct — unpointed Hebrew forces the engine to guess the vowels, and it often
guesses wrong.

macOS needs a Hebrew voice installed:
**System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → Hebrew (Carmit)**

Without one, the game still plays normally and the speaker button says so.

## Levels

| # | Task | Choices |
|---|------|---------|
| 1 | First letter | ב ג ד ז ח ט כ ל מ נ ס פ צ ק ר ש ת |
| 2 | First letter | 75% א ה ו י ע, 25% the level 1 letters |
| 3 | Last letter | the level 1 letters |
| 4 | Last letter | 75% ך ם ן ף ץ, 25% the level 1 letters |
| 5 | Last letter | 75% א ה ו י, 25% anything else |
| 6 | First vowel | patah vs hirik |
| 7 | First vowel | kamatz vs hirik |
| 8 | First vowel | hirik+yud vs patah |
| 9 | First vowel | segol vs patah |
| 10 | First vowel | patah vs hirik+yud vs segol |
| 11 | First vowel | tzere vs hirik |
| 12 | First vowel | tzere vs kamatz vs hirik+yud |
| 13 | First **sound** | o vs e |
| 14 | First **sound** | o vs u |
| 15 | First **sound** | three of a / e / i / o / u |

Levels 6–12 ask for the exact nikud mark. Levels 13–15 ask for the vowel *sound*,
grouping the marks that share one: **a** is patah or kamatz, **e** is segol or tzere,
**i** is hirik with or without a yud, **o** is holam male (שׁוֹ) or holam haser (שֹׁ),
and **u** is shuruk (שׁוּ). Each sound button always shows the same canonical mark,
so the shape of the mark never hints at which answer is right.

Within a level, answers are sampled so that rare letters still appear regularly and
the vowel levels stay close to an even split between their options. Distractors are
drawn from the same group as the answer, so a question about a final letter offers
other final letters rather than easy giveaways.

## Settings

At the top of the `<script>` block in `index.html`:

```js
var CONFIG = {
  correctAnswersPerLevel: 10,  // correct answers needed to clear a level
  numberOfLevels: 15           // play only the first N levels, then the trophy
};
```

Set `numberOfLevels` to 6 and levels 7–15 are skipped entirely: finishing level 6
awards the trophy and returns to level 1.

## Adding words

Add an entry to `WORDS` and its vocalized spelling to `SAY`:

```js
{ pic: "🦒", word: "ג'ירפה", letter: "ג" },   // in WORDS
"ג'ירפה": "גִ'ירָפָה",                        // in SAY
```

The vowel levels pick the word up automatically — the first vowel is derived from
the vocalized spelling, so there is no third list to maintain. Words whose first
vowel is a hataf or a qubuts are simply skipped by the vowel levels.

## Tests

The game logic runs headlessly against a small fake DOM:

```sh
jjs test/run-tests.js
```

This checks the letter pools and their 75/25 splits, the even balance of the vowel
levels, that the answer is never shown before it is earned, level progression and
the trophy, the level picker, and that speech is never dropped or left silent.

## License

MIT
