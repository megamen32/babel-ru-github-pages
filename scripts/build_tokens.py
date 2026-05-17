#!/usr/bin/env python3
"""
build_tokens.py — Upgraded token-dictionary builder for the Library of Babel prefix codec (v2)

Collects frequency word lists, generates bigrams/trigrams from frequency data,
expands emoji coverage, and outputs data/tokens.ru-en.v2.json.

Data sources:
  - wordfreq (Python): pip install wordfreq  — provides top_n_list() and word_frequency()

Usage:
  python3 scripts/build_tokens.py [--output data/tokens.ru-en.v2.json] \\
      [--ru-words 50000] [--en-words 50000] \\
      [--ru-bigrams 20000] [--en-bigrams 20000] \\
      [--ru-trigrams 5000] [--en-trigrams 5000] \\
      [--emoji 2000]
"""

import json
import argparse
import os
import sys
import heapq
import time
import unicodedata

# ═══════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════

DEFAULT_RU_WORDS    = 50000
DEFAULT_EN_WORDS    = 50000
DEFAULT_RU_BIGRAMS  = 20000
DEFAULT_EN_BIGRAMS  = 20000
DEFAULT_RU_TRIGRAMS = 5000
DEFAULT_EN_TRIGRAMS = 5000
DEFAULT_EMOJI       = 2000

# How many top words to use as the source vocabulary for n-gram generation
BIGRAM_VOCAB_SIZE   = 2000   # → up to 4M pair combos
TRIGRAM_VOCAB_SIZE  = 200    # → up to 8M triple combos (kept small for speed)

# Scale factor: wordfreq returns ~0.03 for the most frequent word;
# multiplying by 10^7 gives weights in the ~300 000 range.
FREQ_SCALE = 10_000_000

# ─── Token types ───

TOKEN_TYPES = [
    "space",        # 0
    "newline",      # 1
    "dot",          # 2
    "punct",        # 3
    "word_ru",      # 4
    "word_en",      # 5
    "phrase_ru",    # 6
    "phrase_en",    # 7
    "emoji",        # 8
    "raw_char",     # 9
]

# ═══════════════════════════════════════════════════════════
# Built-in data
# ═══════════════════════════════════════════════════════════

BUILTIN_PUNCT = [
    # ── Core punctuation ──
    ",", "!", "?", ";", ":", "—", "…", "«", "»",
    "(", ")", "#", "@", "-", "/", "*", "=", "+",
    "[", "]", "{", "}", "<", ">", "~", "`", "^", "|",
    "\\", "&", "%", "$", "'", "\"",
    # ── Dashes & hyphens ──
    "–", "−", "‒", "―",
    # ── Bullets & mid-dots ──
    "•", "·", "◦", "‣",
    # ── Quotation marks ──
    "„", "‟", "‹", "›", "‛", "‚", "〃",
    # ── Inverted & interrobang ──
    "¡", "¿", "‽",
    # ── Section / paragraph ──
    "§", "¶", "⁋", "※", "⁂",
    # ── Primes ──
    "′", "″", "‴",
    # ── Number signs ──
    "№", "‰", "‱",
    # ── Overlines / macrons ──
    "‗", "¯", "‾",
    # ── Legal / trademark ──
    "©", "®", "™",
    # ── Degree ──
    "°",
    # ── Math operators ──
    "±", "×", "÷", "≠", "≈", "≤", "≥", "∞",
    "√", "∑", "∏", "∫", "∂", "∇",
    "¬", "∧", "∨", "⊕", "⊗", "⊥",
    "π", "Ω", "µ", "∆",
    "∈", "∉", "⊂", "⊃", "∪", "∩",
    # ── Arrows ──
    "←", "→", "↑", "↓", "↔", "↕",
    "⇐", "⇒", "⇑", "⇓", "⇔",
    "↗", "↘", "↙", "↖",
    # ── Geometric shapes ──
    "■", "□", "▪", "▫", "●", "○", "◆", "◇",
    "▲", "▼", "►", "◄",
    # ── Superscript / subscript digits ──
    "⁰", "¹", "²", "³", "⁴", "ⁿ",
    "₀", "₁", "₂", "₃",
    # ── Currency ──
    "€", "£", "¥", "¢", "¤",
    "₽", "₴", "₿", "₹", "₩", "₪", "₫", "₱",
    # ── Specialized ──
    "⁄", "⁊",
    "℮",
    # ── Check / cross marks ──
    "✓", "✗",
]

