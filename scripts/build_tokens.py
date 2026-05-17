#!/usr/bin/env python3
"""
build_tokens.py — Офлайн-сборщик токенного словаря для Вавилона

Собирает частотные списки слов, фраз, пунктуации и эмодзи
из различных источников и выдаёт data/tokens.ru-en.v1.json.

Источники данных (рекомендуется скачать заранее):
  1. wordfreq (Python): pip install wordfreq
  2. Leeds Russian Internet Corpus: https://github.com/hingston/russian
  3. Частотный словарь artint.ru: https://www.artint.ru/projects/frqlist/
  4. SUBTLEX-US: https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus
  5. subtlex-word-frequencies npm: https://github.com/words/subtlex-word-frequencies
  6. wordfreq-en-25000: https://github.com/aparrish/wordfreq-en-25000

Использование:
  python3 scripts/build_tokens.py [--output data/tokens.ru-en.v1.json] [--ru-words 50000] [--en-words 50000]
"""

import json
import argparse
import os
import sys
import math
from collections import Counter

# ─── Конфигурация ───

DEFAULT_RU_WORDS = 50000
DEFAULT_EN_WORDS = 50000
DEFAULT_RU_BIGRAMS = 20000
DEFAULT_EN_BIGRAMS = 20000
DEFAULT_RU_TRIGRAMS = 5000
DEFAULT_EN_TRIGRAMS = 5000
DEFAULT_EMOJI = 2000
DEFAULT_PUNCT = 100

# ─── Типы токенов ───

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

# ─── Встроенные данные (fallback) ───

