
const VERSION = "ru1";
const ALG = {
  label: "ru1",
  alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
  pageLength: 900,
  lineWidth: 90,
  pagesPerVolume: 410n,
  volumesPerShelf: 32n,
  shelvesPerWall: 5n,
  wallsPerHall: 4n,
  hallsPerSector: 20n,
};
const DEFAULT_VARIANTS = 8;
const MAX_VARIANTS = 48;
const ADDRESS_GROUP = 8;
const $ = (sel) => document.querySelector(sel);

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function fnv1a(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;}
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function rngFrom(text){return mulberry32(fnv1a(text));}
function normalizeText(raw){const lower=String(raw||"").toLowerCase().replace(/\s+/g," ").trim();let out="";for(const ch of lower){out += ALG.alphabet.includes(ch) ? ch : " ";}return out.replace(/\s+/g," ").trim();}
function fixedPageText(text){let s=normalizeText(text);if(s.length>ALG.pageLength)s=s.slice(0,ALG.pageLength);return s.padEnd(ALG.pageLength," ");}
function maxPageNumber(){return BigInt(ALG.alphabet.length)**BigInt(ALG.pageLength);}
function textToNumber(text){const base=BigInt(ALG.alphabet.length);const fixed=fixedPageText(text);let n=0n;for(const ch of fixed){const d=ALG.alphabet.indexOf(ch);if(d<0)throw new Error(`Символ не входит в алфавит: ${ch}`);n=n*base+BigInt(d);}return n;}
function numberToText(n){const max=maxPageNumber();let x=BigInt(n);if(x<0n||x>=max)throw new Error("Адрес вне пространства библиотеки.");const base=BigInt(ALG.alphabet.length);const chars=new Array(ALG.pageLength);for(let i=ALG.pageLength-1;i>=0;i--){const d=Number(x%base);chars[i]=ALG.alphabet[d];x=x/base;}return chars.join("");}
function bigintToBase36(n){return BigInt(n).toString(36);}
function cleanAddress(s){return String(s||"").toLowerCase().replace(/[^0-9a-z]/g,"");}
function base36ToBigInt(s){const clean=cleanAddress(s);if(!clean)return 0n;let n=0n;for(const ch of clean){const code=ch.charCodeAt(0);let d;if(code>=48&&code<=57)d=code-48;else if(code>=97&&code<=122)d=code-87;else continue;n=n*36n+BigInt(d);}return n;}
function bytesToBase64Url(bytes){let bin="";for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function base64UrlToBytes(s){const base=String(s||"").replace(/-/g,"+").replace(/_/g,"/");const padded=base+"=".repeat((4-base.length%4)%4);const bin=atob(padded);return Uint8Array.from([...bin].map(ch=>ch.charCodeAt(0)));}
function bigIntToBytes(n){let x=BigInt(n);if(x===0n)return new Uint8Array([0]);const arr=[];while(x>0n){arr.push(Number(x&255n));x >>= 8n;}return Uint8Array.from(arr.reverse());}
function bytesToBigInt(bytes){let n=0n;for(const b of bytes)n=(n<<8n)+BigInt(b);return n;}
function numberToB64(n){return bytesToBase64Url(bigIntToBytes(n));}
function b64ToNumber(s){return bytesToBigInt(base64UrlToBytes(s));}
function prettyBase36(n){const clean=bigintToBase36(n);const chunks=[];for(let i=0;i<clean.length;i+=ADDRESS_GROUP)chunks.push(clean.slice(i,i+ADDRESS_GROUP));return chunks.join("-");}

function numberToCoordinates(n){
  let x=BigInt(n);
  const page=(x%ALG.pagesPerVolume)+1n; x/=ALG.pagesPerVolume;
  const volume=(x%ALG.volumesPerShelf)+1n; x/=ALG.volumesPerShelf;
  const shelf=(x%ALG.shelvesPerWall)+1n; x/=ALG.shelvesPerWall;
  const wall=(x%ALG.wallsPerHall)+1n; x/=ALG.wallsPerHall;
  const hall=(x%ALG.hallsPerSector)+1n; x/=ALG.hallsPerSector;
  const sector=x+1n;
  return {sector,hall,wall,shelf,volume,page};
}
function coordinatesToNumber(c){
  const sector=BigInt(c.sector||1),hall=BigInt(c.hall||1),wall=BigInt(c.wall||1),shelf=BigInt(c.shelf||1),volume=BigInt(c.volume||1),page=BigInt(c.page||1);
  if(sector<1n||hall<1n||hall>ALG.hallsPerSector||wall<1n||wall>ALG.wallsPerHall||shelf<1n||shelf>ALG.shelvesPerWall||volume<1n||volume>ALG.volumesPerShelf||page<1n||page>ALG.pagesPerVolume)throw new Error("Координаты вне геометрии библиотеки.");
  let x=sector-1n;
  x=x*ALG.hallsPerSector+(hall-1n);
  x=x*ALG.wallsPerHall+(wall-1n);
  x=x*ALG.shelvesPerWall+(shelf-1n);
  x=x*ALG.volumesPerShelf+(volume-1n);
  x=x*ALG.pagesPerVolume+(page-1n);
  if(x>=maxPageNumber())throw new Error("Координаты дают число вне пространства страниц.");
  return x;
}
function coordinateUrl(c, hl=null){const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}/volume/${c.volume}/page/${c.page}${q}`;}
function volumeUrl(c){return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}/volume/${c.volume}`;}
function shelfUrl(c){return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}`;}
function raw36Url(n,hl=null){const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/a36/${prettyBase36(n)}${q}`;}
function raw64Url(n,hl=null){const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/a64/${numberToB64(n)}${q}`;}
function coordinateTitle(c){return `Сектор ${c.sector} · Зал ${c.hall} · Стена ${c.wall} · Полка ${c.shelf} · Том ${c.volume} · Лист ${c.page}`;}
function parseHighlight(params){const raw=params.get("hl")||"";const m=raw.match(/^(\d+):(\d+)$/);return m?{start:Number(m[1]),length:Number(m[2])}:null;}
function paragraphize(text){const clean=String(text).replace(/\s+$/g,"");const parts=[];for(let i=0;i<clean.length;i+=ALG.lineWidth)parts.push(clean.slice(i,i+ALG.lineWidth));return parts.join("\n");}
function highlightByRange(text,range){const s=Math.max(0,Math.min(text.length,range.start));const e=Math.max(s,Math.min(text.length,range.start+range.length));return `${esc(paragraphize(text.slice(0,s)))}<mark>${esc(paragraphize(text.slice(s,e)))}</mark>${esc(paragraphize(text.slice(e)))}`;}
function renderText(text,hl){return hl?highlightByRange(text,hl):esc(paragraphize(text));}
function snippetByRange(text,range,pad=80){const s=Math.max(0,range.start-pad),e=Math.min(text.length,range.start+range.length+pad);return `${s>0?"… ":""}${text.slice(s,e).trim()}${e<text.length?" …":""}`;}

function randomPageText(){const rng=rngFrom(`${Date.now()}:${Math.random()}`);let s="";for(let i=0;i<ALG.pageLength;i++)s+=ALG.alphabet[Math.floor(rng()*ALG.alphabet.length)];return s;}
function makePageWithPhrase(phraseRaw,variant,strategy,offset=0){
  const phrase=normalizeText(phraseRaw); if(!phrase)throw new Error("После нормализации фраза пустая."); if(phrase.length>ALG.pageLength)throw new Error(`Фраза длиннее страницы: ${phrase.length} символов при лимите ${ALG.pageLength}.`);
  const variantNumber=offset+variant; const rng=rngFrom(`${VERSION}:phrase:${phrase}:variant:${variantNumber}:strategy:${strategy}`); const chars=new Array(ALG.pageLength);
  for(let i=0;i<ALG.pageLength;i++)chars[i]=ALG.alphabet[Math.floor(rng()*ALG.alphabet.length)];
  if(strategy==="quiet"||strategy==="center"){for(let i=0;i<ALG.pageLength;i++)if(rng()<.18)chars[i]=" ";}
  const maxPos=ALG.pageLength-phrase.length; let position;
  if(strategy==="start")position=Math.min(24,maxPos); else if(strategy==="end")position=Math.max(0,maxPos-24); else if(strategy==="center")position=Math.max(0,Math.floor((ALG.pageLength-phrase.length)/2)); else position=Math.floor(rng()*(maxPos+1));
  if(position>0)chars[position-1]=" "; for(let i=0;i<phrase.length;i++)chars[position+i]=phrase[i]; if(position+phrase.length<chars.length)chars[position+phrase.length]=" ";
  return {phrase,variant:variantNumber,position,text:chars.join("")};
}

function pushHistory(item){
  const items=getHistory().filter(x=>x.url!==item.url);
  items.unshift({...item,createdAt:new Date().toISOString()});
  localStorage.setItem("babelHistory",JSON.stringify(items.slice(0,80)));
}
function getHistory(){try{return JSON.parse(localStorage.getItem("babelHistory")||"[]");}catch{return[];}}
function getFavorites(){try{return JSON.parse(localStorage.getItem("babelFavorites")||"[]");}catch{return[];}}
function saveFavorites(items){localStorage.setItem("babelFavorites",JSON.stringify(items.slice(0,100)));}
function addFavorite(item){const key=item.n;const items=getFavorites().filter(x=>x.n!==key);items.unshift({...item,createdAt:new Date().toISOString()});saveFavorites(items);}

function tabs(active){return `
  <div class="tabs">
    <a class="button tab ${active==="find"?"active":""}" href="#/">Найти адреса</a>
    <a class="button tab ${active==="encode"?"active":""}" href="#/encode">Кодировать текст</a>
    <a class="button tab ${active==="history"?"active":""}" href="#/history">История</a>
    <a class="button tab ${active==="about"?"active":""}" href="#/about">Как работает</a>
  </div>`;}

function renderHome(){
  const params=new URLSearchParams(location.hash.split("?")[1]||"");
  const q=params.get("q")||"", offset=Number(params.get("offset")||"0"), count=Number(params.get("count")||DEFAULT_VARIANTS), strategy=params.get("strategy")||"random";
  $("#app").innerHTML=`
    <section class="grid">
      <div class="card">${tabs("find")}
        <h1>Найти координаты страниц, содержащих фразу</h1>
        <p>Это не поиск по базе. Мы строим полную страницу с фразой, кодируем её в число и раскладываем число в настоящие координаты.</p>
        <div class="notice good">Один алгоритм <code>${VERSION}</code>. Никаких трёх режимов размера. Для компактности есть два формата адреса: координаты/base36 и base64url.</div>
        <form id="phraseForm">
          <textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку">${esc(q)}</textarea>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label>Вариантов</label><input id="variantCountInput" inputmode="numeric" value="${Number.isFinite(count)?count:DEFAULT_VARIANTS}"></div>
            <div class="field"><label>Смещение</label><input id="offsetInput" inputmode="numeric" value="${Number.isFinite(offset)?offset:0}"></div>
            <div class="field"><label>Расположение</label><select id="strategyInput">
              ${[["random","разные места"],["center","по центру"],["start","в начале"],["end","в конце"],["quiet","тихое окружение"]].map(([k,l])=>`<option value="${k}" ${k===strategy?"selected":""}>${l}</option>`).join("")}
            </select></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Показать варианты</button>
            <button id="nextBatchBtn" type="button">Следующие варианты</button>
            <button id="shareFindBtn" type="button">Скопировать ссылку на результаты</button>
          </div>
        </form>
        <div id="results" class="variants"></div>
      </div>
      <aside class="card">
        <h2>Открыть координаты</h2>
        <form id="coordForm">
          <div class="coord-grid">
            ${[["sector","Сектор","1"],["hall","Зал","1"],["wall","Стена","1"],["shelf","Полка","1"],["volume","Том","1"],["page","Лист","1"]].map(([id,l,v])=>`<div class="field"><label>${l}</label><input id="${id}Input" value="${v}" inputmode="numeric"></div>`).join("")}
          </div>
          <div class="row" style="margin-top:10px"><button class="primary" type="submit">Открыть страницу</button></div>
        </form>
        <h2 style="margin-top:22px">Открыть raw-адрес</h2>
        <form id="addressForm">
          <select id="addressKindInput"><option value="a64">base64url, компактный</option><option value="a36">base36, читаемый</option></select>
          <input id="addressInput" class="mono" style="margin-top:10px" placeholder="base64url или base36-адрес">
          <div class="row" style="margin-top:10px"><button class="primary" type="submit">Открыть</button></div>
        </form>
        <div class="notice">Один том — ${ALG.pagesPerVolume} страниц. Одна полка — ${ALG.volumesPerShelf} тома.</div>
      </aside>
    </section>`;
  $("#phraseForm").addEventListener("submit",e=>{e.preventDefault();const q=$("#phraseInput").value.trim();location.hash=`#/find?q=${encodeURIComponent(q)}&offset=${encodeURIComponent($("#offsetInput").value||"0")}&count=${encodeURIComponent($("#variantCountInput").value||DEFAULT_VARIANTS)}&strategy=${encodeURIComponent($("#strategyInput").value)}`;});
  $("#nextBatchBtn").addEventListener("click",()=>{const c=Math.max(1,Math.min(MAX_VARIANTS,Number($("#variantCountInput").value)||DEFAULT_VARIANTS));const off=Number($("#offsetInput").value)||0;location.hash=`#/find?q=${encodeURIComponent($("#phraseInput").value.trim())}&offset=${off+c}&count=${c}&strategy=${encodeURIComponent($("#strategyInput").value)}`;});
  $("#shareFindBtn").addEventListener("click",async()=>{await navigator.clipboard.writeText(location.href);alert("Ссылка на результаты скопирована.");});
  $("#coordForm").addEventListener("submit",e=>{e.preventDefault();try{const c={sector:$("#sectorInput").value,hall:$("#hallInput").value,wall:$("#wallInput").value,shelf:$("#shelfInput").value,volume:$("#volumeInput").value,page:$("#pageInput").value};coordinatesToNumber(c);location.hash=coordinateUrl(c);}catch(err){alert(err.message);}});
  $("#addressForm").addEventListener("submit",e=>{e.preventDefault();try{const kind=$("#addressKindInput").value, raw=$("#addressInput").value.trim();let n=kind==="a64"?b64ToNumber(raw):base36ToBigInt(raw);if(n>=maxPageNumber())throw new Error("Адрес вне пространства библиотеки.");location.hash=coordinateUrl(numberToCoordinates(n));}catch(err){alert(err.message);}});
  if(q)renderVariants({phraseRaw:q,countRaw:count,strategy,offsetRaw:offset});
}