BUILTIN_EMOJI = [
    "🔥","⭐","💯","❌","✅","🎉","💀","👻","🧠","❤",
    "👍","👎","👋","💪","🙏","😂","😭","😤","🥺","🤔",
    "💬","📱","💻","🌍","🎵","☕","🎯","⚡","💎","🔑",
    "🚀","🌙","🎮","🏆","🍺","🌸","🦋","🐱","🐶","🌈",
    "💡","📖","🔔","😎","🥳","💙","🖤","🤷","🤩","💢",
    "✨","💫","🌊","🍀","🍂","🌻","🌺","🌲","🌳","🌴",
]

BUILTIN_RU_PHRASES = [
    "я тебя", "в том числе", "с одной стороны", "в общем", "в конце концов",
    "в любом случае", "по крайней мере", "на самом деле", "в первую очередь",
    "как правило", "в частности", "в связи с", "в отличие от",
    "в соответствии с", "на протяжении", "по отношению к", "в результате",
    "на основании", "в целях", "в области", "в виде", "в процессе", "в случае",
    "на основе", "по поводу", "при этом", "в ходе", "в направлении",
    "в составе", "в качестве", "в отношении", "за счёт", "на уровне",
    "в течение", "с точки зрения", "до сих пор", "так или иначе",
    "тем не менее", "в то же время", "в то время как", "как бы то ни было",
    "несмотря на то", "в силу того", "в зависимости от", "наряду с",
    "вместе с тем", "исходя из", "по сравнению с", "в дополнение к",
    "помимо этого", "сверх того", "более того", "кроме того", "к тому же",
    "в свою очередь", "в конечном счёте", "в конечном итоге", "в итоге",
    "в целом", "например", "а именно", "то есть", "иначе говоря",
    "иными словами", "одним словом", "короче говоря", "проще говоря",
    "точнее говоря", "скорее всего", "может быть", "должно быть",
    "вероятно", "очевидно", "безусловно", "конечно", "разумеется",
    "действительно", "в самом деле", "на практике", "по сути",
    "по существу", "в принципе", "к счастью", "к сожалению",
    "к удивлению", "к слову", "кстати", "между прочим", "вдобавок",
    "мало того", "не только", "для того чтобы", "после того как",
    "перед тем как", "до того как", "с тех пор как", "как только",
    "прежде чем", "пока не", "я не знаю", "я думаю", "я хочу",
    "я могу", "я буду", "мне кажется", "не знаю", "не могу",
    "не хочу", "не буду", "надо сказать", "стоит отметить",
    "следует отметить", "необходимо отметить", "важно понимать",
    "остаётся только", "ничего подобного", "ничего страшного",
    "всё равно", "всё ещё", "всё нормально", "всё хорошо",
    "всё отлично", "всё понятно", "не обязательно", "вполне возможно",
    "самое главное", "самое важное", "самое интересное",
    "с другой стороны", "и при этом", "но при этом",
    "вот и всё", "вот именно", "вот это да", "ну и что",
    "ну конечно", "ладно давай", "я тебя люблю", "послушай меня",
    "подожди немного", "иди сюда", "не уходи", "мы вместе",
    "где мы", "зачем это нужно", "почему так", "как это работает",
    "что это значит", "кто это сделал", "сколько стоит",
    "очень много", "очень мало", "очень хорошо", "очень плохо",
    "очень важно", "очень интересно",
]

BUILTIN_EN_PHRASES = [
    "i love you", "i want to", "i need to", "i have to", "i am going to",
    "i would like", "i think that", "i know that", "i believe that",
    "it was a", "it is a", "there is a", "there are no", "that is why",
    "in order to", "as well as", "at the same time", "on the other hand",
    "in fact", "in addition", "in particular", "in general", "in other words",
    "for example", "for instance", "of course", "as a result",
    "by the way", "on the contrary", "in contrast", "nevertheless",
    "furthermore", "moreover", "therefore", "consequently", "meanwhile",
    "otherwise", "regardless", "instead", "however", "thus", "hence",
    "to be honest", "to tell the truth", "to begin with", "to sum up",
    "in conclusion", "after all", "above all", "at last", "at least",
    "the problem is", "the question is", "the point is", "the fact is",
    "it seems that", "it appears that", "it turns out",
    "do you know", "do you think", "do you want", "can you help",
    "how does it work", "how do you know", "how can i help",
    "why do you think", "why is it so", "what does it mean",
]

