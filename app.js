const cfg=window.APP_CONFIG;
const csvUrl=`https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.sheetName)}`;

let events=[];
const state={
  search:"",
  weeks:new Set(),
  products:new Set(),
  platforms:new Set(),
  types:new Set(),
  competitors:new Set(),
  sort:"newest",
  page:1,
  expandedYears:new Set(),
  expandedMonths:new Set()
};

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

function normalizeDate(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  const cleaned=raw.replace(/\//g,"-");
  const d=new Date(cleaned.includes("T")?cleaned:`${cleaned}T00:00:00`);
  return Number.isNaN(d.getTime())?raw:d.toISOString().slice(0,10);
}

function normalizeRow(row,index){
  const normalized={...row};
  normalized["情報 ID"]=firstValue(row,["情報 ID","情報ID","事件 ID","事件ID"])||`ROW-${index+1}`;
  normalized["競品"]=firstValue(row,["競品","競業","競品名稱","品牌"]);
  normalized["發現日期"]=normalizeDate(firstValue(row,["發現日期","日期","發布日期"]));
  normalized["營業項目"]=firstValue(row,["營業項目","產品","產品項目"]);
  normalized["平台"]=firstValue(row,["平台","Platform","來源平台"]);

  // 相容舊資料：舊版把 App 放在營業項目內。
  const productValues=split(normalized["營業項目"]);
  if(!normalized["平台"]&&productValues.includes("App")){
    normalized["平台"]="App";
  }
  normalized["營業項目"]=productValues.filter(v=>v!=="App").join(",");

  // 若平台欄仍為空，依官方來源做保守判斷。
  if(!normalized["平台"]){
    const source=firstValue(row,["官方來源","來源名稱"]);
    if(/App Store|Google Play|iOS|Android/i.test(source))normalized["平台"]="App";
  }

  normalized["情報類型"]=firstValue(row,["情報類型","類型"]);
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
    initExpandedDateTree();
    setPeriod();
    buildFilters();
    render();
  }catch(err){
    console.error(err);
    $("feed").innerHTML='<div class="empty-state"><h2>目前無法讀取 Google Sheet</h2><p>請確認試算表已設為「知道連結的任何人可檢視」，且工作表名稱為「情報事件」。</p></div>';
  }
}

