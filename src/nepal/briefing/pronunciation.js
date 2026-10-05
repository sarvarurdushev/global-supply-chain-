/**
 * How the narration is SAID, as opposed to how it reads.
 *
 * Two layers, both applied only to speech, never to captions:
 *
 *   SPOKEN FORMS (`spokenText`) — clock times, "M7.8", "km", "%" and the
 *   like turned into words a voice says correctly. Used for every engine,
 *   neural and system, because "06:11" is otherwise read "zero six eleven".
 *
 *   LEXICON (`neuralText`) — place names and acronyms the neural voice's G2P
 *   gets wrong, written as misaki pronunciation links `[Word](/phonemes/)`
 *   in misaki's American phoneme set (A = eɪ, I = aɪ, O = oʊ, W = aʊ).
 *   Checked against the G2P's own output: "Sindhupalchok" came out
 *   "sind-hyu-pal-chok", "UNOSAT" letter by letter. Nepali names are given
 *   their common English pronunciation; a native speaker would say them
 *   differently, and the limitation is stated in the audio research.
 */

/** Ordered: longer forms first, so "Sundar Bazar" wins over a single word. */
export const LEXICON = Object.freeze([
  ['Sundar Bazar', 'sˈʊndəɹ bəzˈɑɹ'],
  ['Sindhupalchok', 'sˌɪndupˌælʧˈOk'],
  ['Kavrepalanchok', 'kˌʌvɹApˌʌlənʧˈOk'],
  ['Okhaldhunga', 'ˌOkəldˈʊŋɡə'],
  ['Ramechhap', 'ɹˈɑmAʧˌæp'],
  ['Sindhuli', 'sˈɪnduli'],
  ['Nuwakot', 'nˈuwəkˌOt'],
  ['Dolakha', 'dˈOləkə'],
  ['Manbu', 'mˈʌnbu'],
  ['Chitawan', 'ʧˈɪtəwən'],
  ['Chitwan', 'ʧˈɪtwən'],
  ['Dhading', 'dˈɑdɪŋ'],
  ['Lamjung', 'lˈʌmʤʊŋ'],
  ['Rasuwa', 'ɹəsˈuwə'],
  ['Bharatpur', 'bˈʌɹətpʊɹ'],
  ['Bhaktapur', 'bˈʌktəpʊɹ'],
  ['UNOSAT', 'jˈunOsˌæt'],
  ['Cramér’s', 'kɹɑmˈɛɹz'],
  ["Cramér's", 'kɹɑmˈɛɹz'],
  ['Mercalli', 'mɜɹkˈɑli'],
  ['Omori', 'Omˈɔɹi'],
]);

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';

/** Rules from written to spoken form, applied in order. */
const SPOKEN = [
  /* 06:11 UTC → 6 11 UTC ("six eleven"), a time said the way people say it. */
  [
    /\b0?(\d{1,2}):(\d{2})\b/g,
    (_, h, m) => `${Number(h)} ${m === '00' ? "o'clock" : m}`,
  ],
  /* M7.8 / M4-5 → magnitude 7.8 / magnitude 4 to 5 */
  [/\bM(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\b/g, 'magnitude $1 to $2'],
  [/\bM(\d+(?:\.\d+)?)\+/g, 'magnitude $1 and above'],
  [/\bM(\d+(?:\.\d+)?)\b/g, 'magnitude $1'],
  /* 10-20 km → 10 to 20 kilometres */
  [/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*km\b/g, '$1 to $2 kilometres'],
  [/\b(\d+(?:\.\d+)?)\s*km²/g, '$1 square kilometres'],
  [/\b(\d+(?:\.\d+)?)\s*km\b/g, '$1 kilometres'],
  [/\b(\d+(?:\.\d+)?)\s*m\b(?![²a-z])/g, '$1 metres'],
  [/(\d)\s*%/g, '$1 percent'],
  /* 25 Apr 2015 written short → the month in full */
  [
    /\b(\d{1,2}) (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g,
    (_, d, m) => `${d} ${MONTH_NAMES[m]}`,
  ],
  /* 04 May → 4 May: a leading zero in a date is not said */
  [new RegExp(`\\b0(\\d) (${MONTHS})\\b`, 'g'), '$1 $2'],
  /* MMI VI+ → intensity six or stronger: the numeral said as a number */
  [
    /\bMMI\s+(VIII|VII|VI|IX|V)(\+)?/g,
    (_, r, plus) => `intensity ${ROMAN[r]}${plus ? ' or stronger' : ''}`,
  ],
  [/\bMMI\s+(\d+(?:\.\d+)?)/g, 'intensity $1'],
  [/\bMMI\b/g, 'M M I'],
  [/\bOSM\b/g, 'OpenStreetMap'],
  [/×/g, 'by'],
  [/≥/g, 'at least'],
  [/→/g, 'to'],
];

const ROMAN = Object.freeze({
  V: 'five',
  VI: 'six',
  VII: 'seven',
  VIII: 'eight',
  IX: 'nine',
});

const MONTH_NAMES = Object.freeze({
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  Jun: 'June',
  Jul: 'July',
  Aug: 'August',
  Sep: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
});

/** Written narration → what any voice should say. Captions are not touched. */
export function spokenText(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of SPOKEN)
    out = out.replace(pattern, replacement);
  return out.replace(/\s{2,}/g, ' ').trim();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Spoken text → the neural G2P's input: lexicon words as pronunciation
 * links, emphasised phrases as stress links `[phrase](+1)`. An emphasised
 * phrase that contains a lexicon word keeps the lexicon form (links cannot
 * nest); the stress then comes from the sentence's own delivery.
 */
export function neuralText(spoken, emphasis = []) {
  let out = spoken;
  const marked = [];
  for (const phrase of emphasis) {
    const at = out.toLowerCase().indexOf(String(phrase).toLowerCase());
    if (at < 0) continue;
    const original = out.slice(at, at + phrase.length);
    if (LEXICON.some(([word]) => original.includes(word))) continue;
    const token = `\u0000${marked.length}\u0000`;
    marked.push(`[${original}](+1)`);
    out = out.slice(0, at) + token + out.slice(at + phrase.length);
  }
  for (const [word, phonemes] of LEXICON)
    out = out.replace(
      new RegExp(`(?<![\\w\\[])${escape(word)}(?![\\w\\]])`, 'g'),
      `[${word}](/${phonemes}/)`,
    );
  marked.forEach((link, k) => {
    out = out.replace(`\u0000${k}\u0000`, link);
  });
  return out;
}

/** For tests: the month names the spoken forms expand to. */
export const SPOKEN_MONTHS = MONTHS;