# ═══════════════════════════════════════════════════════════
# Emoji generation from Unicode ranges
# ═══════════════════════════════════════════════════════════

EMOJI_RANGES = [
    (0x1F600, 0x1F64F),   # Emoticons
    (0x1F300, 0x1F5FF),   # Misc Symbols and Pictographs
    (0x1F680, 0x1F6FF),   # Transport and Map
    (0x1F1E0, 0x1F1FF),   # Flags (regional indicators — single codepoints)
    (0x2600,  0x26FF),    # Misc symbols
    (0x2700,  0x27BF),    # Dingbats
    (0x1F900, 0x1F9FF),   # Supplemental Symbols and Pictographs
    (0x1FA00, 0x1FA6F),   # Chess Symbols
    (0x1FA70, 0x1FAFF),   # Symbols Extended-A
    (0x1F780, 0x1F7FF),   # Geometric Shapes Extended
    (0x2300,  0x23FF),    # Misc Technical (some emoji)
    (0x2B50,  0x2BFF),    # Misc Symbols and Arrows
]

# Codepoints to exclude (not standalone emoji)
EMOJI_EXCLUDE = set()
for _s, _e in [
    (0x1F3FB, 0x1F3FF),   # Skin tone modifiers
    (0x1F9B0, 0x1F9B3),   # Hair components
    (0xFE0F,  0xFE0F),    # Variation selector-16
    (0xFE0E,  0xFE0E),    # Variation selector-15
    (0x200D,  0x200D),    # ZWJ
    (0xE0020, 0xE007F),   # Tags
]:
    for _cp in range(_s, _e + 1):
        EMOJI_EXCLUDE.add(_cp)


def generate_emoji(target_count):
    """Generate emoji list from Unicode ranges, filtering to valid single-codepoint emoji."""
    emoji_list = []
    seen = set()

    # First include built-in emoji (known-good, high-priority)
    for e in BUILTIN_EMOJI:
        if e not in seen:
            seen.add(e)
            emoji_list.append(e)

    # Then scan Unicode ranges in order
    for start, end in EMOJI_RANGES:
        for cp in range(start, end + 1):
            if cp in EMOJI_EXCLUDE:
                continue
            try:
                ch = chr(cp)
            except (ValueError, OverflowError):
                continue
            if ch in seen:
                continue
            # Basic filter: skip unassigned and control characters
            try:
                cat = unicodedata.category(ch)
                if cat in ('Cn', 'Cc', 'Cs', 'Co'):
                    continue
            except (ValueError, TypeError):
                continue
            seen.add(ch)
            emoji_list.append(ch)
            if len(emoji_list) >= target_count:
                break
        if len(emoji_list) >= target_count:
            break

    return emoji_list[:target_count]


# ═══════════════════════════════════════════════════════════
# Word loading
# ═══════════════════════════════════════════════════════════

def load_words_from_wordfreq(lang, limit):
    """Load words from wordfreq library. Returns list of lowercase words."""
    try:
        from wordfreq import top_n_list
    except ImportError:
        print("ERROR: wordfreq not installed.  Run:  pip install wordfreq",
              file=sys.stderr)
        sys.exit(1)
    words = top_n_list(lang, limit)
    # wordfreq already returns lowercase, but be safe
    words = [w.lower() for w in words]
    print(f"  wordfreq: loaded {len(words)} {lang} words")
    return words


def load_word_frequencies(lang, words):
    """Load actual frequencies for a list of words using wordfreq.word_frequency()."""
    from wordfreq import word_frequency
    freqs = [word_frequency(w, lang) for w in words]
    nonzero = sum(1 for f in freqs if f > 0)
    print(f"  frequencies: {nonzero} non-zero / {len(freqs)} total")
    return freqs


# ═══════════════════════════════════════════════════════════
# N-gram generation  (memory-efficient via heapq.nlargest)
# ═══════════════════════════════════════════════════════════

