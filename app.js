const cfg=window.APP_CONFIG;
const csvUrl=`https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheetName)}`;
let events=[];
const state={search:"",products:new Set(),competitors:new Set(),sort:"newest",page:1};
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
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x!==""))rows.push(row);row=[];cell=""}
    else cell+=c
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  if(!rows.length)return[];
  const headers=rows.shift().map((h,i)=>String(h).replace(/^\uFEFF/,"").trim()||`欄位${i+1}`);
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}
async function loadData(){
  try{
    const res=await fetch(csvUrl,{cache:"no-store"});
    if(!res.ok)throw new Error(`Google Sheet 回應 ${res.status}`);
    events=parseCSV(await res.text()).filter(r=>r["情報 ID"]||r["標題"]);
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
function counts(field,multi){
  const map=new Map();
  events.forEach(e=>(multi?split(e[field]):[String(e[field]||"").trim()].filter(Boolean)).forEach(v=>map.set(v,(map.get(v)||0)+1)));
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],"zh-Hant"));
}
function renderFilter(id,entries,set){
  const box=$(id);
  box.innerHTML=entries.map(([v,c])=>`<button class="filter-option ${set.has(v)?"active":""}" type="button" data-value="${esc(v)}"><span class="left"><span class="checkbox">${set.has(v)?"✓":""}</span><span>${esc(v)}</span></span><span class="count">${c}</span></button>`).join("");
  box.querySelectorAll(".filter-option").forEach(btn=>btn.onclick=()=>{const v=btn.dataset.value;set.has(v)?set.delete(v):set.add(v);state.page=1;buildFilters();render()});
}
function buildFilters(){renderFilter("productFilters",counts("營業項目",true),state.products);renderFilter("competitorFilters",counts("競品",false),state.competitors)}
function filtered(){
  const q=state.search.trim().toLowerCase();
  const list=events.filter(e=>{
    const hay=Object.values(e).join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!state.products.size||split(e["營業項目"]).some(v=>state.products.has(v)))&&(!state.competitors.size||state.competitors.has(String(e["競品"]||"").trim()))
  });
  return list.sort((a,b)=>state.sort==="oldest"?String(a["發現日期"]).localeCompare(String(b["發現日期"])):state.sort==="competitor"?String(a["競品"]).localeCompare(String(b["競品"]),"zh-Hant"):String(b["發現日期"]).localeCompare(String(a["發現日期"])));
}
function titleOf(e){const t=String(e["標題"]||"").trim();return t.includes("｜")?t.split("｜").slice(1).join("｜").trim():t}
function quickOf(e){if(e["PM 快速摘要"])return e["PM 快速摘要"];const i=String(e["PM Insight"]||"").trim();return i?(i.split(/[。！？]/).filter(Boolean)[0]||i)+"。":String(e["情報摘要"]||"")}
function render(){
  const all=filtered(),pages=Math.max(1,Math.ceil(all.length/cfg.rowsPerPage));if(state.page>pages)state.page=pages;
  const items=all.slice((state.page-1)*cfg.rowsPerPage,state.page*cfg.rowsPerPage);
  $("visibleCount").textContent=all.length;$("emptyState").hidden=all.length!==0;
  $("feed").innerHTML=items.map(e=>`<button class="card" type="button" data-id="${esc(e["情報 ID"])}"><div class="card-head"><div class="meta"><span class="competitor">${esc(e["競品"])}</span><span>${esc(e["發現日期"])}</span></div>${e["建議行動"]?`<span class="action-badge ${esc(e["建議行動"])}">${esc(e["建議行動"])}</span>`:""}</div><h2>${esc(titleOf(e))}</h2><div class="quick-summary"><span class="bulb">💡</span><span>${esc(quickOf(e))}</span></div><p class="card-summary">${esc(e["情報摘要"])}</p><div class="tags">${split(e["營業項目"]).map(v=>`<span class="tag">${esc(v)}</span>`).join("")}</div></button>`).join("");
  renderPages(pages);
}
function renderPages(pages){
  const nav=$("pagination");if(pages<=1){nav.innerHTML="";return}
  let html=`<button class="page-button" data-page="${state.page-1}" ${state.page===1?"disabled":""}>上一頁</button>`;
  for(let i=1;i<=pages;i++)html+=`<button class="page-button ${i===state.page?"active":""}" data-page="${i}">${i}</button>`;
  html+=`<button class="page-button" data-page="${state.page+1}" ${state.page===pages?"disabled":""}>下一頁</button>`;nav.innerHTML=html;
}
function section(t,c){return String(c||"").trim()?`<section class="detail-section"><h3>${esc(t)}</h3><p>${esc(c)}</p></section>`:""}
function openDetail(e){
  if(!e)return;
  $("detailContent").innerHTML=`<div class="detail-inner"><div class="detail-meta"><span class="tag">${esc(e["競品"])}</span><span class="tag">${esc(e["發現日期"])}</span>${e["建議行動"]?`<span class="action-badge ${esc(e["建議行動"])}">${esc(e["建議行動"])}</span>`:""}</div><h2>${esc(titleOf(e))}</h2>${section("PM 快速摘要",quickOf(e))}${section("情報摘要",e["情報摘要"])}${section("詳細內容",e["詳細內容"])}${section("PM Insight",e["PM Insight"])}${section("解決哪些問題",e["解決的使用者問題"])}${section("可能影響 KPI",e["可能影響指標"])}${section("產品策略",e["產品策略"])}${e["來源連結"]?`<a class="source-link" href="${esc(e["來源連結"])}" target="_blank" rel="noopener">查看官方來源 ↗</a>`:""}</div>`;
  $("detailOverlay").hidden=false;document.body.classList.add("drawer-open");
}
function closeDetail(){$("detailOverlay").hidden=true;document.body.classList.remove("drawer-open")}
$("searchInput").oninput=e=>{state.search=e.target.value;state.page=1;render()};
$("sortSelect").onchange=e=>{state.sort=e.target.value;state.page=1;render()};
$("resetFilters").onclick=()=>{state.search="";state.products.clear();state.competitors.clear();state.sort="newest";state.page=1;$("searchInput").value="";$("sortSelect").value="newest";buildFilters();render()};
$("feed").onclick=e=>{const c=e.target.closest(".card");if(c)openDetail(events.find(x=>String(x["情報 ID"])===c.dataset.id))};
$("pagination").onclick=e=>{const b=e.target.closest(".page-button");if(!b||b.disabled)return;state.page=Number(b.dataset.page);render();window.scrollTo({top:0,behavior:"smooth"})};
$("closeDetail").onclick=closeDetail;$("overlayBackdrop").onclick=closeDetail;document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail()});
loadData();