function renderVariants({phraseRaw,countRaw,strategy,offsetRaw}){
  const results=$("#results"); results.innerHTML="";
  let count=Math.max(1,Math.min(MAX_VARIANTS,Math.floor(Number(countRaw)||DEFAULT_VARIANTS)));
  let offset=Math.max(0,Math.floor(Number(offsetRaw)||0));
  try{
    const normalized=normalizeText(phraseRaw); if(!normalized)throw new Error("После нормализации фраза пустая.");
    const items=[];
    for(let i=1;i<=count;i++){
      const page=makePageWithPhrase(normalized,i,strategy,offset);
      const n=textToNumber(page.text); const c=numberToCoordinates(n); const range={start:page.position,length:normalized.length};
      const preview=snippetByRange(page.text,range);
      items.push(`<div class="variant">
        <strong>Вариант ${page.variant} · позиция ${page.position+1}</strong>
        <small>${highlightByRange(preview,{start:Math.max(0,preview.indexOf(normalized)),length:normalized.length})}</small>
        <div class="pretty-address"><small>Координаты</small><div class="address-line">
          <span class="chunk">sector ${c.sector}</span><span class="chunk">hall ${c.hall}</span><span class="chunk">wall ${c.wall}</span><span class="chunk">shelf ${c.shelf}</span><span class="chunk">volume ${c.volume}</span><span class="chunk">page ${c.page}</span>
        </div><small>Компактный base64url</small><div class="mono">${esc(numberToB64(n))}</div></div>
        <div class="row"><a class="button primary" href="${coordinateUrl(c,range)}">Открыть страницу</a><button data-copy="${esc(coordinateUrl(c,range))}" type="button">Скопировать координаты</button><button data-copy64="${esc(raw64Url(n,range))}" type="button">Скопировать base64url</button></div>
      </div>`);
    }
    results.innerHTML=items.join("");
    results.querySelectorAll("button[data-copy]").forEach(btn=>btn.addEventListener("click",async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${btn.dataset.copy}`);alert("Координатная ссылка скопирована.");}));
    results.querySelectorAll("button[data-copy64]").forEach(btn=>btn.addEventListener("click",async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${btn.dataset.copy64}`);alert("base64url-ссылка скопирована.");}));
  }catch(err){results.innerHTML=`<div class="notice warning">${esc(err.message)}</div>`;}
}