def generate_bigrams(words, freqs, limit, lang_label):
    """Generate top-`limit` bigrams by product of word frequencies.

    Uses heapq.nlargest on a generator so only the top-K items are kept
    in memory at once (not the full N² matrix).

    Returns (bigram_tokens, bigram_weights) where weights are already
    scaled: min(freq_i, freq_j) * 0.5 * FREQ_SCALE.
    """
    n = min(BIGRAM_VOCAB_SIZE, len(words))
    w = words[:n]
    f = freqs[:n]

    if n < 2:
        print(f"  {lang_label}: not enough words for bigrams")
        return [], []

    total_combos = n * n
    print(f"  {lang_label}: generating bigrams from top {n} words "
          f"({total_combos:,} combinations)...")

    t0 = time.time()

    # Generator yields (product, i, j) — kept lightweight so the heap
    # only stores the top `limit` entries.
    def _gen():
        for i in range(n):
            fi = f[i]
            if fi <= 0:
                continue
            for j in range(n):
                fj = f[j]
                if fj <= 0:
                    continue
                yield (fi * fj, i, j)

    top = heapq.nlargest(limit, _gen())

    elapsed = time.time() - t0
    bigram_tokens  = [f"{w[i]} {w[j]}" for _, i, j in top]
    bigram_weights = [int(min(f[i], f[j]) * 0.5 * FREQ_SCALE) for _, i, j in top]

    print(f"  {lang_label}: {len(bigram_tokens)} bigrams in {elapsed:.1f}s "
          f"(top weight: {bigram_weights[0] if bigram_weights else 0})")
    return bigram_tokens, bigram_weights


def generate_trigrams(words, freqs, limit, lang_label):
    """Generate top-`limit` trigrams by product of word frequencies.

    Source vocabulary is capped at TRIGRAM_VOCAB_SIZE (default 200)
    to keep the N³ search space manageable (200³ = 8 M combos).

    Returns (trigram_tokens, trigram_weights) where weights are already
    scaled: min(freq_i, freq_j, freq_k) * 0.3 * FREQ_SCALE.
    """
    n = min(TRIGRAM_VOCAB_SIZE, len(words))
    w = words[:n]
    f = freqs[:n]

    if n < 3:
        print(f"  {lang_label}: not enough words for trigrams")
        return [], []

    total_combos = n ** 3
    print(f"  {lang_label}: generating trigrams from top {n} words "
          f"({total_combos:,} combinations)...")

    t0 = time.time()

    def _gen():
        for i in range(n):
            fi = f[i]
            if fi <= 0:
                continue
            for j in range(n):
                fj = f[j]
                if fj <= 0:
                    continue
                for k in range(n):
                    fk = f[k]
                    if fk <= 0:
                        continue
                    yield (fi * fj * fk, i, j, k)

    top = heapq.nlargest(limit, _gen())

    elapsed = time.time() - t0
    trigram_tokens  = [f"{w[i]} {w[j]} {w[k]}" for _, i, j, k in top]
    trigram_weights = [int(min(f[i], f[j], f[k]) * 0.3 * FREQ_SCALE)
                       for _, i, j, k in top]

    print(f"  {lang_label}: {len(trigram_tokens)} trigrams in {elapsed:.1f}s "
          f"(top weight: {trigram_weights[0] if trigram_weights else 0})")
    return trigram_tokens, trigram_weights


# ═══════════════════════════════════════════════════════════
# Main dictionary builder
# ═══════════════════════════════════════════════════════════

