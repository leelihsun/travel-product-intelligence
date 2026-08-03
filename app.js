const cfg = window.APP_CONFIG;
const csvUrl = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheetName)}`;

let events = [];
const state = { search:"", product:null, competitor:null, action:null, sort:"newest" };

const $ = id => document.getElementById(id);
const split = v => String(v || "").split(/[,，]/).map(x=>x.trim()).filter(Boolean);
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function parseCSV(text){
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c === '"' && quoted && n === '"'){ cell+='"'; i++; }
    else if(c === '"'){ quoted=!quoted; }
    else if(c === ',' && !quoted){ row.push(cell); cell=""; }
    else if((c === '\n' || c === '\r') && !quoted){
      if(c === '\r' && n === '\n') i++;
      row.push(cell); if(row.some(x=>x!=="")) rows.push(row); row=[]; cell="";
    } else cell+=c;
  }
  if(cell.length || row.length){ row.push(cell); rows.push(row); }
  const headers=rows.shift().map(h=>h.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}

async function loadData(){
  try{
    const res=await fetch(csvUrl,{cache:"no-store"});
    if(!res.ok) throw new Error(`Google Sheet 回應 ${res.status}`);
    const text=await res.text();
    const parsed=parseCSV(text).filter(x=>x["情報 ID"] || x["標題"]);
    if(!parsed.length) throw new Error("找不到「情報事件」資料");
    events=parsed;
    $("syncStatus").textContent=`已連接 Google Sheet｜${new Date().toLocaleString("zh-TW")}`;
  }catch(err){
    const fallback=await fetch(cfg.fallbackDataUrl).then(r=>r.json());
    events=fallback;
    $("syncStatus").textContent="目前顯示內建 W3 資料｜請確認試算表公開權限";
    console.warn(err);
  }
  buildFilters();
  render();
}

function unique(field, multi=false){
  const values=events.flatMap(e=>multi?split(e[field]):[e[field]]).filter(Boolean);
  return [...new Set(values)].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
}

function renderFilter(containerId, values, stateKey){
  const box=$(containerId); box.innerHTML="";
  values.forEach(value=>{
    const b=document.createElement("button");
    b.className="filter-chip"+(state[stateKey]===value?" active":"");
    b.textContent=value;
    b.onclick=()=>{state[stateKey]=state[stateKey]===value?null:value; buildFilters(); render();};
    box.appendChild(b);
  });
}
function buildFilters(){
  renderFilter("productFilters",unique("營業項目",true),"product");
  renderFilter("competitorFilters",unique("競品"),"competitor");
  renderFilter("actionFilters",unique("建議行動"),"action");
}

function filtered(){
  const q=state.search.trim().toLowerCase();
  const result=events.filter(e=>{
    const hay=Object.values(e).join(" ").toLowerCase();
    return (!q || hay.includes(q))
      && (!state.product || split(e["營業項目"]).includes(state.product))
      && (!state.competitor || e["競品"]===state.competitor)
      && (!state.action || e["建議行動"]===state.action);
  });
  return result.sort((a,b)=>{
    if(state.sort==="oldest") return String(a["發現日期"]).localeCompare(String(b["發現日期"]));
    if(state.sort==="competitor") return String(a["競品"]).localeCompare(String(b["競品"]),"zh-Hant");
    return String(b["發現日期"]).localeCompare(String(a["發現日期"]));
  });
}

function render(){
  const data=filtered(), feed=$("feed");
  $("visibleCount").textContent=data.length;
  $("emptyState").hidden=data.length!==0;
  feed.innerHTML=data.map((e,i)=>`
    <article class="card" data-id="${escapeHtml(e["情報 ID"])}">
      <div class="card-top">
        <div class="brand">${escapeHtml(e["競品"])}${e["版本"]?` · ${escapeHtml(e["版本"])}`:""}</div>
        <div class="date">${escapeHtml(e["發現日期"])}</div>
      </div>
      <h2>${escapeHtml(e["標題"])}</h2>
      <p class="card-summary">${escapeHtml(e["情報摘要"])}</p>
      <div class="tags">
        ${split(e["營業項目"]).map(x=>`<span class="tag">${escapeHtml(x)}</span>`).join("")}
        ${e["建議行動"]?`<span class="tag action ${escapeHtml(e["建議行動"])}">${escapeHtml(e["建議行動"])}</span>`:""}
      </div>
    </article>`).join("");
  [...feed.querySelectorAll(".card")].forEach(card=>{
    card.onclick=()=>openDetail(events.find(e=>e["情報 ID"]===card.dataset.id));
  });
}

function section(title, content){
  if(!content) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(content)}</p></section>`;
}
function openDetail(e){
  if(!e) return;
  $("detailContent").innerHTML=`<div class="detail-inner">
    <div class="detail-meta">
      <span class="tag">${escapeHtml(e["競品"])}</span>
      <span class="tag">${escapeHtml(e["平台"])}</span>
      <span class="tag">${escapeHtml(e["發現日期"])}</span>
      ${e["建議行動"]?`<span class="tag action ${escapeHtml(e["建議行動"])}">${escapeHtml(e["建議行動"])}</span>`:""}
    </div>
    <h2>${escapeHtml(e["標題"])}</h2>
    <p class="card-summary">${escapeHtml(e["情報摘要"])}</p>
    ${section("詳細內容",e["詳細內容"])}
    ${section("PM Insight",e["PM Insight"])}
    ${section("解決的使用者問題",e["解決的使用者問題"])}
    ${section("可能影響指標",e["可能影響指標"])}
    ${section("產品策略",e["產品策略"])}
    ${section("功能面向",e["功能面向"])}
    ${e["來源連結"]?`<a class="source-link" href="${escapeHtml(e["來源連結"])}" target="_blank" rel="noopener">查看原始來源 ↗</a>`:""}
  </div>`;
  $("detailDialog").showModal();
}

$("searchInput").addEventListener("input",e=>{state.search=e.target.value;render();});
$("sortSelect").addEventListener("change",e=>{state.sort=e.target.value;render();});
$("resetFilters").addEventListener("click",()=>{
  Object.assign(state,{search:"",product:null,competitor:null,action:null,sort:"newest"});
  $("searchInput").value=""; $("sortSelect").value="newest"; buildFilters(); render();
});
$("closeDialog").onclick=()=>$("detailDialog").close();
$("detailDialog").addEventListener("click",e=>{if(e.target===$("detailDialog")) $("detailDialog").close();});
loadData();
