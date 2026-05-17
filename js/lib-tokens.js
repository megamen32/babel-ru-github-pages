(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     ТОКЕННЫЙ ДЕКОДЕР — языковая система координат
     ═══════════════════════════════════════════════════════════
     Каждая страница библиотеки определяется адресом (x, y, z).
     Декодер переводит адрес в текст через:
       1. PRNG seeded by hash(x, y, z)
       2. Temperature = f(magnitude(z))
       3. Конечный автомат → выбор категории токенов
       4. Частотное распределение → выбор конкретного токена

     Малые z → частые токены → человекоподобный текст
     Большие z → редкие токены → шум

     Детерминировано: один адрес → одна страница. */

  /* ─── Английские слова (частотно-упорядоченные, ~500) ─── */
  const EN_WORDS = [
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

  /* ─── Русские фразы (частые 2–4-словные комбинации) ─── */
  const RU_PHRASES = [
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
    'вероятно','по видимому','по моему','по твоему','кажется',
    'очевидно','безусловно','конечно','разумеется','действительно',
    'в самом деле','на практике','по сути','по существу','в принципе',
    'по правде говоря','честно говоря','откровенно говоря','прямо говоря',
    'к счастью','к сожалению','к удивлению','к слову','кстати',
    'между прочим','вдобавок','мало того','не только','скорее чем',
    'для того чтобы','после того как','перед тем как','до того как',
    'с тех пор как','как только','прежде чем','пока не','как вдруг',
    'как назло','как ни странно','как раз','как обычно','как всегда',
    'как прежде','как известно','как оказалось','как выяснилось',
    'совсем наоборот','в точности наоборот','я не знаю','я думаю',
    'я хочу','я могу','я буду','я думаю что','мне кажется',
    'не знаю','не могу','не хочу','не буду','надо сказать',
    'стоит отметить','следует отметить','необходимо отметить',
    'важно понимать','нужно понимать','хочется верить',
    'остаётся только','ничего не осталось','ничего подобного',
    'ничего страшного','как бы не так','всё равно','всё ещё',
    'всё нормально','всё хорошо','всё отлично','всё понятно',
    'не понятно','не обязательно','не обязательно что','вполне возможно',
    'скорее всего это','по видимому это','самое главное',
    'самое важное','самое интересное','с одной стороны это',
    'с другой стороны','и при этом','но при этом','а вот и нет',
    'вот и всё','вот именно','вот это да','ну и что',
    'ну да конечно','ну конечно','ну хорошо','ладно давай',
    'давай попробуем','давай подумаем','я тебя люблю',
    'я тебя ненавижу','я тебе скажу','послушай меня',
    'посмотри на это','подожди немного','подожди минуту',
    'иди сюда','иди туда','подойди ближе','отойди оттуда',
    'не уходи','не уходи пожалуйста','останься со мной',
    'я с тобой','ты со мной','мы вместе','мы здесь',
    'где мы','когда это было','зачем это нужно',
    'почему так','почему не так','как это работает',
    'что это значит','кто это сделал','чей это','сколько стоит',
    'как долго','как далеко','как часто','как много',
    'очень много','очень мало','очень хорошо','очень плохо',
    'очень долго','очень быстро','очень важно','очень интересно',
  ];

  /* ─── Английские фразы (частые комбинации) ─── */
  const EN_PHRASES = [
    'i love you','i want to','i need to','i have to','i am going to',
    'i would like','i think that','i know that','i believe that',
    'it was a','it is a','there is a','there are no','that is why',
    'in order to','as well as','at the same time','on the other hand',
    'in fact','in addition','in particular','in general','in other words',
    'for example','for instance','of course','as a result','as a matter of fact',
    'by the way','on the contrary','in contrast','nevertheless','nonetheless',
    'furthermore','moreover','therefore','consequently','meanwhile',
    'otherwise','regardless','instead','however','thus','hence',
    'once upon a time','to be honest','to tell the truth','to make matters worse',
    'to begin with','to sum up','in conclusion','after all','above all',
    'at last','at least','in the first place','in the second place',
    'what is more','what is worse','not only but also',
    'the problem is','the question is','the point is','the fact is',
    'it seems that','it appears that','it turns out','it happened that',
    'do you know','do you think','do you want','do you need',
    'can you help','can you tell','can you see','will you please',
    'how does it work','how do you know','how can i help',
    'why do you think','why is it so','where do you come from',
    'when did it happen','what does it mean','who is going to',
  ];

  /* ─── Категории токенов ─── */
  const CAT = {
    RU_WORD: 0, EN_WORD: 1, RU_PHRASE: 2, EN_PHRASE: 3,
    PUNCT: 4, DOT: 5, SPACE: 6, NEWLINE: 7, EMOJI: 8, RAW: 9,
  };

  /* ─── Состояния конечного автомата ─── */
  const ST = {
    START: 0,
    AFTER_RU: 1,
    AFTER_EN: 2,
    AFTER_SPACE: 3,
    AFTER_DOT: 4,
    AFTER_PUNCT: 5,
    AFTER_NL: 6,
    AFTER_EMOJI: 7,
  };

  /* ─── Таблица переходов: state → [{cat, nextState, weight}] ───
     weight — относительная вероятность (до температурной коррекции) */
  const TRANSITIONS = [
    /* ST.START */ [
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,   w: 50 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,   w: 15 },
      { cat: CAT.RU_PHRASE,ns: ST.AFTER_RU,   w: 10 },
      { cat: CAT.EN_PHRASE,ns: ST.AFTER_EN,   w: 3 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 3 },
      { cat: CAT.DOT,      ns: ST.AFTER_DOT,   w: 2 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 3 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 2 },
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 12 },
    ],
    /* ST.AFTER_RU */ [
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 65 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 12 },
      { cat: CAT.DOT,      ns: ST.AFTER_DOT,   w: 5 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 5 },
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 8 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 5 },
    ],
    /* ST.AFTER_EN */ [
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 65 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 12 },
      { cat: CAT.DOT,      ns: ST.AFTER_DOT,   w: 5 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 5 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 8 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 5 },
    ],
    /* ST.AFTER_SPACE */ [
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 45 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 18 },
      { cat: CAT.RU_PHRASE,ns: ST.AFTER_RU,    w: 12 },
      { cat: CAT.EN_PHRASE,ns: ST.AFTER_EN,    w: 4 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 2 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 5 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 2 },
      { cat: CAT.DOT,      ns: ST.AFTER_DOT,   w: 2 },
    ],
    /* ST.AFTER_DOT */ [
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 80 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 10 },
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 5 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 3 },
      { cat: CAT.RU_PHRASE,ns: ST.AFTER_RU,    w: 2 },
    ],
    /* ST.AFTER_PUNCT */ [
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 75 },
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 10 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 5 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 5 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 3 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 2 },
    ],
    /* ST.AFTER_NL */ [
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 45 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 15 },
      { cat: CAT.RU_PHRASE,ns: ST.AFTER_RU,    w: 8 },
      { cat: CAT.EN_PHRASE,ns: ST.AFTER_EN,    w: 3 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 3 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 5 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 8 },
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 13 },
    ],
    /* ST.AFTER_EMOJI */ [
      { cat: CAT.SPACE,    ns: ST.AFTER_SPACE, w: 45 },
      { cat: CAT.EMOJI,    ns: ST.AFTER_EMOJI, w: 12 },
      { cat: CAT.NEWLINE,  ns: ST.AFTER_NL,    w: 8 },
      { cat: CAT.RU_WORD,  ns: ST.AFTER_RU,    w: 20 },
      { cat: CAT.EN_WORD,  ns: ST.AFTER_EN,    w: 10 },
      { cat: CAT.DOT,      ns: ST.AFTER_DOT,   w: 3 },
      { cat: CAT.PUNCT,    ns: ST.AFTER_PUNCT, w: 2 },
    ],
  ];

  /* ─── Пунктуация и эмодзи (из алфавита библиотеки) ─── */
  const PUNCT_TOKENS = [',',';',':','!','?','—','…','"'];
  const EMOJI_TOKENS = [
    '🔥','⭐','💯','❌','✅','🎉','💀','👻','🧠','❤',
    '👍','👎','👋','💪','🙏','😂','😭','😤','🥺','🤔',
    '💬','📱','💻','🌍','🎵','☕','🎯','⚡','💎','🔑',
    '🚀','🌙','🎮','🏆','🍺','🌸','🦋','🐱','🐶','🌈',
    '💡','📖','🔔','😎','🥳','💙','🖤','🤷','🤩','💢',
  ];

  /* ═══════════════════════════════════════════════════════════
     PRNG: xoshiro128** — быстрый качественный генератор
     ═══════════════════════════════════════════════════════════ */

  function splitmix64(seed) {
    /* Расширяем seed до 4 × uint32 для xoshiro */
    let z = BigInt(seed);
    const result = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b97f4a7c15n) & 0xFFFFFFFFFFFFFFFFn;
      let x = z;
      x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xFFFFFFFFFFFFFFFFn;
      x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & 0xFFFFFFFFFFFFFFFFn;
      x = (x ^ (x >> 31n)) & 0xFFFFFFFFFFFFFFFFn;
      result[i] = Number(x & 0xFFFFFFFFn);
    }
    return result;
  }

  function createPRNG(seed) {
    const s = splitmix64(seed);
    let s0 = s[0] >>> 0, s1 = s[1] >>> 0, s2 = s[2] >>> 0, s3 = s[3] >>> 0;

    return function next() {
      const result = (Math.imul(s1, 5) >>> 0);
      const t = (s1 << 9) >>> 0;
      s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3;
      s2 ^= t;
      s3 = (Math.imul(s3, 21) | 0) >>> 0;
      return (result >>> 0) / 4294967296;
    };
  }

  /* ─── Hash: fnv1a-64 (BigInt) для координат ─── */
  function hashCoords(x, y, z) {
    /* Комбинируем x, y, z в один BigInt seed */
    const FNV_OFFSET = 14695981039346656037n;
    const FNV_PRIME = 1099511628211n;
    const MASK = 0xFFFFFFFFFFFFFFFFn;

    let h = FNV_OFFSET;
    for (const part of [x, y, z]) {
      let v = BigInt(part);
      /* Обработка знака */
      v = v < 0n ? ~(-v) : v;
      /* Смешиваем каждый байт */
      const bytes = [];
      let tmp = v;
      for (let i = 0; i < 8; i++) {
        bytes.push(Number(tmp & 0xFFn));
        tmp >>= 8n;
      }
      for (const b of bytes) {
        h = (h ^ BigInt(b)) & MASK;
        h = (h * FNV_PRIME) & MASK;
      }
    }
    /* Убедимся что seed != 0 */
    return h === 0n ? 42n : h;
  }

  /* ═══════════════════════════════════════════════════════════
     ТЕМПЕРАТУРА — удалённость от человеческого текста
     ═══════════════════════════════════════════════════════════
     z=1       → temp ≈ 0.03  (очень человечный)
     z=10^3    → temp ≈ 0.30  (разговорный)
     z=10^6    → temp ≈ 0.60  (смешанный)
     z=10^10   → temp ≈ 1.00  (шум) */

  function computeTemperature(z) {
    const bz = BigInt(z);
    const absZ = bz < 0n ? -bz : bz;
    /* log10(absZ) через длину десятичного представления */
    const s = absZ.toString();
    const log10 = s.length - 1 + (s.length > 1 ? (Number(s[0] + '.' + s.slice(1, 4)) - Number(s[0])) : 0);
    return Math.min(1.0, log10 * 0.1);
  }

  /* ═══════════════════════════════════════════════════════════
     ВЫБОР ТОКЕНА — взвешенный + температурная коррекция
     ═══════════════════════════════════════════════════════════ */

  /* Частотные веса для слов: power-law распределение.
     Слова упорядочены по частоте (индекс 0 = самое частое).
     weight(i) = 1 / (i + 1)^alpha, alpha=1.0 (Zipf) */
  function zipfWeight(index, total, temperature) {
    /* Температура «выравнивает» распределение:
       low temp → сильный перекос к началу
       high temp → равномерное */
    const alpha = 0.8 + temperature * 1.2; // 0.8..2.0
    return 1.0 / Math.pow(index + 1, alpha);
  }

  /* Выбор из массива с частотным весом и температурой */
  function selectFromFreqArray(prng, arr, temperature) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];

    /* Top-K: при низкой температуре ограничиваем выбор */
    let k = arr.length;
    if (temperature < 0.2) k = Math.min(arr.length, Math.max(50, Math.floor(arr.length * 0.1)));
    else if (temperature < 0.5) k = Math.min(arr.length, Math.max(200, Math.floor(arr.length * 0.4)));
    const subset = arr.slice(0, k);

    /* Вычисляем веса */
    const weights = new Float64Array(subset.length);
    let total = 0;
    for (let i = 0; i < subset.length; i++) {
      weights[i] = zipfWeight(i, subset.length, temperature);
      total += weights[i];
    }

    /* Roulette selection */
    let roll = prng() * total;
    for (let i = 0; i < subset.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return subset[i];
    }
    return subset[subset.length - 1];
  }

  /* Выбор из малого массива (пунктуация, эмодзи) — равномерно с небольшим перекосом */
  function selectFromSmallArray(prng, arr, temperature) {
    if (arr.length === 0) return '';
    if (temperature > 0.7) {
      /* Высокая температура — равномерно */
      return arr[Math.floor(prng() * arr.length)];
    }
    /* Низкая температура — первые элементы чуть вероятнее */
    const idx = Math.floor(Math.pow(prng(), 1.5) * arr.length);
    return arr[Math.min(idx, arr.length - 1)];
  }

  /* ═══════════════════════════════════════════════════════════
     ВЫБОР КАТЕГОРИИ — по состоянию + температура
     ═══════════════════════════════════════════════════════════ */

  function selectCategory(prng, state, temperature) {
    const trans = TRANSITIONS[state];
    if (!trans || trans.length === 0) {
      /* Fallback: пробел + русское слово */
      return { cat: CAT.SPACE, ns: ST.AFTER_SPACE };
    }

    /* При высокой температуре добавляем RAW категорию и рандомизируем */
    let options = trans;
    if (temperature > 0.6) {
      /* Добавляем raw-шум с весом, растущим с температурой */
      const rawWeight = (temperature - 0.6) * 30;
      options = [...trans, { cat: CAT.RAW, ns: ST.START, w: rawWeight }];
    }

    /* Корректируем веса температурой */
    const weights = new Float64Array(options.length);
    let total = 0;
    for (let i = 0; i < options.length; i++) {
      let w = options[i].w;
      /* При высокой температуре — ослабляем грамматические ограничения */
      if (temperature > 0.4) {
        /* Сглаживаем: малые веса растут, большие уменьшаются */
        const midW = 20; // средний вес
        const factor = 1 + (temperature - 0.4) * 2;
        if (w < midW) w *= factor;
        else w /= factor;
      }
      weights[i] = w;
      total += w;
    }

    let roll = prng() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return { cat: options[i].cat, ns: options[i].ns };
    }
    return { cat: options[options.length - 1].cat, ns: options[options.length - 1].ns };
  }

  /* ═══════════════════════════════════════════════════════════
     ГЛАВНЫЙ ДЕКОДЕР — адрес (x, y, z) → страница 4096 символов
     ═══════════════════════════════════════════════════════════ */

  function decodePage(x, y, z, forcedTokens) {
    const PAGE_LEN = 4096;
    const ALPHABET = app.config.ALG.alphabet;
    const WORD_BANK = app.config.WORD_BANK || [];

    /* 1. Seed PRNG */
    const seed = hashCoords(x, y, z);
    const prng = createPRNG(seed);

    /* 2. Temperature */
    const temperature = computeTemperature(z);

    /* 3. Декодируем токены */
    let result = '';
    let state = ST.START;
    let forcedIdx = 0;

    while (result.length < PAGE_LEN) {
      let token = '';

      /* Если есть принудительные токены (для поиска) — вставляем их */
      if (forcedTokens && forcedIdx < forcedTokens.length) {
        token = forcedTokens[forcedIdx++];
        /* Обновляем состояние по типу токена */
        if (token === ' ') state = ST.AFTER_SPACE;
        else if (token === '\n') state = ST.AFTER_NL;
        else if (token === '.') state = ST.AFTER_DOT;
        else if (PUNCT_TOKENS.includes(token)) state = ST.AFTER_PUNCT;
        else if (EMOJI_TOKENS.includes(token)) state = ST.AFTER_EMOJI;
        else if (token.match(/^[a-z]/)) state = ST.AFTER_EN;
        else state = ST.AFTER_RU;
      } else {
        /* Нормальный выбор токена */
        const { cat, ns } = selectCategory(prng, state, temperature);
        state = ns;

        switch (cat) {
          case CAT.RU_WORD:
            token = selectFromFreqArray(prng, WORD_BANK, temperature);
            break;
          case CAT.EN_WORD:
            token = selectFromFreqArray(prng, EN_WORDS, temperature);
            break;
          case CAT.RU_PHRASE:
            token = selectFromFreqArray(prng, RU_PHRASES, temperature);
            break;
          case CAT.EN_PHRASE:
            token = selectFromFreqArray(prng, EN_PHRASES, temperature);
            break;
          case CAT.PUNCT:
            token = selectFromSmallArray(prng, PUNCT_TOKENS, temperature);
            break;
          case CAT.DOT:
            token = '.';
            break;
          case CAT.SPACE:
            token = ' ';
            break;
          case CAT.NEWLINE:
            token = '\n';
            break;
          case CAT.EMOJI:
            token = selectFromSmallArray(prng, EMOJI_TOKENS, temperature);
            break;
          case CAT.RAW:
            /* Сырой символ из алфавита — при высокой температуре */
            token = ALPHABET[Math.floor(prng() * ALPHABET.length)];
            break;
          default:
            token = ' ';
        }
      }

      result += token;
    }

    /* Обрезаем до точной длины страницы */
    if (result.length > PAGE_LEN) {
      /* Обрезаем по границе слова/пробела, если возможно */
      const cut = result.slice(0, PAGE_LEN);
      result = cut;
    }
    /* Дополняем пробелами если не хватило (маловероятно) */
    while (result.length < PAGE_LEN) result += ' ';

    return result;
  }

  /* ═══════════════════════════════════════════════════════════
     ПОИСК — найти адрес, где токенный декодер содержит фразу
     ═══════════════════════════════════════════════════════════ */

  function findPhraseInTokenSpace(phrase, maxScan) {
    /* Для поиска используем forced-токены:
       берём случайные (x, y) и вставляем фразу в начало страницы,
       заполненную токенным декодером */
    const ALG = app.config.ALG;
    const PAGE_LEN = ALG.pageLength;

    const normalized = phrase.toLowerCase().trim();
    if (!normalized) return null;

    /* Разбиваем фразу на токены для вставки */
    const forcedTokens = normalized.split(/(\s+)/).filter(t => t.length > 0);

    /* Выбираем случайные координаты зала */
    const x = Math.floor(Math.random() * 2000) - 1000;
    const y = Math.floor(Math.random() * 2000) - 1000;

    /* Малый z → низкая температура → читаемый контекст */
    const z = 1n + BigInt(Math.floor(Math.random() * 1000));

    /* Генерируем страницу с принудительными токенами */
    const text = decodePage(x, y, z, forcedTokens);

    /* Ищем позицию фразы в тексте */
    const lowerText = text.toLowerCase();
    const phrasePos = lowerText.indexOf(normalized);

    return {
      x: BigInt(x),
      y: BigInt(y),
      z,
      text,
      phrasePos: phrasePos >= 0 ? phrasePos : 0,
      phraseLen: normalized.length,
      temperature: computeTemperature(z),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     КЛАССИФИКАЦИЯ СТРАНИЦЫ — по температуре
     ═══════════════════════════════════════════════════════════ */

  function classifyPageByTemp(z) {
    const temp = computeTemperature(z);
    if (temp < 0.15) return { kind: 'text', label: 'Читаемый текст', score: 1 - temp, icon: '📖' };
    if (temp < 0.35) return { kind: 'dialogue', label: 'Разговорный', score: 0.8, icon: '💬' };
    if (temp < 0.55) return { kind: 'sparse', label: 'Разреженный', score: 0.5, icon: '🌫️' };
    if (temp < 0.75) return { kind: 'noise', label: 'Шум', score: 0.3, icon: '🔇' };
    return { kind: 'raw', label: 'Хаос', score: 0.1, icon: '💀' };
  }

  /* ═══════════════════════════════════════════════════════════
     ЭКСПОРТ
     ═══════════════════════════════════════════════════════════ */

  app.library = app.library || {};
  app.library._tokens = {
    EN_WORDS,
    RU_PHRASES,
    EN_PHRASES,
    PUNCT_TOKENS,
    EMOJI_TOKENS,
    CAT,
    ST,
    TRANSITIONS,
    createPRNG,
    hashCoords,
    computeTemperature,
    decodePage,
    findPhraseInTokenSpace,
    classifyPageByTemp,
    selectFromFreqArray,
    selectCategory,
  };
})();