def build_dictionary(args):
    print("=" * 60)
    print("Building token dictionary v2")
    print("=" * 60)
    print(f"  RU words:      {args.ru_words}")
    print(f"  EN words:      {args.en_words}")
    print(f"  RU bigrams:    {args.ru_bigrams}")
    print(f"  EN bigrams:    {args.en_bigrams}")
    print(f"  RU trigrams:   {args.ru_trigrams}")
    print(f"  EN trigrams:   {args.en_trigrams}")
    print(f"  Emoji target:  {args.emoji}")
    print()

    # ─── Load words ─────────────────────────────────────────
    print("── Loading Russian words ──")
    ru_words = load_words_from_wordfreq('ru', args.ru_words)
    # Deduplicate preserving order
    _seen = set()
    ru_words = [w for w in ru_words if w not in _seen and not _seen.add(w)]
    ru_words = ru_words[:args.ru_words]
    print(f"  Total: {len(ru_words)}")
    print()

    print("── Loading English words ──")
    en_words = load_words_from_wordfreq('en', args.en_words)
    _seen = set()
    en_words = [w for w in en_words if w not in _seen and not _seen.add(w)]
    en_words = en_words[:args.en_words]
    print(f"  Total: {len(en_words)}")
    print()

    # ─── Compute frequencies ────────────────────────────────
    print("── Computing word frequencies ──")
    ru_freqs = load_word_frequencies('ru', ru_words)
    en_freqs = load_word_frequencies('en', en_words)
    print()

    # ─── Word weights (explicit, from wordfreq) ────────────
    ru_word_weights = [max(1, int(round(f * FREQ_SCALE))) for f in ru_freqs]
    en_word_weights = [max(1, int(round(f * FREQ_SCALE))) for f in en_freqs]

    # ─── Generate bigrams ───────────────────────────────────
    print("── Generating bigrams ──")
    ru_bi_tok, ru_bi_wt = generate_bigrams(ru_words, ru_freqs, args.ru_bigrams, "RU")
    en_bi_tok, en_bi_wt = generate_bigrams(en_words, en_freqs, args.en_bigrams, "EN")
    print()

    # ─── Generate trigrams ──────────────────────────────────
    print("── Generating trigrams ──")
    ru_tri_tok, ru_tri_wt = generate_trigrams(ru_words, ru_freqs, args.ru_trigrams, "RU")
    en_tri_tok, en_tri_wt = generate_trigrams(en_words, en_freqs, args.en_trigrams, "EN")
    print()

    # ─── Assemble phrases: builtin + bigrams + trigrams ─────
    print("── Assembling phrases ──")

    def _assemble_phrases(builtin, bi_tok, bi_wt, tri_tok, tri_wt):
        """Combine built-in phrases with generated n-grams, deduplicating."""
        phrases = []
        weights = []
        seen = set()

        # Built-in phrases: Zipf-declining weights (alpha=1.2)
        for i, p in enumerate(builtin):
            pl = p.lower()
            if pl not in seen:
                seen.add(pl)
                phrases.append(p)
                # Base weight 300 000 with Zipf decline alpha=1.2
                w = max(500, int(300000 / (i + 1) ** 1.2))
                weights.append(w)

        # Bigrams
        for tok, wt in zip(bi_tok, bi_wt):
            tl = tok.lower()
            if tl not in seen:
                seen.add(tl)
                phrases.append(tok)
                weights.append(max(100, wt))

        # Trigrams
        for tok, wt in zip(tri_tok, tri_wt):
            tl = tok.lower()
            if tl not in seen:
                seen.add(tl)
                phrases.append(tok)
                weights.append(max(100, wt))

        return phrases, weights

    ru_phrases, ru_phrase_weights = _assemble_phrases(
        BUILTIN_RU_PHRASES, ru_bi_tok, ru_bi_wt, ru_tri_tok, ru_tri_wt)
    en_phrases, en_phrase_weights = _assemble_phrases(
        BUILTIN_EN_PHRASES, en_bi_tok, en_bi_wt, en_tri_tok, en_tri_wt)

    n_ru_builtin = len(BUILTIN_RU_PHRASES)
    n_en_builtin = len(BUILTIN_EN_PHRASES)
    print(f"  RU phrases: {len(ru_phrases)} "
          f"(builtin={n_ru_builtin}, bigrams={len(ru_bi_tok)}, trigrams={len(ru_tri_tok)})")
    print(f"  EN phrases: {len(en_phrases)} "
          f"(builtin={n_en_builtin}, bigrams={len(en_bi_tok)}, trigrams={len(en_tri_tok)})")
    print()

    # ─── Generate expanded emoji ────────────────────────────
    print("── Generating emoji ──")
    emoji_list = generate_emoji(args.emoji)
    print(f"  Total emoji: {len(emoji_list)}")
    print()

    # ─── Punctuation weights (declining tiers) ──────────────
    punct_weights = []
    for i in range(len(BUILTIN_PUNCT)):
        if   i < 5:  punct_weights.append(100000)
        elif i < 15: punct_weights.append(50000)
        elif i < 30: punct_weights.append(25000)
        elif i < 60: punct_weights.append(10000)
        else:        punct_weights.append(5000)

    # ─── Emoji weights ──────────────────────────────────────
    # Built-in emoji get a fixed high weight; generated emoji decline.
    builtin_emoji_set = set(BUILTIN_EMOJI)
    builtin_emoji_count = len(BUILTIN_EMOJI)
    emoji_weights = []
    for i, e in enumerate(emoji_list):
        if e in builtin_emoji_set:
            emoji_weights.append(50000)
        else:
            # Zipf-like decline for the rest
            rank = i - builtin_emoji_count + 1
            emoji_weights.append(max(100, int(30000 / rank ** 0.5)))

    # ═══════════════════════════════════════════════════════
    # Assemble final dictionary
    # ═══════════════════════════════════════════════════════

    dictionary = {
        "version": "ru-en-v2",
        "description": "Expanded token dictionary for Babel Library prefix codec",
        "types": TOKEN_TYPES,
        "tokens": {
            "space":     [" "],
            "newline":   ["\\n"],
            "dot":       ["."],
            "punct":     BUILTIN_PUNCT,
            "word_ru":   ru_words,
            "word_en":   en_words,
            "phrase_ru": ru_phrases,
            "phrase_en": en_phrases,
            "emoji":     emoji_list,
            "raw_char":  [],
        },
        "weights": {
            "space":     [1000000],
            "newline":   [80000],
            "dot":       [250000],
            "punct":     punct_weights,
            "word_ru":   ru_word_weights,
            "word_en":   en_word_weights,
            "phrase_ru": ru_phrase_weights,
            "phrase_en": en_phrase_weights,
            "emoji":     emoji_weights,
            "raw_char":  [100],          # ← REDUCED from 500
        },
        "states": [
            # state 0: START
            {"name": "START", "transitions": [
                [0, 3, 15], [4, 1, 50], [5, 2, 12], [6, 1, 10], [7, 2, 3],
                [2, 4, 2], [3, 5, 3], [1, 6, 3], [8, 7, 2],
            ]},
            # state 1: AFTER_RU
            {"name": "AFTER_RU", "transitions": [
                [0, 3, 65], [3, 5, 10], [2, 4, 5], [1, 6, 5],
                [4, 1, 8], [8, 7, 4], [9, 0, 3],
            ]},
            # state 2: AFTER_EN
            {"name": "AFTER_EN", "transitions": [
                [0, 3, 65], [3, 5, 10], [2, 4, 5], [1, 6, 5],
                [5, 2, 8], [8, 7, 4], [9, 0, 3],
            ]},
            # state 3: AFTER_SPACE
            {"name": "AFTER_SPACE", "transitions": [
                [4, 1, 48], [5, 2, 18], [6, 1, 10], [7, 2, 4],
                [3, 5, 2], [8, 7, 5], [1, 6, 3], [2, 4, 2], [9, 0, 3],
            ]},
            # state 4: AFTER_DOT
            {"name": "AFTER_DOT", "transitions": [
                [0, 3, 80], [1, 6, 8], [4, 1, 5], [5, 2, 3],
                [6, 1, 3], [9, 0, 1],
            ]},
            # state 5: AFTER_PUNCT
            {"name": "AFTER_PUNCT", "transitions": [
                [0, 3, 75], [4, 1, 8], [5, 2, 4], [1, 6, 5],
                [8, 7, 3], [3, 5, 2], [9, 0, 3],
            ]},
            # state 6: AFTER_NL
            {"name": "AFTER_NL", "transitions": [
                [4, 1, 48], [5, 2, 15], [6, 1, 8], [7, 2, 3],
                [3, 5, 3], [8, 7, 5], [1, 6, 8], [0, 3, 10], [9, 0, 3],
            ]},
            # state 7: AFTER_EMOJI
            {"name": "AFTER_EMOJI", "transitions": [
                [0, 3, 45], [8, 7, 12], [1, 6, 8], [4, 1, 20],
                [5, 2, 10], [2, 4, 3], [3, 5, 2], [9, 0, 3],
            ]},
        ],
    }

    # ─── Write output ───────────────────────────────────────
    output_path = args.output
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as fh:
        json.dump(dictionary, fh, ensure_ascii=False, indent=2)

    file_size = os.path.getsize(output_path)

    # ─── Summary ────────────────────────────────────────────
    total_tokens = sum(len(v) for v in dictionary["tokens"].values())

    print()
    print("=" * 60)
    print("TOKEN DICTIONARY SUMMARY")
    print("=" * 60)
    print(f"  Version:        {dictionary['version']}")
    print(f"  Output:         {output_path}")
    print(f"  File size:      {file_size / 1024 / 1024:.1f} MB" if file_size > 1024*1024
          else f"  File size:      {file_size / 1024:.0f} KB")
    print(f"  Total tokens:   {total_tokens:,}")
    print(f"  ─────────────────────────────────────")
    print(f"  space:          1")
    print(f"  newline:        1")
    print(f"  dot:            1")
    print(f"  punct:          {len(BUILTIN_PUNCT)}")
    print(f"  word_ru:        {len(ru_words):,}")
    print(f"  word_en:        {len(en_words):,}")
    print(f"  phrase_ru:      {len(ru_phrases):,}  "
          f"(builtin {n_ru_builtin} + bigrams {len(ru_bi_tok)} + trigrams {len(ru_tri_tok)})")
    print(f"  phrase_en:      {len(en_phrases):,}  "
          f"(builtin {n_en_builtin} + bigrams {len(en_bi_tok)} + trigrams {len(en_tri_tok)})")
    print(f"  emoji:          {len(emoji_list):,}")
    print(f"  raw_char:       0  (fallback, weight=100)")
    print(f"  ─────────────────────────────────────")
    if ru_word_weights:
        print(f"  RU word wt:     min={min(ru_word_weights)}, "
              f"max={max(ru_word_weights)}, "
              f"median={sorted(ru_word_weights)[len(ru_word_weights)//2]}")
    if en_word_weights:
        print(f"  EN word wt:     min={min(en_word_weights)}, "
              f"max={max(en_word_weights)}, "
              f"median={sorted(en_word_weights)[len(en_word_weights)//2]}")
    if ru_phrase_weights:
        print(f"  RU phrase wt:   min={min(ru_phrase_weights)}, "
              f"max={max(ru_phrase_weights)}")
    if en_phrase_weights:
        print(f"  EN phrase wt:   min={min(en_phrase_weights)}, "
              f"max={max(en_phrase_weights)}")
    print("=" * 60)

    return dictionary