function renderPage(n,params){
  if(n<0n||n>=maxPageNumber())throw new Error("Адрес вне пространства библиотеки.");
  const text=numberToText(n); const c=numberToCoordinates(n); const hl=parseHighlight(params); const title=coordinateTitle(c); const url=coordinateUrl(c,hl);
  pushHistory({type:"page",title,n:n.toString(),url:`${location.hash}`,coordinates:serializeCoords(c)});
  $("#app").innerHTML=`
    <article class="card">
      <h1>${esc(title)}</h1>
      <div class="address"><span class="badge">${VERSION}</span><span class="badge">координаты реальные</span><span class="badge">${ALG.pageLength} символов</span><span class="badge">алфавит ${ALG.alphabet.length}</span></div>
      <div class="controls">
        <a class="button" href="${coordinateUrl(numberToCoordinates(n>0n?n-1n:maxPageNumber()-1n))}">← страница</a>
        <a class="button" href="${coordinateUrl(numberToCoordinates((n+1n)%maxPageNumber()))}">страница →</a>
        <a class="button" href="${volumeUrl(c)}">Открыть том</a>
        <a class="button" href="${shelfUrl(c)}">Открыть полку</a>
      </div>
      <div class="controls" style="margin-top:10px">
        <button id="favoriteBtn" type="button">★ В избранное</button><button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="copyCoordBtn" type="button">Скопировать координаты</button><button id="copy64Btn" type="button">Скопировать base64url</button>
        <button id="copySelBtn" type="button">Ссылка на выделение</button><button id="roundtripBtn" type="button">Самопроверка</button><button id="downloadBtn" type="button">Скачать .txt</button>
      </div>
      <div class="notice good">Страница восстановлена из координат. Также доступен компактный адрес <code>base64url</code>.</div>
      ${passport(n,c)}
      <div id="pageText" class="page-text" style="margin-top:18px">${renderText(text,hl)}</div>
    </article>`;
  $("#favoriteBtn").onclick=()=>{addFavorite({title,n:n.toString(),url:location.hash,createdAt:new Date().toISOString()});alert("Добавлено в избранное.");};
  $("#copyTextBtn").onclick=async()=>{await navigator.clipboard.writeText(text);alert("Текст скопирован.");};
  $("#copyCoordBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);alert("Координатная ссылка скопирована.");};
  $("#copy64Btn").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${raw64Url(n,hl)}`);alert("base64url-ссылка скопирована.");};
  $("#copySelBtn").onclick=async()=>copySelectionLink(c,text);
  $("#roundtripBtn").onclick=()=>runSelfTest(n,text,c);
  $("#downloadBtn").onclick=()=>downloadText(`${title}\n\n${text}\n\nКоординаты:\n${location.href}\n\nbase64url:\n${location.origin}${location.pathname}${raw64Url(n,hl)}\n`);
}
function serializeCoords(c){return {sector:String(c.sector),hall:String(c.hall),wall:String(c.wall),shelf:String(c.shelf),volume:String(c.volume),page:String(c.page)};}
function passport(n,c){return `<div class="pretty-address">
  <small>Паспорт страницы</small>
  <div class="address-line"><span class="chunk">sector ${c.sector}</span><span class="chunk">hall ${c.hall}</span><span class="chunk">wall ${c.wall}</span><span class="chunk">shelf ${c.shelf}</span><span class="chunk">volume ${c.volume}</span><span class="chunk">page ${c.page}</span></div>
  <small>base64url</small><div class="mono">${esc(numberToB64(n))}</div>
  <small>base36</small><div class="address-line">${prettyBase36(n).split("-").map(x=>`<span class="chunk">${esc(x)}</span>`).join("")}</div>
</div>`;}
function copySelectionLink(c,text){
  const selected=String(window.getSelection ? window.getSelection().toString() : "").replace(/\s+/g," ").trim();
  if(!selected){alert("Сначала выдели фрагмент текста на странице.");return;}
  const normalized=normalizeText(selected);
  const pos=text.indexOf(normalized);
  if(pos<0){alert("Не смог найти выделение в нормализованном тексте. Лучше выделять фрагмент без переносов строки.");return;}
  const link=`${location.origin}${location.pathname}${coordinateUrl(c,{start:pos,length:normalized.length})}`;
  navigator.clipboard.writeText(link).then(()=>alert("Ссылка на выделенный фрагмент скопирована."));
}
function runSelfTest(n,text,c){
  const againN=textToNumber(text), againC=numberToCoordinates(againN), b64=numberToB64(n), from64=b64ToNumber(b64);
  const ok=againN===n && from64===n && coordinatesToNumber(c)===n;
  $("#app").insertAdjacentHTML("afterbegin",`<section class="card" style="margin-bottom:18px"><h2>Самопроверка алгоритма</h2><div class="steps">
    <div class="step"><strong>1. Координаты → BigInt</strong><small class="mono">${coordinatesToNumber(c).toString()}</small></div>
    <div class="step"><strong>2. BigInt → текст</strong><small>${ALG.pageLength} символов</small></div>
    <div class="step"><strong>3. Текст → BigInt</strong><small class="mono">${againN.toString()}</small></div>
    <div class="step"><strong>4. BigInt → base64url → BigInt</strong><small class="mono">${esc(b64)}</small></div>
    <div class="step"><strong>5. BigInt → координаты</strong><small>${esc(coordinateTitle(againC))}</small></div>
  </div><div class="notice ${ok?"good":"warning"}">${ok?"Проверка пройдена: координаты, текст, base36/base64url согласованы.":"Проверка не пройдена."}</div></section>`);
}

function renderVolume(c){
  coordinatesToNumber({...c,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}<h1>${esc(`Том ${c.volume}`)}</h1>
    <div class="address"><span class="badge">sector ${c.sector}</span><span class="badge">hall ${c.hall}</span><span class="badge">wall ${c.wall}</span><span class="badge">shelf ${c.shelf}</span><span class="badge">volume ${c.volume}</span></div>
    <div class="controls"><a class="button" href="${shelfUrl(c)}">Открыть полку</a></div>
    <div class="book-grid">${Array.from({length:Number(ALG.pagesPerVolume)},(_,i)=>{const p=i+1;return `<a class="book-page" href="${coordinateUrl({...c,page:p})}"><strong>${p}</strong><small>лист</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"volume",title:`Том ${c.volume}`,url:location.hash,coordinates:serializeCoords(c)});
}
function renderShelf(c){
  coordinatesToNumber({...c,volume:1,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}<h1>${esc(`Полка ${c.shelf}`)}</h1>
    <div class="address"><span class="badge">sector ${c.sector}</span><span class="badge">hall ${c.hall}</span><span class="badge">wall ${c.wall}</span><span class="badge">shelf ${c.shelf}</span></div>
    <div class="shelf-grid">${Array.from({length:Number(ALG.volumesPerShelf)},(_,i)=>{const v=i+1;return `<a class="shelf-volume" href="${volumeUrl({...c,volume:v,page:1})}"><strong>Том ${v}</strong><small>${ALG.pagesPerVolume} страниц</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"shelf",title:`Полка ${c.shelf}`,url:location.hash,coordinates:serializeCoords(c)});
}

function renderEncode(){
  $("#app").innerHTML=`<section class="grid"><div class="card">${tabs("encode")}<h1>Сделать текст страницей библиотеки</h1><p>Текст нормализуется, дополняется пробелами до ${ALG.pageLength} символов и превращается в настоящие координаты.</p>
  <form id="encodeForm"><textarea id="encodeTextInput" placeholder="Введите текст страницы"></textarea><div class="row" style="margin-top:10px"><button class="primary" type="submit">Получить координаты</button></div></form><div id="encodeResult"></div></div>
  <aside class="card"><h2>Что получится</h2><p>Координатная ссылка, base36 и компактный base64url.</p></aside></section>`;
  $("#encodeForm").onsubmit=e=>{e.preventDefault();try{const n=textToNumber($("#encodeTextInput").value);const c=numberToCoordinates(n);$("#encodeResult").innerHTML=`<div class="notice good">Текст превращён в страницу библиотеки.</div>${passport(n,c)}<div class="row"><a class="button primary" href="${coordinateUrl(c)}">Открыть страницу</a><button id="copyEnc64" type="button">Скопировать base64url</button></div>`;$("#copyEnc64").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${raw64Url(n)}`);alert("base64url скопирован.");};}catch(err){$("#encodeResult").innerHTML=`<div class="notice warning">${esc(err.message)}</div>`;}}
}
function renderHistory(){
  const items=getHistory();
  $("#app").innerHTML=`<section class="card">${tabs("history")}<h1>История</h1><p>Локальная история в этом браузере. Она не нужна для восстановления страниц — координаты сами всё восстанавливают.</p><div class="row"><button id="clearHistoryBtn">Очистить историю</button></div><div class="history">${items.length?items.map((it,idx)=>`<div class="history-item"><strong>${esc(it.title||it.type)}</strong><small>${esc(it.type)} · ${esc(new Date(it.createdAt).toLocaleString())}</small><div class="row"><a class="button primary" href="${esc(it.url)}">Открыть</a><button data-remove="${idx}">Удалить</button></div></div>`).join(""):`<div class="notice">История пуста.</div>`}</div></section>`;
  $("#clearHistoryBtn").onclick=()=>{localStorage.setItem("babelHistory","[]");renderHistory();};
  document.querySelectorAll("button[data-remove]").forEach(btn=>btn.onclick=()=>{const arr=getHistory();arr.splice(Number(btn.dataset.remove),1);localStorage.setItem("babelHistory",JSON.stringify(arr));renderHistory();});
}
function renderFavorites(){
  const items=getFavorites();
  $("#app").innerHTML=`<section class="card">${tabs("")}<h1>Избранное</h1><div class="row"><button id="clearFavBtn">Очистить избранное</button></div><div class="favorites">${items.length?items.map((it,idx)=>`<div class="favorite"><strong>${esc(it.title)}</strong><small>${esc(new Date(it.createdAt).toLocaleString())}</small><div class="row"><a class="button primary" href="${esc(it.url)}">Открыть</a><button data-remove="${idx}">Удалить</button></div></div>`).join(""):`<div class="notice">Пока пусто.</div>`}</div></section>`;
  $("#clearFavBtn").onclick=()=>{saveFavorites([]);renderFavorites();};
  document.querySelectorAll("button[data-remove]").forEach(btn=>btn.onclick=()=>{const arr=getFavorites();arr.splice(Number(btn.dataset.remove),1);saveFavorites(arr);renderFavorites();});
}
function renderAbout(){
  $("#app").innerHTML=`<section class="card">${tabs("about")}<h1>Как работает</h1>
    <h2>1. Один алгоритм</h2><p>Оставлен один хороший режим <code>${VERSION}</code>: ${ALG.pageLength} символов, русский алфавит, настоящая координатная геометрия.</p>
    <h2>2. Два формата raw-адреса</h2><p><code>base36</code> удобнее читать, <code>base64url</code> короче для пересылки. Оба кодируют одно и то же число страницы.</p>
    <h2>3. Координаты настоящие</h2><p>Число страницы делится с остатком на лист, том, полку, стену, зал и сектор. Это не хеш и не декорация.</p>
    <h2>4. Том и полка</h2><p>Том показывает ${ALG.pagesPerVolume} страниц. Полка показывает ${ALG.volumesPerShelf} тома.</p>
    <h2>5. Ссылка на выделение</h2><p>Выдели фрагмент восстановленного текста и нажми «Ссылка на выделение». В URL попадёт только диапазон <code>?hl=start:length</code>, не сама фраза.</p>
    <h2>6. Самопроверка</h2><p>Проверяется цикл: координаты → BigInt → текст → BigInt → base64url → BigInt → координаты.</p>
  </section>`;
}