BUILTIN_PUNCT = [
    ",", "!", "?", ";", ":", "—", "…", "«", "»",
    "(", ")", "#", "@", "-", "/", "*", "=", "+",
    "[", "]", "{", "}", "<", ">", "~", "`", "^", "|",
    "\\", "&", "%", "$", "'", "\"",
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

# ─── Загрузка данных из источников ───

def load_ru_words_from_wordfreq(limit):
    """Загрузка русских слов из библиотеки wordfreq."""
    try:
        from wordfreq import top_n_list
        words = top_n_list('ru', limit)
        print(f"  wordfreq: загружено {len(words)} русских слов")
        return words
    except ImportError:
        print("  wordfreq не установлен, пропуск")
        return []

def load_en_words_from_wordfreq(limit):
    """Загрузка английских слов из библиотеки wordfreq."""
    try:
        from wordfreq import top_n_list
        words = top_n_list('en', limit)
        print(f"  wordfreq: загружено {len(words)} английских слов")
        return words
    except ImportError:
        print("  wordfreq не установлен, пропуск")
        return []

def load_ru_words_from_file(filepath, limit):
    """Загрузка русских слов из текстового файла (одно слово на строку)."""
    if not os.path.exists(filepath):
        print(f"  Файл не найден: {filepath}")
        return []
    words = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip().split()[0] if line.strip() else ''
            if word and word.isalpha():
                words.append(word.lower())
            if len(words) >= limit:
                break
    print(f"  {filepath}: загружено {len(words)} слов")
    return words

def load_en_words_from_file(filepath, limit):
    """Загрузка английских слов из текстового файла."""
    if not os.path.exists(filepath):
        print(f"  Файл не найден: {filepath}")
        return []
    words = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()
            word = parts[0] if parts else ''
            if word and word.isalpha():
                words.append(word.lower())
            if len(words) >= limit:
                break
    print(f"  {filepath}: загружено {len(words)} слов")
    return words

def load_ru_words_from_js(filepath, limit):
    """Загрузка русских слов из js/words.js (BABEL_WORD_BANK)."""
    if not os.path.exists(filepath):
        print(f"  Файл не найден: {filepath}")
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    # Извлекаем массив слов из JS-кода
    start = content.find('[')
    end = content.rfind(']') + 1
    if start < 0 or end <= start:
        return []
    try:
        words = json.loads(content[start:end])
        print(f"  {filepath}: загружено {len(words)} слов")
        return words[:limit]
    except json.JSONDecodeError:
        print(f"  Ошибка парсинга {filepath}")
        return []

# ─── Zipf-веса ───

def zipf_weight(index, alpha=1.0):
    """Zipf-распределение: вес = 1 / (index + 1)^alpha"""
    return 1.0 / ((index + 1) ** alpha)

# ─── Основная сборка ───

def build_dictionary(args):
    print("Сборка токенного словаря...")
    print(f"  Русских слов:    до {args.ru_words}")
    print(f"  Английских слов: до {args.en_words}")
    print()

    # ─── Русские слова ───
    print("Загрузка русских слов:")
    ru_words = []

    # Пробуем wordfreq
    ru_words_wfreq = load_ru_words_from_wordfreq(args.ru_words)
    if ru_words_wfreq:
        ru_words.extend(ru_words_wfreq)

    # Пробуем файл
    if len(ru_words) < args.ru_words:
        ru_words_file = load_ru_words_from_file('data/ru_words.txt', args.ru_words - len(ru_words))
        ru_words.extend(ru_words_file)

    # Пробуем JS word bank
    if len(ru_words) < args.ru_words:
        ru_words_js = load_ru_words_from_js('js/words.js', args.ru_words - len(ru_words))
        for w in ru_words_js:
            if w not in ru_words:
                ru_words.append(w)

    # Дедупликация с сохранением порядка
    seen = set()
    ru_words_dedup = []
    for w in ru_words:
        w_lower = w.lower()
        if w_lower not in seen and len(w_lower) >= 1:
            seen.add(w_lower)
            ru_words_dedup.append(w_lower)
    ru_words = ru_words_dedup[:args.ru_words]

    print(f"  Итого русских слов: {len(ru_words)}")
    print()

    # ─── Английские слова ───
    print("Загрузка английских слов:")
    en_words = []

    # Пробуем wordfreq
    en_words_wfreq = load_en_words_from_wordfreq(args.en_words)
    if en_words_wfreq:
        en_words.extend(en_words_wfreq)

    # Пробуем файл
    if len(en_words) < args.en_words:
        en_words_file = load_en_words_from_file('data/en_words.txt', args.en_words - len(en_words))
        en_words.extend(en_words_file)

    # Дедупликация
    seen = set()
    en_words_dedup = []
    for w in en_words:
        w_lower = w.lower()
        if w_lower not in seen and len(w_lower) >= 1:
            seen.add(w_lower)
            en_words_dedup.append(w_lower)
    en_words = en_words_dedup[:args.en_words]

    print(f"  Итого английских слов: {len(en_words)}")
    print()

    # ─── Сборка JSON ───

    dictionary = {
        "version": "ru-en-v1",
        "description": "Token dictionary for Babel Library prefix codec",
        "types": TOKEN_TYPES,
        "tokens": {
            "space": [" "],
            "newline": ["\\n"],
            "dot": ["."],
            "punct": BUILTIN_PUNCT,
            "word_ru": ru_words,
            "word_en": en_words,
            "phrase_ru": BUILTIN_RU_PHRASES,
            "phrase_en": BUILTIN_EN_PHRASES,
            "emoji": BUILTIN_EMOJI,
            "raw_char": [],  # fallback, no explicit tokens needed
        },
        "weights": {
            "space": [1000000],
            "newline": [80000],
            "dot": [250000],
            "punct": "zipf_alpha1.0",  # веса по позиции: zipf(i, 1.0)
            "word_ru": "zipf_alpha0.8",
            "word_en": "zipf_alpha0.8",
            "phrase_ru": "zipf_alpha1.2",
            "phrase_en": "zipf_alpha1.2",
            "emoji": "zipf_alpha1.5",
            "raw_char": [500],
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

    # ─── Запись ───

    output_path = args.output
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(dictionary, f, ensure_ascii=False, indent=2)

    total_tokens = sum(len(v) if isinstance(v, list) else 0 for v in dictionary["tokens"].values())
    print(f"\nСловарь записан: {output_path}")
    print(f"  Всего токенов: {total_tokens}")
    print(f"  Русских слов:  {len(ru_words)}")
    print(f"  Английских слов: {len(en_words)}")
    print(f"  Русских фраз:  {len(BUILTIN_RU_PHRASES)}")
    print(f"  Английских фраз: {len(BUILTIN_EN_PHRASES)}")
    print(f"  Пунктуация:    {len(BUILTIN_PUNCT)}")
    print(f"  Эмодзи:        {len(BUILTIN_EMOJI)}")

    return dictionary

# ─── CLI ───

def main():
    parser = argparse.ArgumentParser(description="Build token dictionary for Babel Library")
    parser.add_argument("--output", default="data/tokens.ru-en.v1.json", help="Output JSON path")
    parser.add_argument("--ru-words", type=int, default=DEFAULT_RU_WORDS, help="Max Russian words")
    parser.add_argument("--en-words", type=int, default=DEFAULT_EN_WORDS, help="Max English words")
    args = parser.parse_args()
    build_dictionary(args)

if __name__ == "__main__":
    main()