# ═══════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Build expanded token dictionary (v2) for Babel Library prefix codec")
    parser.add_argument("--output", default="data/tokens.ru-en.v2.json",
                        help="Output JSON path (default: data/tokens.ru-en.v2.json)")
    parser.add_argument("--ru-words", type=int, default=DEFAULT_RU_WORDS,
                        help=f"Max Russian words (default: {DEFAULT_RU_WORDS})")
    parser.add_argument("--en-words", type=int, default=DEFAULT_EN_WORDS,
                        help=f"Max English words (default: {DEFAULT_EN_WORDS})")
    parser.add_argument("--ru-bigrams", type=int, default=DEFAULT_RU_BIGRAMS,
                        help=f"Max Russian bigrams (default: {DEFAULT_RU_BIGRAMS})")
    parser.add_argument("--en-bigrams", type=int, default=DEFAULT_EN_BIGRAMS,
                        help=f"Max English bigrams (default: {DEFAULT_EN_BIGRAMS})")
    parser.add_argument("--ru-trigrams", type=int, default=DEFAULT_RU_TRIGRAMS,
                        help=f"Max Russian trigrams (default: {DEFAULT_RU_TRIGRAMS})")
    parser.add_argument("--en-trigrams", type=int, default=DEFAULT_EN_TRIGRAMS,
                        help=f"Max English trigrams (default: {DEFAULT_EN_TRIGRAMS})")
    parser.add_argument("--emoji", type=int, default=DEFAULT_EMOJI,
                        help=f"Target emoji count (default: {DEFAULT_EMOJI})")
    args = parser.parse_args()
    build_dictionary(args)


if __name__ == "__main__":
    main()
