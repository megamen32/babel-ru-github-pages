
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
function C(c){return {sector:String(c.sector),hall:String(c.hall),wall:String(c.wall),shelf:String(c.shelf),volume:String(c.volume||1),page:String(c.page||1)};}
function coordinateUrl(c, hl=null){c=C(c);const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}/volume/${c.volume}/page/${c.page}${q}`;}
function volumeUrl(c){c=C(c);return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}/volume/${c.volume}`;}
function shelfUrl(c){c=C(c);return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}`;}
function wallUrl(c){c=C(c);return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}`;}
function hallUrl(c){c=C(c);return `#/${VERSION}/sector/${c.sector}/hall/${c.hall}`;}
function raw36Url(n,hl=null){const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/a36/${prettyBase36(n)}${q}`;}
function raw64Url(n,hl=null){const q=hl?`?hl=${hl.start}:${hl.length}`:"";return `#/${VERSION}/a64/${numberToB64(n)}${q}`;}
function coordinateTitle(c){return `Сектор ${c.sector} · Зал ${c.hall} · Стена ${c.wall} · Полка ${c.shelf} · Том ${c.volume} · Лист ${c.page}`;}
function parseHighlight(params){const raw=params.get("hl")||"";const m=raw.match(/^(\d+):(\d+)$/);return m?{start:Number(m[1]),length:Number(m[2])}:null;}
function paragraphize(text){const clean=String(text).replace(/\s+$/g,"");const parts=[];for(let i=0;i<clean.length;i+=ALG.lineWidth)parts.push(clean.slice(i,i+ALG.lineWidth));return parts.join("\n");}
function highlightByRange(text,range){const s=Math.max(0,Math.min(text.length,range.start));const e=Math.max(s,Math.min(text.length,range.start+range.length));return `${esc(paragraphize(text.slice(0,s)))}<mark>${esc(paragraphize(text.slice(s,e)))}</mark>${esc(paragraphize(text.slice(e)))}`;}
function snippetByRange(text,range,pad=80){const s=Math.max(0,range.start-pad),e=Math.min(text.length,range.start+range.length+pad);return `${s>0?"… ":""}${text.slice(s,e).trim()}${e<text.length?" …":""}`;}
function renderTextSpans(text,hl){
  let out="";
  for(let i=0;i<text.length;i++){
    const marked=hl && i>=hl.start && i<hl.start+hl.length;
    const ch=text[i]==="\n" ? "\n" : esc(text[i]);
    out += `<span class="char ${marked?"marked":""}" data-pos="${i}">${ch}</span>`;
    if((i+1)%ALG.lineWidth===0) out += "\n";
  }
  return out;
}
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

function pushHistory(item){const items=getHistory().filter(x=>x.url!==item.url);items.unshift({...item,createdAt:new Date().toISOString()});localStorage.setItem("babelHistory",JSON.stringify(items.slice(0,100)));}
function getHistory(){try{return JSON.parse(localStorage.getItem("babelHistory")||"[]");}catch{return[];}}
function getFavorites(){try{return JSON.parse(localStorage.getItem("babelFavorites")||"[]");}catch{return[];}}
function saveFavorites(items){localStorage.setItem("babelFavorites",JSON.stringify(items.slice(0,120)));}
function addFavorite(item){const key=item.n||item.url;const items=getFavorites().filter(x=>(x.n||x.url)!==key);items.unshift({...item,createdAt:new Date().toISOString()});saveFavorites(items);}

function tabs(active){return `<div class="tabs">
  <a class="button tab ${active==="find"?"active":""}" href="#/">Найти адреса</a>
  <a class="button tab ${active==="encode"?"active":""}" href="#/encode">Кодировать текст</a>
  <a class="button tab ${active==="converter"?"active":""}" href="#/converter">Конвертер</a>
  <a class="button tab ${active==="history"?"active":""}" href="#/history">История</a>
  <a class="button tab ${active==="about"?"active":""}" href="#/about">Как работает</a>
</div>`;}
function breadcrumbs(c){c=C(c);return `<div class="breadcrumbs">
  <a class="button" href="${hallUrl(c)}">Сектор ${c.sector} / Зал ${c.hall}</a>
  <a class="button" href="${wallUrl(c)}">Стена ${c.wall}</a>
  <a class="button" href="${shelfUrl(c)}">Полка ${c.shelf}</a>
  <a class="button" href="${volumeUrl(c)}">Том ${c.volume}</a>
  <a class="button primary" href="${coordinateUrl(c)}">Лист ${c.page}</a>
</div>`;}

function renderHome(){
  const params=new URLSearchParams(location.hash.split("?")[1]||"");
  const q=params.get("q")||"", offset=Number(params.get("offset")||"0"), count=Number(params.get("count")||DEFAULT_VARIANTS), strategy=params.get("strategy")||"random";
  $("#app").innerHTML=`<section class="grid"><div class="card">${tabs("find")}
    <h1>Найти координаты страниц, содержащих фразу</h1>
    <p>Фраза встраивается в полный лист, лист превращается в число, число раскладывается в координаты.</p>
    <form id="phraseForm"><textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку">${esc(q)}</textarea>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>Вариантов</label><input id="variantCountInput" inputmode="numeric" value="${Number.isFinite(count)?count:DEFAULT_VARIANTS}"></div>
        <div class="field"><label>Смещение</label><input id="offsetInput" inputmode="numeric" value="${Number.isFinite(offset)?offset:0}"></div>
        <div class="field"><label>Расположение</label><select id="strategyInput">${[["random","разные места"],["center","по центру"],["start","в начале"],["end","в конце"],["quiet","тихое окружение"]].map(([k,l])=>`<option value="${k}" ${k===strategy?"selected":""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="row" style="margin-top:10px"><button class="primary" type="submit">Показать варианты</button><button id="nextBatchBtn" type="button">Следующие варианты</button><button id="shareFindBtn" type="button">Скопировать ссылку на результаты</button></div>
    </form><div id="results" class="variants"></div></div>
    <aside class="card"><h2>Открыть координаты</h2>
      <form id="coordForm"><div class="coord-grid">${[["sector","Сектор","1"],["hall","Зал","1"],["wall","Стена","1"],["shelf","Полка","1"],["volume","Том","1"],["page","Лист","1"]].map(([id,l,v])=>`<div class="field"><label>${l}</label><input id="${id}Input" value="${v}" inputmode="numeric"></div>`).join("")}</div><div class="row" style="margin-top:10px"><button class="primary" type="submit">Открыть страницу</button></div></form>
      <div class="notice">Навигация: зал → стена → полка → том → лист. Том содержит ${ALG.pagesPerVolume} страниц, полка — ${ALG.volumesPerShelf} тома.</div>
    </aside></section>`;
  $("#phraseForm").onsubmit=e=>{e.preventDefault();location.hash=`#/find?q=${encodeURIComponent($("#phraseInput").value.trim())}&offset=${encodeURIComponent($("#offsetInput").value||"0")}&count=${encodeURIComponent($("#variantCountInput").value||DEFAULT_VARIANTS)}&strategy=${encodeURIComponent($("#strategyInput").value)}`;};
  $("#nextBatchBtn").onclick=()=>{const c=Math.max(1,Math.min(MAX_VARIANTS,Number($("#variantCountInput").value)||DEFAULT_VARIANTS));const off=Number($("#offsetInput").value)||0;location.hash=`#/find?q=${encodeURIComponent($("#phraseInput").value.trim())}&offset=${off+c}&count=${c}&strategy=${encodeURIComponent($("#strategyInput").value)}`;};
  $("#shareFindBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);alert("Ссылка на результаты скопирована.");};
  $("#coordForm").onsubmit=e=>{e.preventDefault();try{const c={sector:$("#sectorInput").value,hall:$("#hallInput").value,wall:$("#wallInput").value,shelf:$("#shelfInput").value,volume:$("#volumeInput").value,page:$("#pageInput").value};coordinatesToNumber(c);location.hash=coordinateUrl(c);}catch(err){alert(err.message);}};
  if(q)renderVariants({phraseRaw:q,countRaw:count,strategy,offsetRaw:offset});
}
function renderVariants({phraseRaw,countRaw,strategy,offsetRaw}){
  const results=$("#results"); results.innerHTML="";
  let count=Math.max(1,Math.min(MAX_VARIANTS,Math.floor(Number(countRaw)||DEFAULT_VARIANTS)));
  let offset=Math.max(0,Math.floor(Number(offsetRaw)||0));
  try{
    const normalized=normalizeText(phraseRaw); if(!normalized)throw new Error("После нормализации фраза пустая.");
    pushHistory({type:"phrase",title:`Фраза: ${normalized}`,url:location.hash});
    const items=[];
    for(let i=1;i<=count;i++){
      const page=makePageWithPhrase(normalized,i,strategy,offset);
      const n=textToNumber(page.text); const c=numberToCoordinates(n); const range={start:page.position,length:normalized.length};
      const preview=snippetByRange(page.text,range);
      items.push(`<div class="variant"><strong>Вариант ${page.variant} · позиция ${page.position+1}</strong>
        <small>${highlightByRange(preview,{start:Math.max(0,preview.indexOf(normalized)),length:normalized.length})}</small>
        <div class="pretty-address"><small>Координаты</small><div class="address-line"><span class="chunk">sector ${c.sector}</span><span class="chunk">hall ${c.hall}</span><span class="chunk">wall ${c.wall}</span><span class="chunk">shelf ${c.shelf}</span><span class="chunk">volume ${c.volume}</span><span class="chunk">page ${c.page}</span></div><small>Компактный base64url</small><div class="mono">${esc(numberToB64(n))}</div></div>
        <div class="row"><a class="button primary" href="${coordinateUrl(c,range)}">Открыть страницу</a><button data-copy="${esc(coordinateUrl(c,range))}" type="button">Скопировать координаты</button><button data-copy64="${esc(raw64Url(n,range))}" type="button">Скопировать base64url</button><button data-save='${esc(JSON.stringify({title:`${normalized}`,n:n.toString(),url:coordinateUrl(c,range),type:"find"}))}' type="button">Сохранить находку</button></div></div>`);
    }
    results.innerHTML=items.join("");
    results.querySelectorAll("button[data-copy]").forEach(btn=>btn.onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${btn.dataset.copy}`);alert("Координатная ссылка скопирована.");});
    results.querySelectorAll("button[data-copy64]").forEach(btn=>btn.onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${btn.dataset.copy64}`);alert("base64url-ссылка скопирована.");});
    results.querySelectorAll("button[data-save]").forEach(btn=>btn.onclick=()=>{addFavorite(JSON.parse(btn.dataset.save));alert("Находка сохранена.");});
  }catch(err){results.innerHTML=`<div class="notice warning">${esc(err.message)}</div>`;}
}

function renderPage(n,params){
  if(n<0n||n>=maxPageNumber())throw new Error("Адрес вне пространства библиотеки.");
  const text=numberToText(n); const c=numberToCoordinates(n); const hl=parseHighlight(params); const title=coordinateTitle(c);
  pushHistory({type:"page",title,n:n.toString(),url:location.hash,coordinates:C(c)});
  $("#app").innerHTML=`<article class="card">${breadcrumbs(c)}<h1>${esc(title)}</h1>
    <div class="address"><span class="badge">${VERSION}</span><span class="badge">координаты реальные</span><span class="badge">${ALG.pageLength} символов</span><span class="badge">алфавит ${ALG.alphabet.length}</span></div>
    <div class="controls"><a class="button" href="${coordinateUrl(numberToCoordinates(n>0n?n-1n:maxPageNumber()-1n))}">← страница</a><a class="button" href="${coordinateUrl(numberToCoordinates((n+1n)%maxPageNumber()))}">страница →</a><a class="button" href="${volumeUrl(c)}">Открыть том</a><a class="button" href="${shelfUrl(c)}">Открыть полку</a><a class="button" href="${wallUrl(c)}">Открыть стену</a><a class="button" href="${hallUrl(c)}">Открыть зал</a></div>
    <div class="controls" style="margin-top:10px"><button id="favoriteBtn">★ В избранное</button><button id="copyTextBtn">Скопировать текст</button><button id="copyCoordBtn">Скопировать координаты</button><button id="copy64Btn">Скопировать base64url</button><button id="copySelBtn">Ссылка на выделение</button><button id="roundtripBtn">Самопроверка</button><button id="downloadBtn">Скачать .txt</button></div>
    <div class="notice good">Выделение теперь берётся по <code>data-pos</code>, а не через примерный поиск строки.</div>
    ${passport(n,c)}
    <div class="pretty-address" style="margin-top:14px"><small>Найти на этой странице</small><div class="row"><input id="pageSearchInput" placeholder="Фраза на этой странице"><button id="pageSearchBtn">Найти</button></div><div id="pageSearchResult"></div></div>
    <div id="pageText" class="page-text" style="margin-top:18px">${renderTextSpans(text,hl)}</div>
  </article>`;
  $("#favoriteBtn").onclick=()=>{addFavorite({title,n:n.toString(),url:location.hash,type:"page"});alert("Добавлено в избранное.");};
  $("#copyTextBtn").onclick=async()=>{await navigator.clipboard.writeText(text);alert("Текст скопирован.");};
  $("#copyCoordBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);alert("Координатная ссылка скопирована.");};
  $("#copy64Btn").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${raw64Url(n,hl)}`);alert("base64url-ссылка скопирована.");};
  $("#copySelBtn").onclick=async()=>copySelectionLink(c);
  $("#roundtripBtn").onclick=()=>runSelfTest(n,text,c);
  $("#downloadBtn").onclick=()=>downloadText(`${title}\n\n${text}\n\nКоординаты:\n${location.href}\n\nbase64url:\n${location.origin}${location.pathname}${raw64Url(n,hl)}\n`);
  $("#pageSearchBtn").onclick=()=>{const q=normalizeText($("#pageSearchInput").value);if(!q)return;const pos=text.indexOf(q);if(pos<0){$("#pageSearchResult").innerHTML=`<div class="notice warning">Не найдено на этой странице.</div>`;return;}location.hash=coordinateUrl(c,{start:pos,length:q.length});};
}
function passport(n,c){return `<div class="pretty-address"><small>Паспорт страницы</small><div class="address-line"><span class="chunk">sector ${c.sector}</span><span class="chunk">hall ${c.hall}</span><span class="chunk">wall ${c.wall}</span><span class="chunk">shelf ${c.shelf}</span><span class="chunk">volume ${c.volume}</span><span class="chunk">page ${c.page}</span></div><small>base64url</small><div class="mono">${esc(numberToB64(n))}</div><small>base36</small><div class="address-line">${prettyBase36(n).split("-").map(x=>`<span class="chunk">${esc(x)}</span>`).join("")}</div></div>`;}
function copySelectionLink(c){
  const sel=window.getSelection(); if(!sel || sel.rangeCount===0 || sel.toString().length===0){alert("Сначала выдели фрагмент текста на странице.");return;}
  const range=sel.getRangeAt(0); const spans=[...document.querySelectorAll("#pageText .char[data-pos]")].filter(sp=>range.intersectsNode(sp));
  if(!spans.length){alert("Выделение должно быть внутри текста страницы.");return;}
  const positions=spans.map(sp=>Number(sp.dataset.pos)); const start=Math.min(...positions); const end=Math.max(...positions)+1;
  navigator.clipboard.writeText(`${location.origin}${location.pathname}${coordinateUrl(c,{start,length:end-start})}`).then(()=>alert("Ссылка на выделенный фрагмент скопирована."));
}
function runSelfTest(n,text,c){
  const againN=textToNumber(text), againC=numberToCoordinates(againN), b64=numberToB64(n), from64=b64ToNumber(b64), from36=base36ToBigInt(bigintToBase36(n));
  const ok=againN===n && from64===n && from36===n && coordinatesToNumber(c)===n;
  $("#app").insertAdjacentHTML("afterbegin",`<section class="card" style="margin-bottom:18px"><h2>Самопроверка алгоритма</h2><div class="steps"><div class="step"><strong>1. Координаты → BigInt</strong><small class="mono">${coordinatesToNumber(c).toString()}</small></div><div class="step"><strong>2. BigInt → текст</strong><small>${ALG.pageLength} символов</small></div><div class="step"><strong>3. Текст → BigInt</strong><small class="mono">${againN.toString()}</small></div><div class="step"><strong>4. BigInt → base64url → BigInt</strong><small class="mono">${esc(b64)}</small></div><div class="step"><strong>5. BigInt → base36 → BigInt</strong><small class="mono">${esc(bigintToBase36(n).slice(0,80))}...</small></div></div><div class="notice ${ok?"good":"warning"}">${ok?"Проверка пройдена: координаты, текст, base36/base64url согласованы.":"Проверка не пройдена."}</div></section>`);
}
function renderHall(c){
  coordinatesToNumber({...c,wall:1,shelf:1,volume:1,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}<h1>Сектор ${c.sector} · Зал ${c.hall}</h1><div class="hall-grid">${Array.from({length:Number(ALG.wallsPerHall)},(_,i)=>{const w=i+1;return `<a class="hall-wall" href="${wallUrl({...c,wall:w,shelf:1,volume:1,page:1})}"><strong>Стена ${w}</strong><small>${ALG.shelvesPerWall} полок</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"hall",title:`Зал ${c.hall}`,url:location.hash,coordinates:C(c)});
}
function renderWall(c){
  coordinatesToNumber({...c,shelf:1,volume:1,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}${breadcrumbs({...c,shelf:1,volume:1,page:1})}<h1>Стена ${c.wall}</h1><div class="wall-grid">${Array.from({length:Number(ALG.shelvesPerWall)},(_,i)=>{const s=i+1;return `<a class="wall-shelf" href="${shelfUrl({...c,shelf:s,volume:1,page:1})}"><strong>Полка ${s}</strong><small>${ALG.volumesPerShelf} тома</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"wall",title:`Стена ${c.wall}`,url:location.hash,coordinates:C(c)});
}
function renderShelf(c){
  coordinatesToNumber({...c,volume:1,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}${breadcrumbs({...c,volume:1,page:1})}<h1>Полка ${c.shelf}</h1><div class="controls"><a class="button" href="${wallUrl(c)}">Открыть стену</a></div><div class="shelf-grid">${Array.from({length:Number(ALG.volumesPerShelf)},(_,i)=>{const v=i+1;return `<a class="shelf-volume" href="${volumeUrl({...c,volume:v,page:1})}"><strong>Том ${v}</strong><small>${ALG.pagesPerVolume} страниц</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"shelf",title:`Полка ${c.shelf}`,url:location.hash,coordinates:C(c)});
}
function renderVolume(c){
  coordinatesToNumber({...c,page:1});
  $("#app").innerHTML=`<section class="card">${tabs("")}${breadcrumbs({...c,page:1})}<h1>Том ${c.volume}</h1><div class="controls"><a class="button" href="${shelfUrl(c)}">Открыть полку</a></div><div class="book-grid">${Array.from({length:Number(ALG.pagesPerVolume)},(_,i)=>{const p=i+1;return `<a class="book-page" href="${coordinateUrl({...c,page:p})}"><strong>${p}</strong><small>лист</small></a>`;}).join("")}</div></section>`;
  pushHistory({type:"volume",title:`Том ${c.volume}`,url:location.hash,coordinates:C(c)});
}
function renderEncode(){
  $("#app").innerHTML=`<section class="grid"><div class="card">${tabs("encode")}<h1>Сделать текст страницей библиотеки</h1><p>Текст нормализуется, дополняется пробелами до ${ALG.pageLength} символов и превращается в координаты.</p><form id="encodeForm"><textarea id="encodeTextInput" placeholder="Введите текст страницы"></textarea><div class="row" style="margin-top:10px"><button class="primary" type="submit">Получить координаты</button></div></form><div id="encodeResult"></div></div><aside class="card"><h2>Результат</h2><p>Координатная ссылка, base36 и компактный base64url.</p></aside></section>`;
  $("#encodeForm").onsubmit=e=>{e.preventDefault();try{const n=textToNumber($("#encodeTextInput").value);const c=numberToCoordinates(n);$("#encodeResult").innerHTML=`<div class="notice good">Текст превращён в страницу библиотеки.</div>${passport(n,c)}<div class="row"><a class="button primary" href="${coordinateUrl(c)}">Открыть страницу</a><button id="copyEnc64">Скопировать base64url</button></div>`;$("#copyEnc64").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${raw64Url(n)}`);alert("base64url скопирован.");};pushHistory({type:"encoded",title:"Кодированный текст",url:coordinateUrl(c),n:n.toString()});}catch(err){$("#encodeResult").innerHTML=`<div class="notice warning">${esc(err.message)}</div>`;}}
}
function renderConverter(){
  $("#app").innerHTML=`<section class="grid"><div class="card">${tabs("converter")}<h1>Конвертер адресов</h1><p>Вставь координатную ссылку, base36 или base64url. Конвертер покажет все форматы.</p><form id="convForm"><select id="convKind"><option value="auto">определить автоматически</option><option value="a64">base64url</option><option value="a36">base36</option></select><textarea id="convInput" style="margin-top:10px" placeholder="Адрес или ссылка"></textarea><div class="row" style="margin-top:10px"><button class="primary" type="submit">Конвертировать</button></div></form><div id="convResult"></div></div><aside class="card"><h2>Форматы</h2><p>Координаты удобны человеку. Base64url короче для машинной записи числа страницы.</p></aside></section>`;
  $("#convForm").onsubmit=e=>{e.preventDefault();try{const raw=$("#convInput").value.trim();const kind=$("#convKind").value;const n=parseAnyAddress(raw,kind);const c=numberToCoordinates(n);$("#convResult").innerHTML=`<div class="notice good">Адрес распознан.</div>${passport(n,c)}<div class="row"><a class="button primary" href="${coordinateUrl(c)}">Открыть координаты</a><button id="copyC">Копировать координаты</button><button id="copy64">Копировать base64url</button></div>`;$("#copyC").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${coordinateUrl(c)}`);alert("Координаты скопированы.");};$("#copy64").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}${raw64Url(n)}`);alert("base64url скопирован.");};}catch(err){$("#convResult").innerHTML=`<div class="notice warning">${esc(err.message)}</div>`;}}
}
function parseAnyAddress(raw,kind="auto"){
  if(raw.includes(`/${VERSION}/sector/`)){const parts=raw.split("#").pop().split("?")[0].split("/").filter(Boolean);return coordinatesToNumber(parseCoord(parts));}
  if(raw.includes(`/${VERSION}/a64/`)){return b64ToNumber(raw.split(`/${VERSION}/a64/`).pop().split("?")[0].replace(/[^A-Za-z0-9_-]/g,""));}
  if(raw.includes(`/${VERSION}/a36/`)){return base36ToBigInt(raw.split(`/${VERSION}/a36/`).pop().split("?")[0]);}
  if(kind==="a64")return b64ToNumber(raw.replace(/[^A-Za-z0-9_-]/g,""));
  if(kind==="a36")return base36ToBigInt(raw);
  if(/[-_]/.test(raw) && /[A-Z_]/.test(raw))return b64ToNumber(raw.replace(/[^A-Za-z0-9_-]/g,""));
  return base36ToBigInt(raw);
}
function renderHistory(){
  const items=getHistory();
  $("#app").innerHTML=`<section class="card">${tabs("history")}<h1>История</h1><p>Локальная история: страницы, фразы, тома, полки, стены и залы.</p><div class="row"><button id="clearHistoryBtn">Очистить историю</button></div><div class="history">${items.length?items.map((it,idx)=>`<div class="history-item"><strong>${esc(it.title||it.type)}</strong><small>${esc(it.type)} · ${esc(new Date(it.createdAt).toLocaleString())}</small><div class="row"><a class="button primary" href="${esc(it.url)}">Открыть</a><button data-remove="${idx}">Удалить</button></div></div>`).join(""):`<div class="notice">История пуста.</div>`}</div></section>`;
  $("#clearHistoryBtn").onclick=()=>{localStorage.setItem("babelHistory","[]");renderHistory();};
  document.querySelectorAll("button[data-remove]").forEach(btn=>btn.onclick=()=>{const arr=getHistory();arr.splice(Number(btn.dataset.remove),1);localStorage.setItem("babelHistory",JSON.stringify(arr));renderHistory();});
}
function renderFavorites(){
  const items=getFavorites();
  $("#app").innerHTML=`<section class="card">${tabs("")}<h1>Избранное</h1><div class="row"><button id="clearFavBtn">Очистить избранное</button></div><div class="favorites">${items.length?items.map((it,idx)=>`<div class="favorite"><strong>${esc(it.title)}</strong><small>${esc(it.type||"page")} · ${esc(new Date(it.createdAt).toLocaleString())}</small><div class="row"><a class="button primary" href="${esc(it.url)}">Открыть</a><button data-remove="${idx}">Удалить</button></div></div>`).join(""):`<div class="notice">Пока пусто.</div>`}</div></section>`;
  $("#clearFavBtn").onclick=()=>{saveFavorites([]);renderFavorites();};
  document.querySelectorAll("button[data-remove]").forEach(btn=>btn.onclick=()=>{const arr=getFavorites();arr.splice(Number(btn.dataset.remove),1);saveFavorites(arr);renderFavorites();});
}
function renderAbout(){
  $("#app").innerHTML=`<section class="card">${tabs("about")}<h1>Как работает</h1>
    <h2>Паспорт библиотеки</h2><div class="pretty-address"><div class="address-line"><span class="chunk">версия ${VERSION}</span><span class="chunk">алфавит ${ALG.alphabet.length}</span><span class="chunk">длина ${ALG.pageLength}</span><span class="chunk">страниц в томе ${ALG.pagesPerVolume}</span><span class="chunk">томов на полке ${ALG.volumesPerShelf}</span><span class="chunk">полок на стене ${ALG.shelvesPerWall}</span><span class="chunk">стен в зале ${ALG.wallsPerHall}</span><span class="chunk">залов в секторе ${ALG.hallsPerSector}</span></div></div>
    <h2>Координаты настоящие</h2><p>Число страницы делится с остатком на лист, том, полку, стену, зал и сектор. Это не декоративный хеш.</p>
    <h2>Base36 и base64url</h2><p>Оба формата кодируют одно и то же число страницы. Base64url обычно короче, base36 проще глазами.</p>
    <h2>Ссылка на выделение</h2><p>Каждый символ текста имеет <code>data-pos</code>. Поэтому выделение превращается в точный диапазон <code>?hl=start:length</code>.</p>
  </section>`;
}
function parseCoord(parts){return {sector:parts[2],hall:parts[4],wall:parts[6],shelf:parts[8],volume:parts[10]||1,page:parts[12]||1};}
function parseRoute(){
  const raw=location.hash||"#/"; const hash=raw.slice(1); const [path,qs]=hash.split("?"); const parts=path.split("/").filter(Boolean); const params=new URLSearchParams(qs||"");
  if(parts.length===0||parts[0]==="find")return {name:"home",params};
  if(parts[0]==="encode")return {name:"encode",params};
  if(parts[0]==="converter")return {name:"converter",params};
  if(parts[0]==="history")return {name:"history",params};
  if(parts[0]==="favorites")return {name:"favorites",params};
  if(parts[0]==="about")return {name:"about",params};
  if(parts[0]===VERSION&&parts[1]==="a36")return {name:"page",n:base36ToBigInt(parts.slice(2).join("")),params};
  if(parts[0]===VERSION&&parts[1]==="a64")return {name:"page",n:b64ToNumber(parts.slice(2).join("")),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=13)return {name:"page",n:coordinatesToNumber(parseCoord(parts)),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=11)return {name:"volume",c:parseCoord(parts),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=9)return {name:"shelf",c:parseCoord(parts),params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=7)return {name:"wall",c:{...parseCoord(parts),shelf:1,volume:1,page:1},params};
  if(parts[0]===VERSION&&parts[1]==="sector"&&parts.length>=5)return {name:"hall",c:{...parseCoord(parts),wall:1,shelf:1,volume:1,page:1},params};
  return {name:"home",params};
}
function router(){try{const r=parseRoute();if(r.name==="page")renderPage(r.n,r.params);else if(r.name==="volume")renderVolume(r.c);else if(r.name==="shelf")renderShelf(r.c);else if(r.name==="wall")renderWall(r.c);else if(r.name==="hall")renderHall(r.c);else if(r.name==="encode")renderEncode();else if(r.name==="converter")renderConverter();else if(r.name==="history")renderHistory();else if(r.name==="favorites")renderFavorites();else if(r.name==="about")renderAbout();else renderHome();}catch(err){console.error(err);$("#app").innerHTML=`<section class="card"><h1>Ошибка</h1><p>${esc(err.message)}</p></section>`;}}
function downloadText(content){const blob=new Blob([content],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="babel-page.txt";link.click();URL.revokeObjectURL(url);}
window.addEventListener("hashchange",router);
window.addEventListener("DOMContentLoaded",()=>{$("#randomBtn").onclick=()=>{const n=textToNumber(randomPageText());location.hash=coordinateUrl(numberToCoordinates(n));};$("#historyBtn").onclick=()=>location.hash="#/history";$("#favoritesBtn").onclick=()=>location.hash="#/favorites";$("#converterBtn").onclick=()=>location.hash="#/converter";$("#copyLinkBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);alert("Ссылка скопирована.");};router();});