function formatFullDate(dateString){
  const d=new Date(`${dateString}T00:00:00`);
  return Number.isNaN(d.getTime())?dateString:`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function setPeriod(){
  const dates=events.map(e=>e["發現日期"]).filter(Boolean).sort();
  $("periodText").textContent=dates.length?`${formatFullDate(dates[0])}－${formatFullDate(dates[dates.length-1])}`:"—";
}

function parseLocalDate(dateString){
  const match=String(dateString||"").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(!match)return null;
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  return Number.isNaN(date.getTime())?null:date;
}

function localDateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,"0");
  const day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const day=d.getDay();
  const diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);
  return d;
}

function endOfWeek(date){
  const d=startOfWeek(date);
  d.setDate(d.getDate()+6);
  return d;
}

function weekKeyFromDate(dateString){
  const date=parseLocalDate(dateString);
  if(!date)return dateString;
  return localDateKey(startOfWeek(date));
}

function weekLabel(key){
  const start=parseLocalDate(key);
  if(!start)return key;
  const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+6);
  return `${start.getMonth()+1}/${start.getDate()}–${end.getMonth()+1}/${end.getDate()}`;
}

function buildDateTree(){
  const tree={};
  events.forEach(e=>{
    if(!e["發現日期"])return;
    const weekKey=weekKeyFromDate(e["發現日期"]);
    const start=parseLocalDate(weekKey);
    const year=start.getFullYear();
    const month=start.getMonth()+1;
    tree[year]??={};
    tree[year][month]??={};
    tree[year][month][weekKey]=(tree[year][month][weekKey]||0)+1;
  });
  return tree;
}

function initExpandedDateTree(){
  const tree=buildDateTree();
  const years=Object.keys(tree).sort((a,b)=>b-a);
  if(years[0]){
    state.expandedYears.add(years[0]);
    const months=Object.keys(tree[years[0]]).sort((a,b)=>b-a);
    if(months[0])state.expandedMonths.add(`${years[0]}-${months[0]}`);
  }
}

function renderDateFilters(){
  const tree=buildDateTree();
  const container=$("dateFilters");
  let html="";

  Object.keys(tree).sort((a,b)=>b-a).forEach(year=>{
    const yearOpen=state.expandedYears.has(year);
    html+=`<div class="date-year">
      <button class="tree-toggle year-toggle" type="button" data-year="${year}">
        <span class="tree-arrow">${yearOpen?"▾":"▸"}</span><span>${year}</span>
      </button>`;

    if(yearOpen){
      Object.keys(tree[year]).sort((a,b)=>b-a).forEach(month=>{
        const monthKey=`${year}-${month}`;
        const monthOpen=state.expandedMonths.has(monthKey);

        html+=`<div class="date-month">
          <button class="tree-toggle month-toggle" type="button" data-month="${monthKey}">
            <span class="tree-arrow">${monthOpen?"▾":"▸"}</span><span>${month}月</span>
          </button>`;

        if(monthOpen){
          html+=`<div class="date-week-list">`;
          Object.entries(tree[year][month]).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([weekKey,count])=>{
            html+=`<button class="filter-option week-option ${state.weeks.has(weekKey)?"active":""}" type="button" data-week="${weekKey}">
              <span class="left"><span class="checkbox">${state.weeks.has(weekKey)?"✓":""}</span><span>${weekLabel(weekKey)}</span></span>
              <span class="count">${count}</span>
            </button>`;
          });
          html+=`</div>`;
        }

        html+=`</div>`;
      });
    }

    html+=`</div>`;
  });

  container.innerHTML=html;

  container.querySelectorAll(".year-toggle").forEach(btn=>{
    btn.onclick=()=>{
      const year=btn.dataset.year;
      state.expandedYears.has(year)?state.expandedYears.delete(year):state.expandedYears.add(year);
      renderDateFilters();
    };
  });

  container.querySelectorAll(".month-toggle").forEach(btn=>{
    btn.onclick=()=>{
      const key=btn.dataset.month;
      state.expandedMonths.has(key)?state.expandedMonths.delete(key):state.expandedMonths.add(key);
      renderDateFilters();
    };
  });

  container.querySelectorAll(".week-option").forEach(btn=>{
    btn.onclick=()=>{
      const key=btn.dataset.week;
      state.weeks.has(key)?state.weeks.delete(key):state.weeks.add(key);
      state.page=1;
      renderDateFilters();
      render();
    };
  });
}

function counts(field,multi=false){
  const map=new Map();
  events.forEach(e=>{
    const values=multi?split(e[field]):[String(e[field]||"").trim()].filter(Boolean);
    values.forEach(v=>map.set(v,(map.get(v)||0)+1));
  });
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],"zh-Hant"));
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
      state.page=1;
      buildFilters();
      render();
    };
  });
}

function buildFilters(){
  renderDateFilters();
  renderFilter("productFilters",counts("營業項目",true),state.products);
  renderFilter("platformFilters",counts("平台",true),state.platforms);
  renderFilter("typeFilters",counts("情報類型",true),state.types);
  renderFilter("competitorFilters",counts("競品"),state.competitors);
}

function filtered(){
  const q=state.search.trim().toLowerCase();

  const list=events.filter(e=>{
    const hay=[
      e["標題"],e["PM 快速摘要"],e["情報摘要"],e["PM Insight"],
      e["Tag"],e["競品"],e["營業項目"],e["平台"],e["情報類型"]
    ].join(" ").toLowerCase();

    return (!q||hay.includes(q))
      &&(!state.weeks.size||state.weeks.has(weekKeyFromDate(e["發現日期"])))
      &&(!state.products.size||split(e["營業項目"]).some(v=>state.products.has(v)))
      &&(!state.platforms.size||split(e["平台"]).some(v=>state.platforms.has(v)))
      &&(!state.types.size||split(e["情報類型"]).some(v=>state.types.has(v)))
      &&(!state.competitors.size||state.competitors.has(e["競品"]));
  });

  return list.sort((a,b)=>state.sort==="oldest"
    ?String(a["發現日期"]).localeCompare(String(b["發現日期"]))
    :String(b["發現日期"]).localeCompare(String(a["發現日期"])));
}

function displayTitle(e){
  const title=String(e["標題"]||"").trim();
  return title.includes("｜")?title:`${e["競品"]||"未標示品牌"}｜${title}`;
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
        <div class="meta"><span>${esc(formatFullDate(e["發現日期"]))}</span></div>
        ${e["建議行動"]?`<span class="action-badge ${esc(e["建議行動"])}">${esc(e["建議行動"])}</span>`:""}
      </div>

      <h2>${esc(displayTitle(e))}</h2>

      <div class="quick-summary">
        <span class="quick-label">PM 快速摘要</span>
        <p>${esc(quickOf(e))}</p>
      </div>

      <p class="card-summary">${esc(excerpt(e["情報摘要"]))}</p>

      <div class="tag-groups">
        <div class="tag-row">
          ${split(e["營業項目"]).map(v=>`<span class="tag product-tag">${esc(v)}</span>`).join("")}
          ${split(e["平台"]).map(v=>`<span class="tag platform-tag">${esc(v)}</span>`).join("")}
        </div>
        <div class="tag-row">
          ${split(e["情報類型"]).map(v=>`<span class="tag type-tag">${esc(v)}</span>`).join("")}
        </div>
      </div>

      <div class="card-footer">
        <span class="week-label">${esc(weekLabel(weekKeyFromDate(e["發現日期"])))}</span>
        <span class="read-more">查看完整分析 →</span>
      </div>
    </button>`).join("");

  renderPages(pages);
}

function renderPages(pages){
  const nav=$("pagination");
  if(pages<=1){nav.innerHTML="";return}

  let html=`<button class="page-button" data-page="${state.page-1}" ${state.page===1?"disabled":""}>上一頁</button>`;
  for(let i=1;i<=pages;i++){
    html+=`<button class="page-button ${i===state.page?"active":""}" data-page="${i}">${i}</button>`;
  }
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
        <span class="tag date-tag">${esc(formatFullDate(e["發現日期"]))}</span>
        ${split(e["平台"]).map(v=>`<span class="tag platform-tag">${esc(v)}</span>`).join("")}
        ${split(e["情報類型"]).map(v=>`<span class="tag type-tag">${esc(v)}</span>`).join("")}
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
  state.search="";
  state.weeks.clear();
  state.products.clear();
  state.platforms.clear();
  state.types.clear();
  state.competitors.clear();
  state.sort="newest";
  state.page=1;

  $("searchInput").value="";
  $("sortSelect").value="newest";

  buildFilters();
  render();
};

$("feed").onclick=e=>{
  const card=e.target.closest(".card");
  if(!card)return;
  openDetail(events.find(x=>String(x["情報 ID"])===String(card.dataset.id)));
};

$("pagination").onclick=e=>{
  const button=e.target.closest(".page-button");
  if(!button||button.disabled)return;
  state.page=Number(button.dataset.page);
  render();
  window.scrollTo({top:0,behavior:"smooth"});
};

$("closeDetail").onclick=closeDetail;
$("overlayBackdrop").onclick=closeDetail;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail()});

loadData();
