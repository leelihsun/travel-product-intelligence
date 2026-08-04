const cfg=window.APP_CONFIG;
const csvUrl=`https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheetName)}`;

let events=[];
const state={search:"",dates:new Set(),products:new Set(),competitors:new Set(),sort:"newest",page:1};
const $=id=>document.getElementById(id);
const split=v=>String(v||"").split(/[,，]/).map(x=>x.trim()).filter(Boolean);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function parseCSV(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&quoted&&n==='"'){cell+='"';i++}
    else if(c==='"'){quoted=!quoted}
    else if(c===','&&!quoted){row.push(cell);cell=""}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell);
      if(row.some(x=>x!==""))rows.push(row);
      row=[];cell="";
    }else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  if(!rows.length)return[];
  const headers=rows.shift().map((h,i)=>String(h).replace(/^\uFEFF/,"").trim()||`欄位${i+1}`);
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}

function firstValue(row,names){
  for(const name of names){
    const value=String(row[name]??"").trim();
    if(value)return value;
  }
  return "";
}

function normalizeRow(row,index){
  const normalized={...row};
  normalized["情報 ID"]=firstValue(row,["情報 ID","情報ID","事件 ID","事件ID"])||`ROW-${index+1}`;
  normalized["競品"]=firstValue(row,["競品","競業","競品名稱","品牌"]);
  normalized["發現日期"]=firstValue(row,["發現日期","日期","發布日期"]);
  normalized["營業項目"]=firstValue(row,["營業項目","產品","產品項目"]);
  normalized["PM 快速摘要"]=firstValue(row,["PM 快速摘要","快速摘要"]);
  normalized["來源連結"]=firstValue(row,["來源連結","來源 URL","來源網址"]);
  return normalized;
}

async function loadData(){
  try{
    const res=await fetch(csvUrl,{cache:"no-store"});
    if(!res.ok)throw new Error(`Google Sheet 回應 ${res.status}`);
    events=parseCSV(await res.text()).map(normalizeRow).filter(r=>r["情報 ID"]||r["標題"]);
    if(!events.length)throw new Error("情報事件工作表沒有可讀資料");
    setPeriod();buildFilters();render();
  }catch(err){
    console.error(err);
    $("feed").innerHTML='<div class="empty-state"><h2>目前無法讀取 Google Sheet</h2><p>請確認試算表已設為「知道連結的任何人可檢視」，且工作表名稱為「情報事件」。</p></div>';
  }
}

function setPeriod(){
  const dates=events.map(e=>e["發現日期"]).filter(Boolean).sort();
  $("periodText").textContent=dates.length?`${dates[0]}－${dates[dates.length-1]}`:"—";
}

function counts(field,multi=false){
  const map=new Map();
  events.forEach(e=>{
    const values=multi?split(e[field]):[String(e[field]||"").trim()].filter(Boolean);
    values.forEach(v=>map.set(v,(map.get(v)||0)+1));
  });
  return [...map.entries()].sort((a,b)=>{
    if(field==="發現日期")return b[0].localeCompare(a[0]);
    return a[0].localeCompare(b[0],"zh-Hant");
  });
}

function renderFilter(id,entries,set){
  const box=$(id);
  box.innerHTML=entries.map(([value,count])=>`
    <button class="filter-option ${set.has(value)?"active":""}" type="button" data-value="${esc(value)}">
      <span class="left"><span class="checkbox">${set.has(value)?"✓":""}</span><span>${esc(value)}</span></span>
      <span class="count">${count}</span>
    </button>`).join("");
  box.querySelectorAll(".filter-option").forEach(btn=>{
    btn.onclick=()=>{
      const value=btn.dataset.value;
      set.has(value)?set.delete(value):set.add(value);
      state.page=1;buildFilters();render();
    };
  });
}

function buildFilters(){
  renderFilter("dateFilters",counts("發現日期"),state.dates);
  renderFilter("productFilters",counts("營業項目",true),state.products);
  renderFilter("competitorFilters",counts("競品"),state.competitors);
}

function filtered(){
  const q=state.search.trim().toLowerCase();
  const list=events.filter(e=>{
    const hay=[e["標題"],e["PM 快速摘要"],e["情報摘要"],e["PM Insight"],e["Tag"],e["競品"]].join(" ").toLowerCase();
    return (!q||hay.includes(q))
      &&(!state.dates.size||state.dates.has(e["發現日期"]))
      &&(!state.products.size||split(e["營業項目"]).some(v=>state.products.has(v)))
      &&(!state.competitors.size||state.competitors.has(e["競品"]));
  });
  return list.sort((a,b)=>state.sort==="oldest"
    ?String(a["發現日期"]).localeCompare(String(b["發現日期"]))
    :String(b["發現日期"]).localeCompare(String(a["發現日期"])));
}

function displayTitle(e){
  const title=String(e["標題"]||"").trim();
  if(title.includes("｜"))return title;
  return `${e["競品"]||"未標示品牌"}｜${title}`;
}

