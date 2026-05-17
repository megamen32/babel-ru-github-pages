(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* Захватываем ссылку на _prefix при загрузке IIFE.
     lib-api.js позже удалит app.library._prefix (cleanup),
     но замыкание сохранит живую ссылку. */
  const _prefix = app.library._prefix;

  /* ═══════════════════════════════════════════════════════════
     ТОКЕННАЯ ТАБЛИЦА — словарь + типы + веса + конечный автомат
     ═══════════════════════════════════════════════════════════
     Токены разбиты по типам:
       0: SPACE       — пробел (один токен)
       1: NEWLINE     — перевод строки (один токен)
       2: DOT         — точка (один токен)
       3: PUNCT       — пунктуация: , ! ? ; : — … « » ( ) # @
       4: WORD_RU     — русские слова (частотно-упорядоченные)
       5: WORD_EN     — английские слова (частотно-упорядоченные)
       6: PHRASE_RU   — русские фразы (2-4 слова)
       7: PHRASE_EN   — английские фразы (2-4 слова)
       8: EMOJI       — эмодзи
       9: RAW_CHAR    — fallback: любой символ через кодовую точку

     Ключевое свойство: частые токены → короткие Хаффман-коды.
     Пространство искривлено: язык «гравитирует» к началу координат.

     v2: загрузка словаря из внешнего JSON, исправленный токенайзер,
         уменьшенный вес RAW_CHAR, температурная коррекция весов. */

  /* ─── Типы токенов ─── */
  const T = {
    SPACE: 0, NEWLINE: 1, DOT: 2, PUNCT: 3,
    WORD_RU: 4, WORD_EN: 5, PHRASE_RU: 6, PHRASE_EN: 7,
    EMOJI: 8, RAW_CHAR: 9,
  };
  const TYPE_COUNT = 10;

  /* ─── Состояния конечного автомата ─── */
  const S = {
    START: 0,
    AFTER_RU: 1,
    AFTER_EN: 2,
    AFTER_SPACE: 3,
    AFTER_DOT: 4,
    AFTER_PUNCT: 5,
    AFTER_NL: 6,
    AFTER_EMOJI: 7,
  };
  const STATE_COUNT = 8;

  /* ─── Переходы: state → [{ type, nextState, weight }] ───
     weight — относительная вероятность выбора типа в данном состоянии.
     После построения Хаффман-кодов по этим весам,
     выбор типа читается ИЗ АДРЕСА, а не из PRNG. */

  const STATE_TRANSITIONS = [
    /* S.START */ [
      { type: T.SPACE,     ns: S.AFTER_SPACE,  w: 15 },
      { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 50 },
      { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 12 },
      { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 10 },
      { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 3 },
      { type: T.DOT,       ns: S.AFTER_DOT,     w: 2 },
      { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 3 },
      { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 3 },
      { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 2 },
    ],
    /* S.AFTER_RU */ [
      { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 65 },
      { type: T.PUNCT,   ns: S.AFTER_PUNCT,  w: 10 },
      { type: T.DOT,     ns: S.AFTER_DOT,     w: 5 },
      { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
      { type: T.WORD_RU, ns: S.AFTER_RU,      w: 8 },
      { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 4 },
      { type: T.RAW_CHAR,ns: S.START,         w: 3 },
    ],
    /* S.AFTER_EN */ [
      { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 65 },
      { type: T.PUNCT,   ns: S.AFTER_PUNCT,  w: 10 },
      { type: T.DOT,     ns: S.AFTER_DOT,     w: 5 },
      { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
      { type: T.WORD_EN, ns: S.AFTER_EN,      w: 8 },
      { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 4 },
      { type: T.RAW_CHAR,ns: S.START,         w: 3 },
    ],
    /* S.AFTER_SPACE */ [
      { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 48 },
      { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 18 },
      { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 10 },
      { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 4 },
      { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 2 },
      { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 5 },
      { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 3 },
      { type: T.DOT,       ns: S.AFTER_DOT,     w: 2 },
      { type: T.RAW_CHAR,  ns: S.START,         w: 3 },
    ],
    /* S.AFTER_DOT */ [
      { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 80 },
      { type: T.NEWLINE, ns: S.AFTER_NL,      w: 8 },
      { type: T.WORD_RU, ns: S.AFTER_RU,      w: 5 },
      { type: T.WORD_EN, ns: S.AFTER_EN,      w: 3 },
      { type: T.PHRASE_RU,ns: S.AFTER_RU,     w: 3 },
      { type: T.RAW_CHAR,ns: S.START,         w: 1 },
    ],
    /* S.AFTER_PUNCT */ [
      { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 75 },
      { type: T.WORD_RU, ns: S.AFTER_RU,      w: 8 },
      { type: T.WORD_EN, ns: S.AFTER_EN,      w: 4 },
      { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
      { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 3 },
      { type: T.PUNCT,   ns: S.AFTER_PUNCT,   w: 2 },
      { type: T.RAW_CHAR,ns: S.START,         w: 3 },
    ],
    /* S.AFTER_NL */ [
      { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 48 },
      { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 15 },
      { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 8 },
      { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 3 },
      { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 3 },
      { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 5 },
      { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 8 },
      { type: T.SPACE,     ns: S.AFTER_SPACE,   w: 10 },
      { type: T.RAW_CHAR,  ns: S.START,         w: 3 },
    ],
    /* S.AFTER_EMOJI */ [
      { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 45 },
      { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 12 },
      { type: T.NEWLINE, ns: S.AFTER_NL,      w: 8 },
      { type: T.WORD_RU, ns: S.AFTER_RU,      w: 20 },
      { type: T.WORD_EN, ns: S.AFTER_EN,      w: 10 },
      { type: T.DOT,     ns: S.AFTER_DOT,     w: 3 },
      { type: T.PUNCT,   ns: S.AFTER_PUNCT,   w: 2 },
      { type: T.RAW_CHAR,ns: S.START,         w: 3 },
    ],
  ];

  /* ─── Пунктуация (fallback inline) ─── */
  const PUNCT_TOKENS = [
    ',', '!', '?', ';', ':', '—', '…', '«', '»',
    '(', ')', '#', '@', '-', '/', '*', '=', '+',
  ];

  /* ─── Эмодзи (fallback inline) ─── */
  const EMOJI_TOKENS = [
    '🔥','⭐','💯','❌','✅','🎉','💀','👻','🧠','❤',
    '👍','👎','👋','💪','🙏','😂','😭','😤','🥺','🤔',
    '💬','📱','💻','🌍','🎵','☕','🎯','⚡','💎','🔑',
    '🚀','🌙','🎮','🏆','🍺','🌸','🦋','🐱','🐶','🌈',
    '💡','📖','🔔','😎','🥳','💙','🖤','🤷','🤩','💢',
    '✨','💫','🌊','🍀','🍂','🌻','🌺','🌲','🌳','🌴',
    '🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
    '🐔','🐧','🐦','🦅','🦉','🐺','🐴','🦄','🐝','🐛',
  ];

  /* ─── Русские фразы (fallback inline) ─── */
  const PHRASE_RU_TOKENS = [
    'я тебя','в том числе','с одной стороны','в общем','в конце концов',
    'в любом случае','по крайней мере','на самом деле','в первую очередь',
    'как правило','в частности','в связи с','в отличие от',
    'в соответствии с','на протяжении','по отношению к','в результате',
    'на основании','в целях','в области','в виде','в процессе','в случае',
    'на основе','по поводу','при этом','в ходе','в направлении',
    'в составе','в качестве','в отношении','за счёт','на уровне',
    'в течение','с точки зрения','до сих пор','так или иначе',
    'тем не менее','в то же время','в то время как','как бы то ни было',
    'несмотря на то','в силу того','в зависимости от','наряду с',
    'вместе с тем','исходя из','по сравнению с','в дополнение к',
    'помимо этого','сверх того','более того','кроме того','к тому же',
    'в свою очередь','в конечном счёте','в конечном итоге','в итоге',
    'в целом','например','а именно','то есть','иначе говоря',
    'иными словами','одним словом','короче говоря','проще говоря',
    'точнее говоря','скорее всего','может быть','должно быть',
    'вероятно','очевидно','безусловно','конечно','разумеется',
    'действительно','в самом деле','на практике','по сути',
    'по существу','в принципе','к счастью','к сожалению',
    'к удивлению','к слову','кстати','между прочим','вдобавок',
    'мало того','не только','для того чтобы','после того как',
    'перед тем как','до того как','с тех пор как','как только',
    'прежде чем','пока не','я не знаю','я думаю','я хочу',
    'я могу','я буду','мне кажется','не знаю','не могу',
    'не хочу','не буду','надо сказать','стоит отметить',
    'следует отметить','необходимо отметить','важно понимать',
    'остаётся только','ничего подобного','ничего страшного',
    'всё равно','всё ещё','всё нормально','всё хорошо',
    'всё отлично','всё понятно','не обязательно','вполне возможно',
    'самое главное','самое важное','самое интересное',
    'с другой стороны','и при этом','но при этом',
    'вот и всё','вот именно','вот это да','ну и что',
    'ну конечно','ладно давай','я тебя люблю','послушай меня',
    'подожди немного','иди сюда','не уходи','мы вместе',
    'где мы','зачем это нужно','почему так','как это работает',
    'что это значит','кто это сделал','сколько стоит',
    'очень много','очень мало','очень хорошо','очень плохо',
    'очень важно','очень интересно',
  ];

  /* ─── Английские фразы (fallback inline) ─── */
  const PHRASE_EN_TOKENS = [
    'i love you','i want to','i need to','i have to','i am going to',
    'i would like','i think that','i know that','i believe that',
    'it was a','it is a','there is a','there are no','that is why',
    'in order to','as well as','at the same time','on the other hand',
    'in fact','in addition','in particular','in general','in other words',
    'for example','for instance','of course','as a result',
    'by the way','on the contrary','in contrast','nevertheless',
    'furthermore','moreover','therefore','consequently','meanwhile',
    'otherwise','regardless','instead','however','thus','hence',
    'to be honest','to tell the truth','to begin with','to sum up',
    'in conclusion','after all','above all','at last','at least',
    'the problem is','the question is','the point is','the fact is',
    'it seems that','it appears that','it turns out',
    'do you know','do you think','do you want','can you help',
    'how does it work','how do you know','how can i help',
    'why do you think','why is it so','what does it mean',
  ];

  /* ─── Английские слова (fallback inline, ~500) ─── */
  const WORD_EN_TOKENS = [
    'the','be','to','of','and','a','in','that','have','i','it','for','not',
    'on','with','he','as','you','do','at','this','but','his','by','from',
    'they','we','say','her','she','or','an','will','my','one','all','would',
    'there','their','what','so','up','out','if','about','who','get','which',
    'go','me','when','make','can','like','time','no','just','him','know',
    'take','people','into','year','your','good','some','could','them','see',
    'other','than','then','now','look','only','come','its','over','think',
    'also','back','after','use','two','how','our','work','first','well',
    'way','even','new','want','because','any','these','give','day','most',
    'us','great','between','need','large','under','never','same','last',
    'long','world','still','own','find','here','thing','many','right',
    'hand','high','keep','start','thought','might','head','tell','write',
    'become','while','begin','seem','help','show','house','both','play',
    'run','move','live','night','point','turn','few','group','such',
    'against','ask','late','hard','real','open','close','question',
    'always','end','city','child','often','enough','together','interest',
    'face','leave','learn','different','state','book','problem','food',
    'door','white','water','room','friend','began','idea','mountain',
    'north','once','base','hear','light','watch','follow','stop','second',
    'sing','fear','grow','art','game','clear','force','air','boy','girl',
    'class','term','yes','case','change','system','place','power','money',
    'side','form','rule','today','body','study','line','age','far','sure',
    'car','area','plan','example','kind','health','result','morning',
    'reason','research','feel','movie','story','computer','music','person',
    'paper','possible','word','eye','answer','voice','energy','level',
    'order','war','history','party','map','family','event','government',
    'table','court','return','road','program','field','job','mind',
    'member','market','sense','product','effect','stage','source','nature',
    'price','office','record','value','board','report','month','language',
    'view','society','activity','space','experience','industry','media',
    'control','service','condition','design','rate','team','position',
    'degree','culture','central','support','region','stock','building',
    'material','theory','weight','standard','model','practice','science',
    'college','action','pressure','performance','subject','issue',
    'analysis','range','training','union','administration','picture',
    'quality','resource','amount','audience','author','budget','candidate',
    'century','chapter','choice','citizen','claim','client','climate',
    'combination','command','comment','communication','community',
    'comparison','competition','complex','component','concept','concern',
    'conference','conflict','congress','connection','consequence',
    'construction','consumer','contact','content','context','contract',
    'contribution','conversation','corporation','coverage','creation',
    'crisis','criticism','currency','customer','database','daughter',
    'debate','decade','decision','decline','defense','definition','demand',
    'democracy','department','depression','description','desire',
    'destination','detail','device','dialogue','diet','dimension',
    'direction','director','discipline','discussion','disease',
    'distribution','diversity','division','document','domain','domestic',
    'dominant','driver','duration','dynamic','earth','economy','edition',
    'editor','education','efficiency','election','element','emergency',
    'emotion','emphasis','employee','employer','encounter','enemy',
    'enforcement','engineering','environment','episode','equipment',
    'establishment','evaluation','evidence','evolution','exchange',
    'excitement','executive','existence','expansion','expectation',
    'expense','experiment','expert','explosion','exposure','extension',
    'extent','extreme','facility','factor','failure','fashion','feature',
    'federal','fiction','finance','flag','flight','focus','football',
    'forecast','forest','formula','fortune','foundation','fraction',
    'framework','freedom','function','generation','genius','goal','god',
    'grain','grant','guarantee','guard','guidance','habit','harm',
    'headquarters','hearing','heart','heaven','height','hero','horizon',
    'horror','host','household','housing','human','humor','hunt','ideal',
    'image','impact','implementation','impression','improvement',
    'incident','individual','inflation','influence','infrastructure',
    'initiative','injury','innovation','instance','institution',
    'instruction','instrument','insurance','intelligence','intensity',
    'intention','interaction','internet','interpretation','intervention',
    'interview','introduction','invasion','investigation','investment',
    'involvement','isolation','journal','journey','judge','judgment',
    'justice','knife','labor','landscape','launch','layer','leadership',
    'league','legend','legislation','leisure','lesson','letter','liberal',
    'liberty','license','listener','literature','loan','location','logic',
    'loss','magazine','majority','management','manager','manufacturer',
    'margin','mass','master','match','meal','mechanism','membership',
    'memory','message','metal','method','middle','minister','minority',
    'mission','mistake','mixture','monitor','moral','motivation','motor',
    'mount','mouse','mouth','movement','murder','mystery','myth',
    'narrative','nation','negative','negotiation','network','news',
    'noise','novel','nurse','objective','obligation','observation',
    'occupation','officer','operation','opponent','opportunity',
    'opposition','option','orchestra','ordinary','organization','original',
    'outcome','output','oxygen','pace','panel','panic','paragraph',
    'partner','passage','passenger','passport','pattern','pause','penalty',
    'pension','percentage','perception','period','permission','personality',
    'perspective','phase','phenomenon','philosophy','photograph','phrase',
    'pilot','pitch','pocket','poetry','pole','policy','politics',
    'pollution','pool','portrait','possession','potential','pound',
    'poverty','prayer','presidency','pride','priest','principle','priority',
    'prison','privacy','prize','procedure','profile','profit','progress',
    'project','promise','proportion','proposal','protection','protest',
    'provision','publication','purpose','pursuit','quarter','queen',
    'quote','race','radiation','radical','rail','ratio','reaction',
    'reader','reality','recognition','recommendation','recovery',
    'regulation','relevance','relief','religion','remedy','replacement',
    'republic','resident','resistance','resolution','resource','response',
    'restaurant','revolution','rhythm','risk','rival','robot','rock',
    'romance','root','routine','royal','sacrifice','safety','salary',
    'sample','satellite','scandal','schedule','scholarship','scientist',
    'scope','screen','search','secretary','sector','security','seed',
    'segment','seminar','senior','sequence','session','setting',
    'settlement','shadow','shock','shot','silence','silver','singer',
    'sister','slave','slice','smoke','software','soil','soldier',
    'solution','soul','specialist','speech','speed','sphere','spirit',
    'split','sponsor','spread','spring','square','stable','staff',
    'stage','stake','standard','star','statement','status','steel',
    'stem','storm','stranger','strategy','strength','struggle','studio',
    'style','substance','suburb','successor','summit','supplier',
    'surface','surgery','surplus','surprise','survival','suspect',
    'symbol','sympathy','technique','television','temperature','tendency',
    'territory','terror','text','thanks','therapy','thought','threat',
    'threshold','timber','tissue','title','tone','tool','topic',
    'tourism','tower','track','tradition','tragedy','transfer',
    'transformation','transition','transportation','treaty','trend',
    'triangle','trigger','troop','tunnel','twin','type','uncle',
    'uniform','union','universe','update','upgrade','upper','utility',
    'vacation','valley','variable','variation','variety','vehicle',
    'venture','version','veteran','victim','victory','violation',
    'virtue','vision','visitor','vocabulary','volume','volunteer',
    'wage','weapon','welfare','wheel','whisper','winner','wisdom',
    'witness','wonder','wood','worker','workshop','wound','writer',
    'youth','zone',
  ];

  /* ═══════════════════════════════════════════════════════════
     ЗАГРУЗКА ВНЕШНЕГО СЛОВАРЯ
     ═══════════════════════════════════════════════════════════ */

  let _loadedDictionary = null;

  /* Маппинг имён типов из JSON в индексы T */
  const TYPE_NAME_TO_IDX = {
    space: T.SPACE, newline: T.NEWLINE, dot: T.DOT, punct: T.PUNCT,
    word_ru: T.WORD_RU, word_en: T.WORD_EN,
    phrase_ru: T.PHRASE_RU, phrase_en: T.PHRASE_EN,
    emoji: T.EMOJI, raw_char: T.RAW_CHAR,
  };

  /* Преобразуем текстовое представление токена из JSON в реальный символ.
     JSON-файл хранит "\n" как двухсимвольную строку — конвертируем. */
  function unescapeJsonToken(s) {
    if (s === '\\n') return '\n';
    if (s === '\\t') return '\t';
    if (s === '\\r') return '\r';
    return s;
  }

  /* Парсим states из формата JSON: [[typeIdx, nextState, weight], ...]
     во внутренний формат: [{ type, ns, w }, ...] */
  function parseStatesFromJson(jsonStates) {
    if (!jsonStates || !Array.isArray(jsonStates)) return null;
    try {
      return jsonStates.map(state => {
        if (!state.transitions) return null;
        return state.transitions.map(([typeIdx, ns, w]) => ({
          type: typeIdx,
          ns,
          w,
        }));
      });
    } catch (_e) {
      return null;
    }
  }

  /**
   * Асинхронно загружает словарь из data/tokens.ru-en.v2.json.
   * При неудаче возвращает null (будет использован встроенный словарь).
   */
  async function loadDictionary() {
    try {
      const resp = await fetch('data/tokens.ru-en.v2.json');
      if (!resp.ok) {
        console.warn(`[token-table] fetch failed: ${resp.status}`);
        return null;
      }
      const dict = await resp.json();

      /* Минимальная валидация */
      if (!dict.tokens || !dict.weights || !dict.types) {
        console.warn('[token-table] invalid dictionary format');
        return null;
      }

      _loadedDictionary = dict;
      /* Сбрасываем кэш таблицы при загрузке нового словаря */
      _table = null;

      console.log(
        `[token-table] loaded v${dict.version || '?'}: ` +
        `word_ru=${(dict.tokens.word_ru||[]).length} ` +
        `word_en=${(dict.tokens.word_en||[]).length} ` +
        `phrase_ru=${(dict.tokens.phrase_ru||[]).length} ` +
        `phrase_en=${(dict.tokens.phrase_en||[]).length} ` +
        `emoji=${(dict.tokens.emoji||[]).length} ` +
        `punct=${(dict.tokens.punct||[]).length}`
      );
      return dict;
    } catch (e) {
      console.warn('[token-table] loadDictionary failed:', e);
      return null;
    }
  }

  /**
   * Возвращает true, если внешний словарь загружен.
   */
  function isDictionaryLoaded() {
    return _loadedDictionary !== null;
  }

  /* ─── Zipf-веса: weight(i) = 1 / (i + 1)^alpha ─── */
  function zipfWeights(count, alpha = 1.0) {
    const weights = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      weights[i] = 1.0 / Math.pow(i + 1, alpha);
    }
    return Array.from(weights);
  }

  /* ═══════════════════════════════════════════════════════════
     ТЕМПЕРАТУРНАЯ КОРРЕКЦИЯ ВЕСОВ
     ═══════════════════════════════════════════════════════════
     temperature = 0.0 → все веса равны (плоское → шум)
     temperature = 0.5 → умеренное сглаживание
     temperature = 1.0 → оригинальные веса (без изменений)
     temperature > 1.0 → обострение (частые токены ещё доминантнее) */

  function applyTemperature(weights, temp) {
    if (temp === 1.0) return weights;
    if (temp <= 0) {
      /* Плоское: все равны */
      const avg = weights.reduce((s, w) => s + w, 0) / weights.length;
      return weights.map(() => avg);
    }
    /* adjusted = weight ^ (1/temp)
       temp < 1 → 1/temp > 1 → веса сближаются (сглаживание)
       temp > 1 → 1/temp < 1 → веса раздвигаются (обострение) */
    const exponent = 1.0 / temp;
    return weights.map(w => Math.pow(w, exponent));
  }

  /**
   * Вычисляет температуру по BigInt-координате z.
   * Малый z → низкая температура → человекоподобный текст.
   * Большой z → высокая температура → шум.
   */
  function computeTemperature(z) {
    const absZ = z < 0n ? -z : z;
    if (absZ <= 1n) return 0.05;
    /* log10(absZ) через длину десятичного представления — без потолка */
    const s = absZ.toString();
    const log10 = s.length - 1 + (s.length > 1 ? (Number(s[0] + '.' + s.slice(1, 4)) - Number(s[0])) : 0);
    return log10 * 0.1;
    /* 0.05 при z=1, ~0.30 при z=10^3, ~0.60 при z=10^6, 1.0 при z=10^10, растёт далее */
  }

  /* ═══════════════════════════════════════════════════════════
     ПОСТРОЕНИЕ ПОЛНОЙ ТАБЛИЦЫ ТОКЕНОВ
     ═══════════════════════════════════════════════════════════ */

  let _table = null; // кэш

  /**
   * Строит полную токенную таблицу.
   * @param {Object|null} dictionary — внешний словарь (из loadDictionary).
   *   Если null — используется встроенный inline-словарь.
   */
  function buildTokenTable(dictionary) {
    if (_table && !dictionary) return _table;

    const dict = dictionary || _loadedDictionary || null;
    const WORD_BANK = (window.BABEL_WORD_BANK || []);

    /* ─── Собираем все токены по типам ─── */
    const tokensByType = {};

    if (dict && dict.tokens && dict.weights) {
      /* ─── Загружаем из внешнего словаря ─── */
      const types = dict.types || [];
      for (const typeName of types) {
        const typeIdx = TYPE_NAME_TO_IDX[typeName];
        if (typeIdx === undefined) continue;

        const rawTokens = (dict.tokens[typeName] || []).map(unescapeJsonToken);
        const rawWeights = dict.weights[typeName] || [];

        tokensByType[typeIdx] = rawTokens.map((t, i) => ({
          text: t,
          weight: i < rawWeights.length ? rawWeights[i] : (rawWeights.length > 0 ? rawWeights[rawWeights.length - 1] : 100),
        }));
      }

      /* Если в словаре нет RAW_CHAR — добавляем fallback */
      if (!dict.tokens.raw_char || dict.tokens.raw_char.length === 0) {
        tokensByType[T.RAW_CHAR] = [{ text: '\x00', weight: 100 }];
      }
    } else {
      /* ─── Fallback: встроенный inline-словарь ─── */

      /* Типы с одним токеном */
      tokensByType[T.SPACE]   = [{ text: ' ', weight: 1000000 }];
      tokensByType[T.NEWLINE] = [{ text: '\n', weight: 80000 }];
      tokensByType[T.DOT]     = [{ text: '.', weight: 250000 }];

      /* Пунктуация */
      tokensByType[T.PUNCT] = PUNCT_TOKENS.map((t, i) => ({
        text: t, weight: 100000 / (i + 1),
      }));

      /* Русские слова (из WORD_BANK — уже частотно-упорядоченные) */
      tokensByType[T.WORD_RU] = WORD_BANK.map((t, i) => ({
        text: t, weight: 500000 / (i + 1),
      }));

      /* Английские слова */
      tokensByType[T.WORD_EN] = WORD_EN_TOKENS.map((t, i) => ({
        text: t, weight: 150000 / (i + 1),
      }));

      /* Русские фразы */
      tokensByType[T.PHRASE_RU] = PHRASE_RU_TOKENS.map((t, i) => ({
        text: t, weight: 60000 / (i + 1),
      }));

      /* Английские фразы */
      tokensByType[T.PHRASE_EN] = PHRASE_EN_TOKENS.map((t, i) => ({
        text: t, weight: 20000 / (i + 1),
      }));

      /* Эмодзи */
      tokensByType[T.EMOJI] = EMOJI_TOKENS.map((t, i) => ({
        text: t, weight: 5000 / (i + 1),
      }));

      /* RAW_CHAR — fallback (вес 100 вместо 500) */
      tokensByType[T.RAW_CHAR] = [{ text: '\x00', weight: 100 }];
    }

    /* ─── Определяем переходы состояний ─── */
    let stateTransitions = STATE_TRANSITIONS;
    if (dict && dict.states) {
      const parsed = parseStatesFromJson(dict.states);
      if (parsed && parsed.length === STATE_COUNT) {
        stateTransitions = parsed;
      }
    }

    /* ─── Строим глобальный индекс токенов ─── */
    const allTokens = [];  // { text, type, typeIndex, weight }
    const typeOffsets = new Int32Array(TYPE_COUNT); // начало каждого типа в allTokens
    const typeCounts = new Int32Array(TYPE_COUNT);  // количество токенов каждого типа

    for (let type = 0; type < TYPE_COUNT; type++) {
      typeOffsets[type] = allTokens.length;
      const list = tokensByType[type] || [];
      typeCounts[type] = list.length;
      for (let i = 0; i < list.length; i++) {
        allTokens.push({
          text: list[i].text,
          type,
          typeIndex: i,
          weight: list[i].weight,
        });
      }
    }

    /* ─── Строим текст→токен lookup для энкодинга ───
       Добавляем case-insensitive вариант (lowercase → токен) */
    const textToToken = new Map();

    for (let i = 0; i < allTokens.length; i++) {
      const t = allTokens[i];
      if (t.type === T.RAW_CHAR) continue; // RAW_CHAR не ищется по тексту

      /* Точный матч — длинные токены имеют приоритет */
      if (!textToToken.has(t.text) || t.text.length > (textToToken.get(t.text)?.text?.length || 0)) {
        textToToken.set(t.text, i);
      }

      /* Case-insensitive матч для WORD_EN и PHRASE_EN */
      if (t.type === T.WORD_EN || t.type === T.PHRASE_EN) {
        const lower = t.text.toLowerCase();
        if (lower !== t.text) {
          if (!textToToken.has(lower) || t.text.length > (textToToken.get(lower)?.text?.length || 0)) {
            textToToken.set(lower, i);
          }
        }
      }
    }

    /* ─── Строим Хаффман-декодеры для каждого типа (Level 2) ─── */
    /* _prefix захвачен в замыкании IIFE (app.library._prefix удаляется lib-api.js) */
    const typeDecoders = new Array(TYPE_COUNT);

    for (let type = 0; type < TYPE_COUNT; type++) {
      const list = tokensByType[type] || [];
      if (list.length === 0) {
        typeDecoders[type] = null;
        continue;
      }
      const weights = list.map(t => t.weight);
      typeDecoders[type] = _prefix.buildDecoder(weights);
    }

    /* ─── Строим Хаффман-декодеры для каждого состояния (Level 1) ─── */
    const stateDecoders = new Array(STATE_COUNT);

    for (let state = 0; state < STATE_COUNT; state++) {
      const trans = stateTransitions[state];
      const weights = trans.map(t => t.w);
      stateDecoders[state] = _prefix.buildDecoder(weights);
    }

    _table = {
      allTokens,
      tokensByType,
      typeOffsets,
      typeCounts,
      textToToken,
      typeDecoders,
      stateDecoders,
      STATE_TRANSITIONS: stateTransitions,
    };

    return _table;
  }

  /* ═══════════════════════════════════════════════════════════
     ТОКЕНИЗАЦИЯ ТЕКСТА ДЛЯ ЭНКОДИНГА
     ═══════════════════════════════════════════════════════════
     Position-based greedy longest-match с case-insensitive lookup
     и явной обработкой пробелов.

     Порядок:
       1. Фразы (longest match first)
       2. Слова
       3. Односимвольные токены (space, newline, dot, punct, emoji)
       4. RAW_CHAR fallback */

  function tokenizeForEncoding(text, table) {
    const tokens = []; // массив индексов в allTokens (или {isRaw, codePoint})
    let pos = 0;
    const t2t = table.textToToken;
    const all = table.allTokens;

    const PHRASE_MAX_LEN = 60; // максимальная длина фразы в символах

    while (pos < text.length) {
      let matched = false;

      /* 1. Пробуем фразы (самые длинные совпадения) */
      for (let len = Math.min(PHRASE_MAX_LEN, text.length - pos); len >= 4 && !matched; len--) {
        const substr = text.slice(pos, pos + len);
        const lowerSubstr = substr.toLowerCase();

        /* Сначала точное совпадение, затем case-insensitive */
        let idx = t2t.get(substr);
        if (idx === undefined) idx = t2t.get(lowerSubstr);

        if (idx !== undefined) {
          const tok = all[idx];
          if (tok.type === T.PHRASE_RU || tok.type === T.PHRASE_EN) {
            tokens.push(idx);
            pos += len;
            matched = true;
          }
        }
      }
      if (matched) continue;

      /* 2. Пробуем слова (от длинных к коротким) */
      for (let len = Math.min(40, text.length - pos); len >= 1 && !matched; len--) {
        const substr = text.slice(pos, pos + len);
        const lowerSubstr = substr.toLowerCase();

        let idx = t2t.get(substr);
        if (idx === undefined) idx = t2t.get(lowerSubstr);

        if (idx !== undefined) {
          const tok = all[idx];
          if (tok.type === T.WORD_RU || tok.type === T.WORD_EN) {
            tokens.push(idx);
            pos += len;
            matched = true;
          }
        }
      }
      if (matched) continue;

      /* 3. Односимвольные токены: пробел, перевод строки, точка */
      const ch = text[pos];
      if (ch === ' ') {
        tokens.push(table.typeOffsets[T.SPACE]);
        pos++;
        continue;
      }
      if (ch === '\n') {
        tokens.push(table.typeOffsets[T.NEWLINE]);
        pos++;
        continue;
      }
      if (ch === '.') {
        tokens.push(table.typeOffsets[T.DOT]);
        pos++;
        continue;
      }

      /* 4. Пунктуация и эмодзи — пробуем multi-char (emoji sequences),
         затем single-char */
      for (let len = Math.min(4, text.length - pos); len >= 1 && !matched; len--) {
        const substr = text.slice(pos, pos + len);
        const idx = t2t.get(substr);
        if (idx !== undefined) {
          const tok = all[idx];
          if (tok.type === T.PUNCT || tok.type === T.EMOJI) {
            tokens.push(idx);
            pos += len;
            matched = true;
          }
        }
      }
      if (matched) continue;

      /* 5. RAW_CHAR fallback */
      tokens.push({
        isRaw: true,
        codePoint: text.codePointAt(pos),
      });
      pos += (ch.codePointAt(0) > 0xFFFF) ? 2 : 1;
    }

    return tokens;
  }

  /* ─── Определяем тип токена по его индексу или структуре ─── */

  function getTokenType(tokenIdx, table) {
    if (tokenIdx && tokenIdx.isRaw) return T.RAW_CHAR;
    return table.allTokens[tokenIdx].type;
  }

  /* ─── Определяем следующее состояние по типу токена ─── */

  function getNextState(currentState, tokenType) {
    const trans = STATE_TRANSITIONS[currentState];
    for (const t of trans) {
      if (t.type === tokenType) return t.ns;
    }
    return S.START;
  }

  /* ─── Определяем индекс перехода для типа в данном состоянии ─── */

  function getTransitionIndex(state, tokenType) {
    const trans = STATE_TRANSITIONS[state];
    for (let i = 0; i < trans.length; i++) {
      if (trans[i].type === tokenType) return i;
    }
    return -1;
  }

  /* ═══════════════════════════════════════════════════════════
     ЭКСПОРТ
     ═══════════════════════════════════════════════════════════ */

  app.library = app.library || {};
  app.library._tokenTable = {
    T, S, TYPE_COUNT, STATE_COUNT,
    STATE_TRANSITIONS,
    PUNCT_TOKENS, EMOJI_TOKENS, PHRASE_RU_TOKENS, PHRASE_EN_TOKENS,
    WORD_EN_TOKENS,
    buildTokenTable,
    tokenizeForEncoding,
    getTokenType,
    getNextState,
    getTransitionIndex,
    zipfWeights,
    /* NEW */
    loadDictionary,
    isDictionaryLoaded,
    applyTemperature,
    computeTemperature,
  };
})();