function parseCoord(parts){return {sector:parts[2],hall:parts[4],wall:parts[6],shelf:parts[8],volume:parts[10],page:parts[12]};}
function parseRoute(){
  const raw=location.hash||"#/"; const hash=raw.slice(1); const [path,qs]=hash.split("?"); const parts=path.split("/").filter(Boolean); const params=new URLSearchParams(qs||"");
  if(parts.length===0||parts[0]==="find")return {name:"home",params};
  if(parts[0]==="encode")return {name:"encode",params};
  if(parts[0]==="history")return {name:"history",params};
  if(parts[0]==="favorites")return {name:"favorites",params};
  if(parts[0]==="about")return {name:"about",params};
  if(parts[0]===VERSION&&parts[1]==="a36")return {name:"page",n:base36ToBigInt(parts.slice(2).join("")),params};
  if(parts[0]===VERSION&&parts[1]==="a64")return {name:"page",n:b64ToNumber(parts.slice(2).join("")),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=13)return {name:"page",n:coordinatesToNumber(parseCoord(parts)),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=11)return {name:"volume",c:{sector:parts[2],hall:parts[4],wall:parts[6],shelf:parts[8],volume:parts[10],page:1},params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=9)return {name:"shelf",c:{sector:parts[2],hall:parts[4],wall:parts[6],shelf:parts[8],volume:1,page:1},params};
  return {name:"home",params};
}
function router(){try{const r=parseRoute();if(r.name==="page")renderPage(r.n,r.params);else if(r.name==="volume")renderVolume(r.c);else if(r.name==="shelf")renderShelf(r.c);else if(r.name==="encode")renderEncode();else if(r.name==="history")renderHistory();else if(r.name==="favorites")renderFavorites();else if(r.name==="about")renderAbout();else renderHome();}catch(err){console.error(err);$("#app").innerHTML=`<section class="card"><h1>Ошибка</h1><p>${esc(err.message)}</p></section>`;}}
function downloadText(content){const blob=new Blob([content],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="babel-page.txt";link.click();URL.revokeObjectURL(url);}
window.addEventListener("hashchange",router);
window.addEventListener("DOMContentLoaded",()=>{$("#randomBtn").onclick=()=>{const n=textToNumber(randomPageText());location.hash=coordinateUrl(numberToCoordinates(n));};$("#historyBtn").onclick=()=>location.hash="#/history";$("#favoritesBtn").onclick=()=>location.hash="#/favorites";$("#copyLinkBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);alert("Ссылка скопирована.");};router();});
