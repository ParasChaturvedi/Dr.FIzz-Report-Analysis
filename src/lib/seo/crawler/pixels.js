// src/lib/seo/crawler/pixels.js
// EXACT JS PORT of the doctorfizz-site-crawler skill's scripts/pixels.py.
// Per-character SERP pixel-width table for titles/descriptions (Google truncates by
// pixels, not chars). Fixed table => same string always yields the same width.
// RULE 0: no em dashes or en dashes anywhere.

const _W = {
  " ": 0.28, "!": 0.28, '"': 0.35, "#": 0.56, "$": 0.56, "%": 0.89, "&": 0.67,
  "'": 0.19, "(": 0.33, ")": 0.33, "*": 0.39, "+": 0.58, ",": 0.28, "-": 0.33,
  ".": 0.28, "/": 0.28, "0": 0.56, "1": 0.56, "2": 0.56, "3": 0.56, "4": 0.56,
  "5": 0.56, "6": 0.56, "7": 0.56, "8": 0.56, "9": 0.56, ":": 0.28, ";": 0.28,
  "<": 0.58, "=": 0.58, ">": 0.58, "?": 0.56, "@": 1.01,
  "A": 0.67, "B": 0.67, "C": 0.72, "D": 0.72, "E": 0.67, "F": 0.61, "G": 0.78,
  "H": 0.72, "I": 0.28, "J": 0.5, "K": 0.67, "L": 0.56, "M": 0.83, "N": 0.72,
  "O": 0.78, "P": 0.67, "Q": 0.78, "R": 0.72, "S": 0.67, "T": 0.61, "U": 0.72,
  "V": 0.67, "W": 0.94, "X": 0.67, "Y": 0.67, "Z": 0.61,
  "[": 0.28, "\\": 0.28, "]": 0.28, "^": 0.47, "_": 0.56, "`": 0.33,
  "a": 0.56, "b": 0.56, "c": 0.5, "d": 0.56, "e": 0.56, "f": 0.28, "g": 0.56,
  "h": 0.56, "i": 0.22, "j": 0.22, "k": 0.5, "l": 0.22, "m": 0.83, "n": 0.56,
  "o": 0.56, "p": 0.56, "q": 0.56, "r": 0.33, "s": 0.5, "t": 0.28, "u": 0.56,
  "v": 0.5, "w": 0.72, "x": 0.5, "y": 0.5, "z": 0.5,
  "{": 0.33, "|": 0.26, "}": 0.33, "~": 0.58,
};
const _DEFAULT = 0.6;
const _TITLE_SCALE = 10.0;
const _DESC_SCALE = 7.0;

// Python round() is banker's rounding (round half to even). Match it exactly.
function pyRound(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

function _raw(text) {
  let sum = 0;
  for (const ch of text || "") sum += _W[ch] != null ? _W[ch] : _DEFAULT;
  return sum;
}

export function titlePixels(text) { return pyRound(_raw(text) * _TITLE_SCALE); }
export function descPixels(text) { return pyRound(_raw(text) * _DESC_SCALE); }

export default { titlePixels, descPixels };
