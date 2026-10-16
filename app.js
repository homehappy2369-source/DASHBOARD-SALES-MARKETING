/* Happy Home Sales & Marketing Dashboard
 * Demo mode uses localStorage only. Online synchronization is not enabled until
 * Supabase tables + RLS policies are deliberately configured.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const today = new Date();
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthNow = localDate(today).slice(0,7);
  const fmtRp = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
  const fmtNum = n => new Intl.NumberFormat("id-ID").format(Number(n)||0);
  const monthLabel = m => m ? new Date(m+"-01T00:00:00").toLocaleDateString("id-ID",{month:"long",year:"numeric"}) : "";
  const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2));
  const STORE_KEY = "hh_sales_marketing_v1";
  const CONFIG_KEY = "hh_sales_supabase_config_v1";
  let state = {revenue:[],chats:[],bcg:[]};
  let demoMode = true, supabaseClient = null, charts = {};
  let currentPage = "dashboard";
  let selectedBcgCategory = null, showAllChatHistory = false;
  const defaultConfig = {url:"",key:""};

  function seedData() {
    const revenue=[], chats=[];
    const first = new Date(today.getFullYear(),today.getMonth(),1);
    for(let i=0;i<Math.min(today.getDate(),14);i++){
      const d=new Date(first); d.setDate(i+1); const ds=localDate(d);
      revenue.push({id:"demo-r-"+ds,date:ds,store1:8500000+((i*791237)%6200000),store2:6100000+((i*541789)%4800000),notes:i%5===0?"Promo akhir pekan":""});
      chats.push({id:"demo-c-wa-"+ds,date:ds,count:24+((i*5)%18),channel:"WhatsApp",notes:i%4===0?"Pertanyaan promo":""}); chats.push({id:"demo-c-ig-"+ds,date:ds,count:4+(i%6),channel:"Instagram",notes:""}); chats.push({id:"demo-c-tt-"+ds,date:ds,count:2+(i%5),channel:"TikTok",notes:""}); chats.push({id:"demo-c-web-"+ds,date:ds,count:i%3,channel:"Website",notes:""});
    }
    const names=["Rak Piring Stainless","Wadah Makan Set","Teko Listrik","Gelas Kaca 6 pcs","Sapu Lantai","Tempat Bumbu","Panci Serbaguna","Botol Minum","Keset Rumah","Tempat Sampah"];
    const bcg=names.map((name,i)=>({id:"demo-b-"+i,period:monthNow,code:"HH"+String(1001+i),name,sales:1200000+((i*93731)%4800000),previous:900000+((i*41319)%3500000),margin:12+(i%6)*3}));
    return {revenue,chats,bcg};
  }
  function loadLocal() {
    try { const raw=localStorage.getItem(STORE_KEY); if(raw){const parsed=JSON.parse(raw);state={revenue:parsed.revenue||[],chats:parsed.chats||[],bcg:parsed.bcg||[]};return;} } catch(e){}
    state=seedData(); saveLocal();
  }
  function saveLocal(){try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch(e){toast("Penyimpanan browser penuh atau tidak tersedia.");}}
  function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2800);}
  function monthRows(rows,month,key="date"){return rows.filter(r=>(r[key]||"").slice(0,7)===month);}
  function effectiveChats(rows){
    const hasSplit=rows.some(r=>r.channel && r.channel!=="Semua kanal");
    return hasSplit?rows.filter(r=>r.channel!=="Semua kanal"):rows;
  }
  function channelTotals(rows){
    const channels=["WhatsApp","Instagram","TikTok","Website","Lainnya"];
    const source=effectiveChats(rows);
    return channels.map(channel=>({channel,total:source.filter(r=>(r.channel||"Lainnya")===channel).reduce((s,r)=>s+(+r.count||0),0)}));
  }
  function renderChannelSummary(targetId,rows){
    const target=$(targetId);if(!target)return;
    const totals=channelTotals(rows);
    const meta={WhatsApp:"WA",Instagram:"IG",TikTok:"TikTok",Website:"Web",Lainnya:"Lainnya"};
    target.innerHTML=totals.map(x=>`<div class="channel-chip"><span>${meta[x.channel]||x.channel}</span><strong>${fmtNum(x.total)}</strong><small>${esc(x.channel)}</small></div>`).join("");
  }
  function currentMonth(){return $("dashboardMonth").value||monthNow;}
  function categoryFor(item, totalSales) {
    const growth = item.previous > 0 ? ((item.sales-item.previous)/item.previous)*100 : (item.sales>0?100:0);
    const contribution = totalSales>0 ? item.sales/totalSales*100 : 0;
    // Simple internal portfolio rule: high growth >= 20%, high contribution >= 10%.
    const highGrowth=growth>=20, highShare=contribution>=10;
    return {growth,contribution,category:highGrowth?(highShare?"Star":"Question Mark"):(highShare?"Cash Cow":"Dog")};
  }
  function bcgForMonth(month){
    const rows=monthRows(state.bcg,month,"period");
    const total=rows.reduce((s,r)=>s+(Number(r.sales)||0),0);
    return rows.map(r=>({...r,...categoryFor(r,total)}));
  }
  function activateDemo(){
    demoMode=true;supabaseClient=null;
    $("authScreen").classList.add("hidden");$("appShell").classList.remove("hidden");
    $("demoBanner").classList.remove("hidden");
    $("connectionLabel").textContent="Mode demo";$("connectionDetail").textContent="Data lokal perangkat ini";
    renderAll();toast("Mode demo aktif. Data tersimpan di browser ini.");
  }
  function showAuth(){ $("appShell").classList.add("hidden");$("authScreen").classList.remove("hidden"); }
  function showPage(page){
    currentPage=page;
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
    document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    const labels={dashboard:["OVERVIEW","Dashboard"],bcg:["PRODUCT PORTFOLIO","BCG Barang"],chat:["CUSTOMER ACTIVITY","Track Chat"],omzet:["REVENUE TRACKING","Track Omzet"],settings:["WORKSPACE","Pengaturan"]};
    $("pageEyebrow").textContent=labels[page][0];$("pageTitle").textContent=labels[page][1];
    $("sidebar").classList.remove("open");
    if(page==="dashboard")renderDashboard();
    if(page==="bcg")renderBcg();
    if(page==="chat")renderChat();
    if(page==="omzet")renderRevenue();
  }
  function chartDestroy(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
  function chartLine(id,labels,datasets){chartDestroy(id);const canvas=$(id);if(!canvas||!window.Chart)return;charts[id]=new Chart(canvas,{type:"line",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtRp(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color:"#9991a8",maxTicksLimit:8,font:{size:10}}},y:{grid:{color:"#f0edf5"},ticks:{color:"#9991a8",font:{size:10},callback:v=>v>=1000000?(v/1000000).toFixed(1)+" jt":v>=1000?(v/1000).toFixed(0)+" rb":v}}}}});}
  function chartBars(id,labels,datasets,formatCurrency=false){chartDestroy(id);const canvas=$(id);if(!canvas||!window.Chart)return;charts[id]=new Chart(canvas,{type:"bar",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${formatCurrency?fmtRp(c.raw):fmtNum(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color:"#9991a8",maxTicksLimit:8,font:{size:10}}},y:{beginAtZero:true,grid:{color:"#f0edf5"},ticks:{color:"#9991a8",font:{size:10},callback:v=>formatCurrency?(v>=1000000?(v/1000000).toFixed(1)+" jt":v>=1000?(v/1000).toFixed(0)+" rb":v):v}}}}});}
  function renderDashboard(){
    const m=currentMonth(), rev=monthRows(state.revenue,m), chat=effectiveChats(monthRows(state.chats,m)), bcg=bcgForMonth(m);
    renderChannelSummary("dashboardChannelSummary",chat); $("dashboardChannelPeriod").textContent=monthLabel(m);
    $("kpiOmzet").textContent=fmtRp(rev.reduce((s,r)=>s+(+r.store1||0)+(+r.store2||0),0));
    $("kpiChat").textContent=fmtNum(chat.reduce((s,r)=>s+(+r.count||0),0));
    $("kpiDays").textContent=fmtNum(rev.length);$("kpiProducts").textContent=fmtNum(bcg.length);
    $("kpiOmzetMeta").textContent=`Toko 1 ${fmtRp(rev.reduce((s,r)=>s+(+r.store1||0),0))} · Toko 2 ${fmtRp(rev.reduce((s,r)=>s+(+r.store2||0),0))}`;
    $("kpiChatMeta").textContent=`${new Set(chat.map(r=>r.date)).size} hari tercatat · rincian per kanal di bawah`; $("kpiProductsMeta").textContent="Hasil BCG "+monthLabel(m);
    const days=new Set([...rev.map(r=>r.date),...chat.map(r=>r.date)]);
    const labels=Array.from({length:new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate()},(_,i)=>String(i+1));
    const store1=labels.map((_,i)=>{const d=`${m}-${String(i+1).padStart(2,"0")}`;return rev.find(r=>r.date===d)?.store1||0;});
    const store2=labels.map((_,i)=>{const d=`${m}-${String(i+1).padStart(2,"0")}`;return rev.find(r=>r.date===d)?.store2||0;});
    chartLine("revenueChart",labels,[{label:"Toko 1",data:store1,borderColor:"#56358b",backgroundColor:"#56358b",tension:.32,pointRadius:2},{label:"Toko 2",data:store2,borderColor:"#ed70a6",backgroundColor:"#ed70a6",tension:.32,pointRadius:2}]);
    const counts=["Star","Cash Cow","Question Mark","Dog"].map(c=>bcg.filter(r=>r.category===c).length);
    chartDestroy("bcgChart");if(window.Chart)charts.bcgChart=new Chart($("bcgChart"),{type:"doughnut",data:{labels:["Star","Cash Cow","Question Mark","Dog"],datasets:[{data:counts,backgroundColor:["#5ca978","#6788d4","#edbd4f","#db7b84"],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{display:false}}}});
    $("bcgLegend").innerHTML=["Star","Cash Cow","Question Mark","Dog"].map((c,i)=>`<span>${c}<b>${counts[i]}</b></span>`).join("");
    const chatData=labels.map((_,i)=>{const d=`${m}-${String(i+1).padStart(2,"0")}`;return chat.filter(r=>r.date===d).reduce((sum,r)=>sum+(+r.count||0),0);});
    chartBars("chatChart",labels,[{label:"Chat masuk",data:chatData,backgroundColor:"#ed70a6",borderRadius:5}],false);
    const latest=[...rev].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
    $("recentRecords").innerHTML=latest.length?latest.map(r=>`<div class="recent-row"><div><strong>${esc(r.date)}</strong><small>Toko 1 + Toko 2</small></div><div class="recent-amount">${fmtRp((+r.store1||0)+(+r.store2||0))}</div></div>`).join(""):'<div class="empty-cell">Belum ada catatan omzet.</div>';
  }
  function renderBcg(){
    const m=$("bcgPeriod").value||monthNow;const search=($("bcgSearch").value||"").toLowerCase();const all=bcgForMonth(m);
    const n=c=>all.filter(r=>r.category===c).length;
    $("countStar").textContent=n("Star");$("countCow").textContent=n("Cash Cow");$("countQuestion").textContent=n("Question Mark");$("countDog").textContent=n("Dog");
    document.querySelectorAll("[data-bcg-category]").forEach(b=>{const active=b.dataset.bcgCategory===selectedBcgCategory;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));});
    const table=$("bcgTableBody");
    if(!selectedBcgCategory){$("bcgTableTitle").textContent="Hasil klasifikasi";$("bcgTableMeta").textContent=`${all.length} barang dianalisis · ${monthLabel(m)}. Pilih kategori untuk melihat daftar.`;table.innerHTML='<tr><td colspan="6" class="empty-cell">Pilih kartu Star, Cash Cow, Question Mark, atau Dog untuk melihat barang dalam kategori tersebut.</td></tr>';return;}
    const categoryRows=all.filter(r=>r.category===selectedBcgCategory);const rows=categoryRows.filter(r=>(r.name+" "+r.code).toLowerCase().includes(search));
    $("bcgTableTitle").textContent=selectedBcgCategory;$("bcgTableMeta").textContent=`${rows.length} dari ${categoryRows.length} barang · ${monthLabel(m)}`;
    table.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.code)}</td><td><strong>${esc(r.name)}</strong></td><td>${fmtRp(r.sales)}</td><td>${Number(r.growth).toFixed(1)}%</td><td>${Number(r.contribution).toFixed(1)}%</td><td><span class="tag ${r.category.toLowerCase().replace(" ","-")}">${esc(r.category)}</span></td></tr>`).join(""):'<tr><td colspan="6" class="empty-cell">Tidak ada barang yang cocok di kategori ini.</td></tr>';
  }
  function renderChat(){
    const m=$("chatMonth").value||monthNow, allRows=monthRows(state.chats,m).sort((a,b)=>b.date.localeCompare(a.date));
    const rows=effectiveChats(allRows);
    $("chatMonthTotal").textContent=fmtNum(rows.reduce((s,r)=>s+(+r.count||0),0));
    renderChannelSummary("chatPageChannelSummary",rows);
    const days=Array.from({length:new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate()},(_,i)=>String(i+1));
    chartBars("chatPageChart",days,[{label:"Chat masuk",data:days.map((_,i)=>{const d=`${m}-${String(i+1).padStart(2,"0")}`;return rows.filter(r=>r.date===d).reduce((sum,r)=>sum+(+r.count||0),0);}),backgroundColor:"#ed70a6",borderRadius:4}],false);
    const visible=showAllChatHistory?rows:rows.slice(0,6);
    $("chatHistoryMeta").textContent=rows.length?`Menampilkan ${visible.length} dari ${rows.length} catatan bulan ini.`:"Belum ada catatan chat.";
    $("toggleChatHistory").textContent=showAllChatHistory?"Tampilkan ringkas":"Tampilkan semua";
    $("toggleChatHistory").classList.toggle("hidden",rows.length<=6);
    $("chatTableBody").innerHTML=visible.length?visible.map(r=>`<tr><td>${esc(r.date)}</td><td><strong>${fmtNum(r.count)}</strong></td><td><span class="tag channel-tag">${esc(r.channel||"Lainnya")}</span></td><td class="chat-note-cell" title="${esc(r.notes||"")}">${esc(r.notes||"—")}</td><td><div class="row-actions"><button data-edit-chat="${esc(r.id)}">Edit</button><button class="delete" data-delete-chat="${esc(r.id)}">Hapus</button></div></td></tr>`).join(""):'<tr><td colspan="5" class="empty-cell">Belum ada catatan chat pada periode ini.</td></tr>';
  }
  function renderRevenue(){
    const m=$("revenueMonth").value||monthNow, rows=monthRows(state.revenue,m).sort((a,b)=>b.date.localeCompare(a.date));
    const s1=rows.reduce((s,r)=>s+(+r.store1||0),0),s2=rows.reduce((s,r)=>s+(+r.store2||0),0);
    $("store1Total").textContent=fmtRp(s1);$("store2Total").textContent=fmtRp(s2);$("storeCombinedTotal").textContent=fmtRp(s1+s2);
    const days=Array.from({length:new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate()},(_,i)=>String(i+1));
    chartLine("revenuePageChart",days,[{label:"Toko 1",data:days.map((_,i)=>state.revenue.find(r=>r.date===`${m}-${String(i+1).padStart(2,"0")}`)?.store1||0),borderColor:"#56358b",backgroundColor:"#56358b",tension:.3,pointRadius:1},{label:"Toko 2",data:days.map((_,i)=>state.revenue.find(r=>r.date===`${m}-${String(i+1).padStart(2,"0")}`)?.store2||0),borderColor:"#ed70a6",backgroundColor:"#ed70a6",tension:.3,pointRadius:1}]);
    $("revenueTableBody").innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${fmtRp(r.store1)}</td><td>${fmtRp(r.store2)}</td><td><strong>${fmtRp((+r.store1||0)+(+r.store2||0))}</strong></td><td>${esc(r.notes||"—")}</td><td><div class="row-actions"><button data-edit-revenue="${esc(r.id)}">Edit</button><button class="delete" data-delete-revenue="${esc(r.id)}">Hapus</button></div></td></tr>`).join(""):'<tr><td colspan="6" class="empty-cell">Belum ada catatan omzet pada periode ini.</td></tr>';
  }
  function renderAll(){renderDashboard();renderBcg();renderChat();renderRevenue();}
  const remoteTable = {revenue:"hh_revenue",chats:"hh_chats",bcg:"hh_bcg_items"};
  function toRemoteRow(key,r){
    if(key==="revenue")return {id:r.id,work_date:r.date,store1:Number(r.store1)||0,store2:Number(r.store2)||0,notes:r.notes||""};
    if(key==="chats")return {id:r.id,work_date:r.date,chat_count:Number(r.count)||0,channel:r.channel||"Lainnya",notes:r.notes||""};
    return {id:r.id,period:r.period,product_code:r.code||"",product_name:r.name||"",sales:Number(r.sales)||0,previous_sales:Number(r.previous)||0,margin:r.margin==null?null:Number(r.margin)};
  }
  function fromRemoteRows(revenue,chats,bcg){
    return {
      revenue:(revenue||[]).map(r=>({id:r.id,date:r.work_date,store1:Number(r.store1)||0,store2:Number(r.store2)||0,notes:r.notes||""})),
      chats:(chats||[]).map(r=>({id:r.id,date:r.work_date,count:Number(r.chat_count)||0,channel:r.channel||"Lainnya",notes:r.notes||""})),
      bcg:(bcg||[]).map(r=>({id:r.id,period:r.period,code:r.product_code||"",name:r.product_name||"",sales:Number(r.sales)||0,previous:Number(r.previous_sales)||0,margin:r.margin==null?null:Number(r.margin)}))
    };
  }
  async function loadOnlineData(){
    if(!supabaseClient)throw new Error("Koneksi Supabase belum siap.");
    const {data:allowed,error:allowError}=await supabaseClient.rpc("hh_is_allowed_user");
    if(allowError)throw allowError;
    if(!allowed)throw new Error("Akun ini belum diizinkan mengakses dashboard. Pastikan UUID akun sudah ditambahkan ke tabel allowed_users.");
    const [rev,chats,bcg]=await Promise.all([
      supabaseClient.from("hh_revenue").select("id,work_date,store1,store2,notes").order("work_date",{ascending:false}),
      supabaseClient.from("hh_chats").select("id,work_date,chat_count,channel,notes").order("work_date",{ascending:false}),
      supabaseClient.from("hh_bcg_items").select("id,period,product_code,product_name,sales,previous_sales,margin").order("period",{ascending:false})
    ]);
    const err=[rev.error,chats.error,bcg.error].find(Boolean);if(err)throw err;
    state=fromRemoteRows(rev.data,chats.data,bcg.data);saveLocal();renderAll();
  }
  async function saveRemoteRow(key,item){
    if(demoMode||!supabaseClient)return;
    const {error}=await supabaseClient.from(remoteTable[key]).upsert(toRemoteRow(key,item));
    if(error)throw error;
  }
  async function deleteRemoteRow(key,id){
    if(demoMode||!supabaseClient)return;
    const {error}=await supabaseClient.from(remoteTable[key]).delete().eq("id",id);
    if(error)throw error;
  }
  async function replaceBcgMonth(month,imported){
    const oldRows=state.bcg.filter(r=>r.period===month);
    if(!demoMode&&supabaseClient){
      if(imported.length){
        const {error}=await supabaseClient.from("hh_bcg_items").upsert(imported.map(r=>toRemoteRow("bcg",r)));
        if(error)throw error;
      }
      const oldIds=oldRows.filter(r=>!imported.some(n=>n.id===r.id)).map(r=>r.id);
      if(oldIds.length){const {error}=await supabaseClient.from("hh_bcg_items").delete().in("id",oldIds);if(error)throw error;}
    }
    state.bcg=state.bcg.filter(r=>r.period!==month).concat(imported);saveLocal();renderAll();
  }
  async function upsert(key,item){
    const previous=state[key].find(r=>r.id===item.id);const index=state[key].findIndex(r=>r.id===item.id);
    if(index>=0)state[key][index]=item;else state[key].push(item);
    try{await saveRemoteRow(key,item);saveLocal();renderAll();}
    catch(err){if(index>=0)state[key][index]=previous;else state[key]=state[key].filter(r=>r.id!==item.id);renderAll();toast("Gagal menyimpan ke Supabase: "+err.message);throw err;}
  }
  function exportCsv(filename,rows){if(!rows.length){toast("Tidak ada data untuk diekspor.");return;}const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);toast("File ekspor disiapkan.");}
  function exportBcg(){
    const rows=bcgForMonth($("bcgPeriod").value||monthNow);if(!rows.length){toast("Belum ada data BCG untuk diekspor.");return;}
    const data=[["Kode Barang","Nama Barang","Penjualan","Penjualan Sebelumnya","Pertumbuhan (%)","Kontribusi (%)","Margin (%)","Kategori"],...rows.map(r=>[r.code,r.name,r.sales,r.previous,Number(r.growth.toFixed(2)),Number(r.contribution.toFixed(2)),r.margin??"",r.category])];
    if(window.XLSX){const ws=XLSX.utils.aoa_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"BCG");XLSX.writeFile(wb,`BCG-Happy-Home-${$("bcgPeriod").value||monthNow}.xlsx`);}else exportCsv(`BCG-Happy-Home-${monthNow}.csv`,data);
  }
  function normalizeHeader(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
  function findCol(headers,aliases){return headers.findIndex(h=>aliases.includes(normalizeHeader(h)));}
  async function importBcg(){
    const file=$("bcgFile").files[0];if(!file){toast("Pilih file Excel atau CSV terlebih dahulu.");return;}
    try{
      let rows;
      if(file.name.toLowerCase().endsWith(".csv")){const text=await file.text();const lines=text.split(/\r?\n/).filter(Boolean);rows=lines.map(line=>line.split(",").map(s=>s.trim().replace(/^"|"$/g,"")));}else{
        if(!window.XLSX)throw new Error("Library pembaca Excel belum termuat. Periksa koneksi internet.");
        const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      }
      if(!rows||rows.length<2)throw new Error("File tidak berisi baris data yang cukup.");
      const headers=rows[0], codeI=findCol(headers,["kode","kodebarang","code","itemcode","sku"]), nameI=findCol(headers,["nama","namabarang","name","itemname","barang"]), salesI=findCol(headers,["penjualan","totalpenjualan","omzet","sales","salesamount","total","nilaipenjualan"]), qtyI=findCol(headers,["qty","jumlahterjual","quantity","terjual"]), prevI=findCol(headers,["penjualansebelumnya","penjualanbulanlalu","previoussales","salesprevious","omzetsebelumnya"]), marginI=findCol(headers,["margin","marginpersen","labapersen","profitmargin"]);
      if(nameI<0)throw new Error("Kolom nama barang tidak ditemukan. Gunakan header Nama Barang atau Nama.");
      if(salesI<0&&qtyI<0)throw new Error("Kolom penjualan/omzet atau jumlah terjual tidak ditemukan. Periksa header Excel.");
      const month=$("bcgPeriod").value||monthNow, imported=[];
      const parseNum=v=>Number(String(v??0).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",", "."))||0;
      rows.slice(1).forEach((row,i)=>{const name=String(row[nameI]||"").trim();if(!name)return;const sales=parseNum(row[salesI>=0?salesI:qtyI]);const prev=prevI>=0?parseNum(row[prevI]):0;imported.push({id:uid(),period:month,code:codeI>=0?String(row[codeI]||"").trim():`IMP-${i+1}`,name,sales,previous:prev,margin:marginI>=0?parseNum(row[marginI]):null});});
      if(!imported.length)throw new Error("Tidak ada baris barang yang dapat dibaca.");
      await replaceBcgMonth(month,imported);toast(`${imported.length} barang berhasil dianalisis untuk ${monthLabel(month)}.`);
    }catch(err){toast(err.message||"Gagal membaca file.");}
  }
  function setEditChat(id){const r=state.chats.find(x=>x.id===id);if(!r)return;$("chatEditId").value=r.id;$("chatDate").value=r.date;$("chatCount").value=r.count;$("chatChannel").value=r.channel||"Semua kanal";$("chatNotes").value=r.notes||"";$("saveChatButton").textContent="Simpan perubahan";$("cancelChatEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
  function resetChatForm(){$("chatForm").reset();$("chatEditId").value="";$("chatDate").value=localDate(today);$("saveChatButton").textContent="Simpan catatan";$("cancelChatEdit").classList.add("hidden");}
  function setEditRevenue(id){const r=state.revenue.find(x=>x.id===id);if(!r)return;$("revenueEditId").value=r.id;$("revenueDate").value=r.date;$("store1Amount").value=r.store1;$("store2Amount").value=r.store2;$("revenueNotes").value=r.notes||"";$("saveRevenueButton").textContent="Simpan perubahan";$("cancelRevenueEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
  function resetRevenueForm(){$("revenueForm").reset();$("revenueEditId").value="";$("revenueDate").value=localDate(today);$("saveRevenueButton").textContent="Simpan omzet";$("cancelRevenueEdit").classList.add("hidden");}
  function getConfig(){try{return {...defaultConfig,...JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}")};}catch(e){return defaultConfig;}}
  async function connectSupabase(url,key){
    if(!url||!key)throw new Error("Isi Project URL dan publishable/anon key terlebih dahulu.");
    if(!window.supabase?.createClient)throw new Error("Library Supabase belum termuat. Periksa koneksi internet.");
    const client=window.supabase.createClient(url,key);
    client.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY"){$("recoveryPanel").classList.remove("hidden");$("authNotice").className="notice info";$("authNotice").textContent="Tautan reset valid. Buat kata sandi baru di bawah.";}});
    const {data:{session},error}=await client.auth.getSession();if(error)throw error;
    supabaseClient=client;
    localStorage.setItem(CONFIG_KEY,JSON.stringify({url,key}));$("supabaseStatus").textContent="Terhubung";$("connectionLabel").textContent="Supabase siap";$("connectionDetail").textContent=session?"Sesi login aktif":"Login diperlukan";
    toast("Koneksi Supabase tersimpan. Silakan login online untuk memuat data.");return client;
  }
  function bindEvents(){
    document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
    document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.goto)));
    $("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
    $("demoButton").addEventListener("click",activateDemo);
    $("loginForm").addEventListener("submit",async e=>{
      e.preventDefault();const cfg=getConfig();if(!supabaseClient&&cfg.url&&cfg.key){try{await connectSupabase(cfg.url,cfg.key);}catch(err){$("authNotice").className="notice error";$("authNotice").textContent=err.message;return;}}
      if(!supabaseClient){$("authNotice").className="notice warning";$("authNotice").textContent="Koneksi Supabase belum dikonfigurasi. Buka mode demo untuk mencoba, atau isi koneksi di Pengaturan.";return;}
      try{
        const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
        if(error)throw error;if(!data.user)throw new Error("Login tidak berhasil.");
        demoMode=false;
        try{await loadOnlineData();}catch(syncErr){await supabaseClient.auth.signOut();demoMode=true;throw new Error("Login berhasil, tetapi akses database gagal. Periksa UUID akun di tabel allowed_users, RLS, dan nama tabel. Detail: "+syncErr.message);}
        $("authScreen").classList.add("hidden");$("appShell").classList.remove("hidden");$("demoBanner").classList.add("hidden");$("connectionLabel").textContent="Login online";$("connectionDetail").textContent=data.user.email;renderAll();toast("Login online berhasil. Data dimuat dari Supabase.");
      }catch(err){$("authNotice").className="notice error";$("authNotice").textContent="Login/sinkronisasi gagal: "+err.message;}
    });
    $("recoveryForm").addEventListener("submit",async e=>{
      e.preventDefault();const password=$("recoveryPassword").value,confirmation=$("recoveryPasswordConfirm").value;
      if(password.length<8){toast("Kata sandi minimal 8 karakter.");return;}if(password!==confirmation){toast("Ulangi kata sandi belum cocok.");return;}
      if(!supabaseClient){toast("Koneksi Supabase belum siap. Periksa URL dan key di pengaturan.");return;}
      try{const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;$("recoveryForm").reset();$("recoveryPanel").classList.add("hidden");$("authNotice").className="notice info";$("authNotice").textContent="Kata sandi berhasil direset. Silakan login menggunakan kata sandi baru.";await supabaseClient.auth.signOut();toast("Kata sandi berhasil diperbarui.");}catch(err){toast("Gagal menyimpan kata sandi: "+err.message);}
    });
    $("forgotPasswordButton").addEventListener("click",async()=>{
      const email=$("loginEmail").value.trim();
      if(!email){$("authNotice").className="notice warning";$("authNotice").textContent="Masukkan email akun terdaftar terlebih dahulu.";$("loginEmail").focus();return;}
      const cfg=getConfig();if(!supabaseClient&&cfg.url&&cfg.key){try{await connectSupabase(cfg.url,cfg.key);}catch(err){$("authNotice").className="notice error";$("authNotice").textContent=err.message;return;}}
      if(!supabaseClient){$("authNotice").className="notice warning";$("authNotice").textContent="Atur koneksi Supabase terlebih dahulu di menu Pengaturan pada mode demo.";return;}
      try{const redirectTo=window.location.origin+window.location.pathname;const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;$("authNotice").className="notice info";$("authNotice").textContent="Jika email terdaftar dan konfigurasi email benar, tautan reset akan dikirim. Periksa inbox dan folder spam.";}catch(err){$("authNotice").className="notice error";$("authNotice").textContent="Permintaan reset gagal: "+err.message;}
    });
    $("changePasswordForm").addEventListener("submit",async e=>{
      e.preventDefault();const password=$("newPassword").value,confirmPassword=$("confirmNewPassword").value;
      if(password.length<8){toast("Kata sandi minimal 8 karakter.");return;}
      if(password!==confirmPassword){toast("Ulangi kata sandi belum cocok.");return;}
      if(demoMode||!supabaseClient){toast("Login dengan akun Supabase terlebih dahulu. Mode demo tidak memiliki kata sandi.");return;}
      try{const {data:{user},error:sessionError}=await supabaseClient.auth.getUser();if(sessionError)throw sessionError;if(!user)throw new Error("Sesi login tidak ditemukan.");const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;$("changePasswordForm").reset();toast("Kata sandi berhasil diubah.");}catch(err){toast("Gagal mengubah kata sandi: "+err.message);}
    });
    $("logoutButton").addEventListener("click",async()=>{if(supabaseClient&&!demoMode){await supabaseClient.auth.signOut();}demoMode=true;showAuth();toast("Kamu sudah keluar dari akun online.");});
    $("dashboardMonth").addEventListener("change",renderDashboard);
    $("bcgPeriod").addEventListener("change",renderBcg);$("bcgSearch").addEventListener("input",renderBcg);document.querySelectorAll("[data-bcg-category]").forEach(b=>b.addEventListener("click",()=>{selectedBcgCategory=selectedBcgCategory===b.dataset.bcgCategory?null:b.dataset.bcgCategory;renderBcg();}));
    $("sampleBcgButton").addEventListener("click",async()=>{const m=$("bcgPeriod").value||monthNow;const demo=seedData().bcg.map(r=>({...r,id:uid(),period:m}));try{await replaceBcgMonth(m,demo);toast("Data contoh BCG dimuat.");}catch(err){toast("Gagal menyimpan data BCG: "+err.message);}});
    $("importBcgButton").addEventListener("click",importBcg);$("exportBcgButton").addEventListener("click",exportBcg);
    $("chatForm").addEventListener("submit",async e=>{e.preventDefault();const date=$("chatDate").value;const id=$("chatEditId").value||uid();try{await upsert("chats",{id,date,count:Number($("chatCount").value),channel:$("chatChannel").value,notes:$("chatNotes").value.trim()});resetChatForm();$("chatMonth").value=date.slice(0,7)||monthNow;renderAll();toast("Catatan chat disimpan.");}catch(e){}});
    $("revenueForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("revenueEditId").value||uid();try{await upsert("revenue",{id,date:$("revenueDate").value,store1:Number($("store1Amount").value),store2:Number($("store2Amount").value),notes:$("revenueNotes").value.trim()});resetRevenueForm();toast("Catatan omzet disimpan.");}catch(e){}});
    $("cancelChatEdit").addEventListener("click",resetChatForm);$("cancelRevenueEdit").addEventListener("click",resetRevenueForm);
    $("chatMonth").addEventListener("change",()=>{showAllChatHistory=false;renderChat();});$("toggleChatHistory").addEventListener("click",()=>{showAllChatHistory=!showAllChatHistory;renderChat();});$("revenueMonth").addEventListener("change",renderRevenue);
    $("chatTableBody").addEventListener("click",async e=>{const edit=e.target.closest("[data-edit-chat]"),del=e.target.closest("[data-delete-chat]");if(edit)setEditChat(edit.dataset.editChat);if(del&&confirm("Hapus catatan chat ini?")){try{await deleteRemoteRow("chats",del.dataset.deleteChat);state.chats=state.chats.filter(r=>r.id!==del.dataset.deleteChat);saveLocal();renderAll();toast("Catatan dihapus.");}catch(err){toast("Gagal menghapus dari Supabase: "+err.message);}}});
    $("revenueTableBody").addEventListener("click",async e=>{const edit=e.target.closest("[data-edit-revenue]"),del=e.target.closest("[data-delete-revenue]");if(edit)setEditRevenue(edit.dataset.editRevenue);if(del&&confirm("Hapus catatan omzet ini?")){try{await deleteRemoteRow("revenue",del.dataset.deleteRevenue);state.revenue=state.revenue.filter(r=>r.id!==del.dataset.deleteRevenue);saveLocal();renderAll();toast("Catatan dihapus.");}catch(err){toast("Gagal menghapus dari Supabase: "+err.message);}}});
    $("exportChatButton").addEventListener("click",()=>{const rows=effectiveChats(monthRows(state.chats,$("chatMonth").value||monthNow));exportCsv("chat-happy-home.csv",[["Tanggal","Jumlah Chat","Kanal","Catatan"],...rows.map(r=>[r.date,r.count,r.channel,r.notes])]);});
    $("exportRevenueButton").addEventListener("click",()=>{const rows=monthRows(state.revenue,$("revenueMonth").value||monthNow);exportCsv("omzet-happy-home.csv",[["Tanggal","Omzet Toko 1","Omzet Toko 2","Total","Catatan"],...rows.map(r=>[r.date,r.store1,r.store2,(+r.store1||0)+(+r.store2||0),r.notes])]);});
    $("supabaseForm").addEventListener("submit",async e=>{e.preventDefault();try{await connectSupabase($("supabaseUrl").value.trim(),$("supabaseKey").value.trim());$("supabaseStatus").textContent="Tersimpan";}catch(err){$("supabaseStatus").textContent="Gagal";toast(err.message);}});
    $("disconnectSupabase").addEventListener("click",()=>{localStorage.removeItem(CONFIG_KEY);supabaseClient=null;$("supabaseUrl").value="";$("supabaseKey").value="";$("supabaseStatus").textContent="Belum terhubung";$("connectionLabel").textContent=demoMode?"Mode demo":"Belum terhubung";toast("Konfigurasi koneksi dihapus dari browser ini.");});
    $("reloadDemo").addEventListener("click",()=>{if(confirm("Muat ulang data contoh? Data lokal saat ini akan diganti.")){state=seedData();saveLocal();renderAll();toast("Data contoh dimuat ulang.");}});
    $("clearLocal").addEventListener("click",()=>{if(confirm("Hapus seluruh data lokal demo di browser ini?")){state={revenue:[],chats:[],bcg:[]};saveLocal();renderAll();toast("Data lokal dihapus.");}});
  }
  function init(){
    loadLocal();
    $("todayLabel").textContent=today.toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
    ["dashboardMonth","bcgPeriod","chatMonth","revenueMonth"].forEach(id=>$(id).value=monthNow);
    $("chatDate").value=localDate(today);$("revenueDate").value=localDate(today);
    const cfg=getConfig();$("supabaseUrl").value=cfg.url||"";$("supabaseKey").value=cfg.key||"";
    if(cfg.url&&cfg.key){$("configHint").textContent="Konfigurasi Supabase ditemukan di browser ini.";connectSupabase(cfg.url,cfg.key).catch(err=>{$("configHint").textContent="Koneksi belum siap: "+err.message;});}
    bindEvents();renderAll();
    // Always begin at authentication screen; demo access is an explicit user action.
    showAuth();
  }
  document.addEventListener("DOMContentLoaded",init);
})();