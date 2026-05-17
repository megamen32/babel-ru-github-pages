(() => {
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     256-character alphabet = base-2^8 = 1 byte per symbol
     ═══════════════════════════════════════════════════════════

     Every symbol is exactly 1 byte. The entire library becomes
     a pure byte-level machine. 4096 × 8 = 32768 bits per page.

     Layout:
       0       space
       1       newline \n  (a first-class character!)
       2–34    Russian     33 letters  а б в г д е ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я ё
       35–60   English     26 letters  a b c d e f g h i j k l m n o p q r s t u v w x y z
       61–70   Digits      10 symbols  0 1 2 3 4 5 6 7 8 9
       71–106  Punctuation 36 symbols
       107–255 Emoji       149 symbols

     English letters with visual overlap (A=А, E=Е, K=К, M=М,
     O=О, C=С, T=Т, X=Х) are kept as separate entries because
     we have room. They are NOT auto-mapped to Russian for speed. */

  const ALPHABET = [
    /*  0 */ " ",
    /*  1 */ "\n",
    /*  2–34  Russian (33) */
    "а","б","в","г","д","е","ж","з","и","й",
    "к","л","м","н","о","п","р","с","т","у",
    "ф","х","ц","ч","ш","щ","ъ","ы","ь","э",
    "ю","я","ё",
    /* 35–60  English (26) */
    "a","b","c","d","e","f","g","h","i","j",
    "k","l","m","n","o","p","q","r","s","t",
    "u","v","w","x","y","z",
    /* 61–70  Digits (10) */
    "0","1","2","3","4","5","6","7","8","9",
    /* 71–106  Punctuation (36) */
    ".",",","!","?",";",":","-","—","«","»",
    "(",")","…","@","#","_","/","*","=","+",
    "[","]","{","}","<",">","~","`","^","|",
    "\\","&","%","$","'","\"",
    /* 107–255  Emoji (149) */
    "🔥","⭐","💯","❌","✅","🎉","💀","👻","🧠","❤",
    "👍","👎","👋","💪","🙏","😂","😭","😤","🥺","🤔",
    "💬","📱","💻","🌍","🎵","☕","🎯","⚡","💎","🔑",
    "🚀","🌙","🎮","🏆","🍺","🌸","🦋","🐱","🐶","🌈",
    "💡","📖","🔔","😎","🥳","💙","🖤","🤷","🤩","💢",
    "🤗","😴","🤮","🤑","🤠","😈","👿","👹","🤡","👀",
    "🫡","🫠","🫣","🤭","🤫","🤓","🧐","🙃","😬","🥴",
    "🤪","🤯","😱","😨","😰","😥","😢","🤬","😡","😠",
    "🥵","🥶","😳","😏","😌","🤤","🤢","🤧","😷","🤒",
    "🤕","✨","💫","🌊","🍀","🍂","🌻","🌺","🌲","🌳",
    "🌴","🌵","🍄","🦊","🐻","🐼","🐨","🐯","🦁","🐮",
    "🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦉","🦇","🐺",
    "🐗","🐴","🦄","🐝","🐛","🐌","🐞","🐜","🐙","🦑",
    "🐠","🐟","🐡","🦈","🐋","🐳","🐬","🦭","🐉","🦕",
    "🦖","🐍","🦎","🐊","🐢","🦂","☑","🔘","🆗"
  ];

  app.config = {
    VERSION: "8.0",
    ALG: {
      label: "ru6",
      alphabet: ALPHABET,
      pageLength: 4096,
      /* No fixed lineWidth — newline is a character in the alphabet.
         Visual line width is purely a CSS concern. */
      pagesPerVolume: 410n,
      volumesPerShelf: 32n,
      shelvesPerWall: 5n,
      wallsPerHall: 6n,
      hallsPerSector: 20n,
    },
    SEARCH_VARIANTS_DEFAULT: 6,
    SEARCH_VARIANTS_MAX: 100,
    QUOTE: {
      text: "Вселенная, которую другие называют Библиотекой...",
      author: "Хорхе Луис Борхес",
      source: "«Вавилонская библиотека»",
    },
    INTRO: "Вавилон — это не про шифры. Это про оцепенение, когда ты стоишь в бесконечном зале, тянешь наугад пыльную книгу с полки, и там — дневник твоей смерти. Или рецепт борща. Или просто шум.",
    /* 10000 Russian words — loaded from embedded offline file (js/words.js) */
    WORD_BANK: window.BABEL_WORD_BANK || [
      "архив", "книга", "сумрак", "пыль", "каталог", "лестница", "галерея", "полка",
      "переплет", "тишина", "страж", "лампа", "письмо", "зеркало", "индекс", "том",
      "лист", "коридор", "узор", "шёпот", "словарь", "лабиринт", "шестигранник",
      "предел", "слово", "рукопись", "описание", "число", "перестановка", "алфавит",
      "формула", "ночь", "свет", "порог", "перила", "символ", "строка", "координата",
    ],
    /* Offline-first: no network fetch needed. Word bank is embedded in words.js. */
    _wordBankLoaded: true,
    ensureWordBank() {
      return Promise.resolve(this.WORD_BANK);
    },
  };
})();