function quickOf(e){
  if(e["PM 快速摘要"])return e["PM 快速摘要"];
  const insight=String(e["PM Insight"]||"").trim();
  if(insight){
    const first=insight.split(/[。！？]/).map(x=>x.trim()).filter(Boolean)[0];
    if(first)return first+"。";
  }
  return String(e["情報摘要"]||"").trim();
}

function excerpt(text,max=150){
  const value=String(text||"").replace(/\s+/g," ").trim();
  return value.length>max?value.slice(0,max).trim()+"…":value;
}

function render(){
  const all=filtered();
  const pages=Math.max(1,Math.ceil(all.length/cfg.rowsPerPage));
  if(state.page>pages)state.page=pages;
  const items=all.slice((state.page-1)*cfg.rowsPerPage,state.page*cfg.rowsPerPage);

  $("visibleCount").textContent=all.length;
  $("emptyState").hidden=all.length!==0;

  $("feed").innerHTML=items.map(e=>`
    <button class="card" type="button" data-id="${esc(e["情報 ID"])}">
      <div class="card-head">
        <div class="meta"><span>${esc(e["發現日期"])}</span></div>
        ${e["建議行動"]?`<span class="action-badge ${esc(e["建議行動"])}">${esc(e["建議行動"])}</span>`:""}
      </div>
      <h2>${esc(displayTitle(e))}</h2>
      <div class="quick-summary"><span class="quick-label">PM 快速摘要</span><p>${esc(quickOf(e))}</p></div>
      <p class="card-summary">${esc(excerpt(e["情報摘要"]))}</p>
      <div class="card-footer">
        <div class="tags">${split(e["營業項目"]).map(v=>`<span class="tag product-tag">${esc(v)}</span>`).join("")}</div>
        <span class="read-more">查看完整分析 →</span>
      </div>
    </button>`).join("");

  renderPages(pages);
}

function renderPages(pages){
  const nav=$("pagination");
  if(pages<=1){nav.innerHTML="";return}
  let html=`<button class="page-button" data-page="${state.page-1}" ${state.page===1?"disabled":""}>上一頁</button>`;
  for(let i=1;i<=pages;i++)html+=`<button class="page-button ${i===state.page?"active":""}" data-page="${i}">${i}</button>`;
  html+=`<button class="page-button" data-page="${state.page+1}" ${state.page===pages?"disabled":""}>下一頁</button>`;
  nav.innerHTML=html;
}

function section(title,content,extraClass=""){
  return String(content||"").trim()
    ?`<section class="detail-section ${extraClass}"><h3>${esc(title)}</h3><p>${esc(content)}</p></section>`:"";
}

function openDetail(e){
  if(!e)return;
  $("detailContent").innerHTML=`
    <div class="detail-inner">
      <div class="detail-meta">
        <span class="tag brand-tag">${esc(e["競品"])}</span>
        <span class="tag date-tag">${esc(e["發現日期"])}</span>
        ${e["建議行動"]?`<span class="action-badge ${esc(e["建議行動"])}">${esc(e["建議行動"])}</span>`:""}
      </div>
      <h2>${esc(displayTitle(e))}</h2>
      ${section("PM 快速摘要",quickOf(e),"detail-highlight")}
      ${section("情報摘要",e["情報摘要"])}
      ${section("詳細內容",e["詳細內容"])}
      ${section("PM Insight",e["PM Insight"],"detail-insight")}
      ${section("解決哪些問題",e["解決的使用者問題"])}
      ${section("可能影響 KPI",e["可能影響指標"])}
      ${section("產品策略",e["產品策略"])}
      ${e["來源連結"]?`<a class="source-link" href="${esc(e["來源連結"])}" target="_blank" rel="noopener">查看官方來源 ↗</a>`:""}
    </div>`;
  $("detailOverlay").hidden=false;
  document.body.classList.add("drawer-open");
}

function closeDetail(){
  $("detailOverlay").hidden=true;
  document.body.classList.remove("drawer-open");
}

$("searchInput").oninput=e=>{state.search=e.target.value;state.page=1;render()};
$("sortSelect").onchange=e=>{state.sort=e.target.value;state.page=1;render()};
$("resetFilters").onclick=()=>{
  state.search="";state.dates.clear();state.products.clear();state.competitors.clear();
  state.sort="newest";state.page=1;
  $("searchInput").value="";$("sortSelect").value="newest";
  buildFilters();render();
};
$("feed").onclick=e=>{
  const card=e.target.closest(".card");
  if(!card)return;
  openDetail(events.find(x=>String(x["情報 ID"])===String(card.dataset.id)));
};
$("pagination").onclick=e=>{
  const button=e.target.closest(".page-button");
  if(!button||button.disabled)return;
  state.page=Number(button.dataset.page);render();
  window.scrollTo({top:0,behavior:"smooth"});
};
$("closeDetail").onclick=closeDetail;
$("overlayBackdrop").onclick=closeDetail;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail()});

loadData();
