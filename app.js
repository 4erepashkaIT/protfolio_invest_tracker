// ════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════
const CRYPTOS = [
  {id:'bitcoin',      sym:'BTC',  name:'Bitcoin'},
  {id:'ethereum',     sym:'ETH',  name:'Ethereum'},
  {id:'tether',       sym:'USDT', name:'Tether'},
  {id:'solana',       sym:'SOL',  name:'Solana'},
  {id:'binancecoin',  sym:'BNB',  name:'BNB'},
  {id:'ripple',       sym:'XRP',  name:'XRP'},
  {id:'the-open-network', sym:'TON', name:'Toncoin'},
  {id:'dogecoin',     sym:'DOGE', name:'Dogecoin'},
  {id:'cardano',      sym:'ADA',  name:'Cardano'},
  {id:'avalanche-2',  sym:'AVAX', name:'Avalanche'},
  {id:'polkadot',     sym:'DOT',  name:'Polkadot'},
  {id:'chainlink',    sym:'LINK', name:'Chainlink'},
  {id:'uniswap',      sym:'UNI',  name:'Uniswap'},
  {id:'litecoin',     sym:'LTC',  name:'Litecoin'},
  {id:'shiba-inu',    sym:'SHIB', name:'Shiba Inu'},
  {id:'pepe',         sym:'PEPE', name:'Pepe'},
  {id:'sui',          sym:'SUI',  name:'Sui'},
  {id:'tron',         sym:'TRX',  name:'TRON'},
  {id:'stellar',      sym:'XLM',  name:'Stellar'},
  {id:'not',          sym:'NOT',  name:'Notcoin'},
];

const CASHES = [
  {sym:'RUB', name:'Российский рубль'},
  {sym:'USD', name:'Доллар США'},
  {sym:'EUR', name:'Евро'},
  {sym:'CNY', name:'Китайский юань'},
  {sym:'GBP', name:'Фунт стерлингов'},
  {sym:'AED', name:'Дирхам ОАЭ'},
  {sym:'TRY', name:'Турецкая лира'},
  {sym:'KZT', name:'Тенге'},
  {sym:'BYN', name:'Белорусский рубль'},
];

const COLORS = ['#C40361','#8C0286','#6E022F','#d972ff','#f59e0b','#7b86f5','#22d3a4','#ff4f77','#facc15','#c084fc','#38bdf8','#a3e635'];

// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
const S = {
  txs:    [],          // transactions
  prices: {},          // {SYM: {usd, ch24, ts}}
  usdRub: null,
  tab:    'pf',
  anaPeriod: 6,
  form: {op:'buy', type:'crypto', sym:'', name:'', geckoId:''},
};
const charts = {};

// ════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════
function load() {
  try {
    const t = localStorage.getItem('ptx_tx');    if (t) S.txs    = JSON.parse(t);
    const p = localStorage.getItem('ptx_prices');if (p) S.prices = JSON.parse(p);
    const r = localStorage.getItem('ptx_usdRub');if (r) S.usdRub = +r;
  } catch(e){}
}
function saveTx()     { localStorage.setItem('ptx_tx', JSON.stringify(S.txs)); }
function savePrices() {
  localStorage.setItem('ptx_prices', JSON.stringify(S.prices));
  if (S.usdRub) localStorage.setItem('ptx_usdRub', S.usdRub);
}

// ════════════════════════════════════════════
//  PRICE FETCHING
// ════════════════════════════════════════════
function ftch(url, ms=9000) {
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(), ms);
  return fetch(url, {signal:c.signal}).finally(()=>clearTimeout(t));
}

let busy = false;
async function doRefresh() {
  if (busy) return;
  busy = true;
  setStatus('…','Обновление...');
  document.getElementById('refreshBtn').innerHTML = '<div class="spin"></div>';
  try {
    await Promise.allSettled([fetchCrypto(), fetchStocks(), fetchRates()]);
    savePrices();
    setStatus('live','Актуально');
    render();
    toast('Цены обновлены ✓');
  } catch(e){ setStatus('','Ошибка'); }
  document.getElementById('refreshBtn').innerHTML = '↻';
  busy = false;
}

async function fetchCrypto() {
  const ids = [...new Set(S.txs.filter(t=>t.type==='crypto').map(t=>t.geckoId).filter(Boolean))];
  if (!ids.length) return;
  const r = await ftch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
  const d = await r.json();
  for (const [id, v] of Object.entries(d)) {
    const coin = CRYPTOS.find(c=>c.id===id);
    const sym  = coin ? coin.sym : id.toUpperCase();
    S.prices[sym] = {usd: v.usd, ch24: v.usd_24h_change||0, ts: Date.now()};
  }
}

async function fetchStocks() {
  const syms = [...new Set(S.txs.filter(t=>t.type==='stock').map(t=>t.sym))];
  for (const s of syms) {
    try {
      const r = await ftch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=1d`);
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        const prev = meta.previousClose||meta.regularMarketPrice;
        S.prices[s] = {usd: meta.regularMarketPrice, ch24: ((meta.regularMarketPrice-prev)/prev)*100, ts: Date.now()};
      }
    } catch {
      if (!S.prices[s]) S.prices[s] = {usd:null, ch24:0, ts:0};
    }
  }
}

async function fetchRates() {
  const r = await ftch('https://api.exchangerate-api.com/v4/latest/USD');
  const d = await r.json();
  S.usdRub = d.rates.RUB;
  // Currency prices as USD equivalent of 1 unit
  const syms = [...new Set(S.txs.filter(t=>t.type==='cash').map(t=>t.sym))];
  for (const sym of syms) {
    if (sym === 'RUB') {
      S.prices['RUB'] = {usd: 1/S.usdRub, ch24:0, ts: Date.now()};
    } else {
      const rate = d.rates[sym];
      if (rate) S.prices[sym] = {usd: 1/rate, ch24:0, ts: Date.now()};
    }
  }
}

function setStatus(mode, txt) {
  const dot = document.getElementById('sDot');
  dot.className = 'dot' + (mode==='live'?' live':'');
  document.getElementById('sTxt').textContent = txt;
}

// ════════════════════════════════════════════
//  CALCULATIONS
// ════════════════════════════════════════════
function calcHoldings() {
  const sorted = [...S.txs].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const map = {};
  const rub = S.usdRub || 90;
  for (const tx of sorted) {
    if (!map[tx.sym]) map[tx.sym] = {sym:tx.sym, name:tx.name, type:tx.type, geckoId:tx.geckoId||null, qty:0, costUsd:0, costRub:0};
    const h = map[tx.sym];
    if (tx.op==='buy') {
      h.qty += tx.qty;
      h.costUsd += tx.qty * tx.priceUsd;
      // For cash: accumulate RUB cost basis (stored priceRub, or fall back to priceUsd * current rate)
      if (tx.type === 'cash') h.costRub += tx.qty * (tx.priceRub ?? tx.priceUsd * rub);
    } else {
      const avg = h.qty>0 ? h.costUsd/h.qty : 0;
      const avgRub = h.qty>0 && h.costRub>0 ? h.costRub/h.qty : 0;
      h.qty -= tx.qty;
      h.costUsd -= avg * tx.qty;
      h.costRub -= avgRub * tx.qty;
      if (h.qty<1e-9){ h.qty=0; h.costUsd=0; h.costRub=0; }
    }
  }
  return Object.values(map)
    .filter(h=>h.qty>1e-9)
    .map(h=>{
      const pi  = S.prices[h.sym];
      const cup = pi?.usd ?? null;
      const cvu = cup!==null ? h.qty*cup : null;
      const cvR = cvu!==null ? cvu*rub : null;

      let pnlR, pnlU, pct, costR;
      if (h.type === 'cash' && h.costRub > 0 && cvR !== null) {
        // P&L in RUB for cash assets (correct: compares historical RUB cost vs current RUB value)
        costR = h.costRub;
        pnlR  = cvR - costR;
        pct   = (pnlR / costR) * 100;
        pnlU  = pnlR / rub;
      } else {
        costR = h.costUsd * rub;
        pnlU  = cvu!==null ? cvu-h.costUsd : null;
        pct   = h.costUsd>0 && pnlU!==null ? (pnlU/h.costUsd)*100 : null;
        pnlR  = pnlU!==null ? pnlU*rub : null;
      }

      const avgRub = h.costRub>0 && h.qty>0 ? h.costRub/h.qty : null;
      return {...h, avgUsd: h.qty>0?h.costUsd/h.qty:0, avgRub, cup, cvu, cvR, costR, pnlU, pnlR, pct, ch24: pi?.ch24||0};
    })
    .sort((a,b)=>(b.cvu??0)-(a.cvu??0));
}

function calcStats(hs) {
  const rub = S.usdRub||90;
  let valR=0, costR_total=0;
  for (const h of hs){ if (h.cvR!==null) valR+=h.cvR; costR_total+=h.costR; }
  const pnlR = valR - costR_total;
  const pct  = costR_total>0 ? (pnlR/costR_total)*100 : 0;
  return {valR, valU:valR/rub, costR:costR_total, pnlR, pnlU:pnlR/rub, pct, rub};
}

// ════════════════════════════════════════════
//  FORMAT
// ════════════════════════════════════════════
const R = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
const fR = n => n==null?'—':R.format(n);
const fU = (n,d=2) => n==null?'—':'$'+(+n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fP = n => n==null?'—':(n>=0?'+':'')+n.toFixed(2)+'%';
const fQ = (n,s) => { if(n==null)return'—'; const d=n<0.01?6:n<1?4:2; return n.toFixed(d)+' '+s; };
const cls = n => n==null?'neu':n>0?'gain':n<0?'loss':'neu';
const fDate = s => { const d=new Date(s); return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}); };

// ════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════
function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on', b.dataset.tab===tab));
  render();
}

// ════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════
function render() {
  const hs    = calcHoldings();
  const stats = calcStats(hs);
  renderHeader(stats);

  const el = document.getElementById('content');
  if      (S.tab==='pf')  el.innerHTML = renderPf(hs, stats);
  else if (S.tab==='ast') el.innerHTML = renderAst(hs);
  else if (S.tab==='tx')  el.innerHTML = renderTx();
  else if (S.tab==='ana') el.innerHTML = renderAna(hs, stats);

  setTimeout(()=>{
    if (S.tab==='pf')  drawPfCharts(hs);
    if (S.tab==='ana') drawAnaCharts(hs, stats);
  }, 0);
}

function renderHeader(st) {
  document.getElementById('hdrVal').textContent = fR(st.valR);
  const el = document.getElementById('hdrPnl');
  const c  = cls(st.pnlR);
  el.className = 'pf-pnl ' + c;
  el.textContent = (st.pct>=0?'▲ +':'▼ ') + fR(Math.abs(st.pnlR)) + ' · ' + fP(st.pct);
}

// ─── PORTFOLIO TAB ───
function renderPf(hs, st) {
  if (!hs.length) return empty('📊','Портфель пуст','Добавьте первую сделку кнопкой ＋');

  const statCards = `<div class="stat-grid">
    <div class="sc"><div class="sc-lbl">Вложено</div><div class="sc-val">${fR(st.costR)}</div></div>
    <div class="sc"><div class="sc-lbl">Сейчас стоит</div><div class="sc-val">${fR(st.valR)}</div></div>
    <div class="sc"><div class="sc-lbl">Прибыль / убыток</div><div class="sc-val ${cls(st.pnlR)}">${st.pnlR>=0?'+':''}${fR(st.pnlR)}</div></div>
    <div class="sc"><div class="sc-lbl">Доходность</div><div class="sc-val ${cls(st.pct)}">${fP(st.pct)}</div></div>
  </div>`;

  // Type allocation bar
  const byType = {crypto:0, stock:0, cash:0};
  hs.forEach(h=>{ if(h.cvu!==null) byType[h.type]=(byType[h.type]||0)+h.cvu; });
  const tot = Object.values(byType).reduce((a,b)=>a+b,0)||1;
  const tColors = {crypto:'var(--crypto)',stock:'var(--stock)',cash:'var(--cash)'};
  const tNames  = {crypto:'Крипта',stock:'Акции/ETF',cash:'Валюта'};
  const bar = Object.entries(byType).filter(([,v])=>v>0)
    .map(([k,v])=>`<div class="alloc-seg" style="width:${(v/tot*100).toFixed(1)}%;background:${tColors[k]}"></div>`).join('');
  const leg = Object.entries(byType).filter(([,v])=>v>0)
    .map(([k,v])=>`<div class="al-item"><div class="al-dot" style="background:${tColors[k]}"></div>${tNames[k]}<span style="color:var(--text3);font-family:var(--mono);font-size:10px">${(v/tot*100).toFixed(1)}%</span></div>`).join('');

  const allocCard = `<div class="card"><div class="card-ttl">По типу активов</div>
    <div class="alloc-bar">${bar}</div><div class="alloc-leg">${leg}</div></div>`;

  const donutCard = `<div class="card"><div class="card-ttl">Структура портфеля</div>
    <div class="chart-wrap"><canvas id="donutC"></canvas></div></div>`;

  const topRows = hs.slice(0,8).map(h=>`
    <div class="asset-row">
      <div class="ai ${h.type}">${h.sym.slice(0,3)}</div>
      <div class="ai-info"><div class="ai-name">${h.name}</div>
        <div class="ai-sub">${fQ(h.qty,h.sym)} · ${fU(h.cup)}</div></div>
      <div class="ai-r"><div class="ai-val">${fR(h.cvR)}</div>
        <div class="ai-pnl ${cls(h.pct)}">${fP(h.pct)}</div></div>
    </div>`).join('');

  const topCard = `<div class="card"><div class="card-ttl">Позиции</div>${topRows}</div>`;

  return statCards
    + `<div class="pf-grid">${allocCard}${donutCard}</div>`
    + topCard;
}

function drawPfCharts(hs) {
  if (charts.donut) { charts.donut.destroy(); charts.donut=null; }
  const c = document.getElementById('donutC');
  if (!c||!hs.length) return;
  const top = hs.slice(0,10);
  charts.donut = new Chart(c, {
    type:'doughnut',
    data:{
      labels: top.map(h=>h.sym),
      datasets:[{data: top.map(h=>h.cvu??0), backgroundColor: top.map((_,i)=>COLORS[i%COLORS.length]), borderWidth:0, hoverOffset:4}]
    },
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',
      plugins:{
        legend:{position:'right',labels:{color:'#c6a8e6',font:{family:'JetBrains Mono',size:11},padding:10,boxWidth:10,usePointStyle:true}},
        tooltip:{
          backgroundColor:'#1a0433',borderColor:'rgba(196,3,97,.45)',borderWidth:1,
          titleColor:'#f4eaff',bodyColor:'#c6a8e6',padding:12,cornerRadius:10,
          callbacks:{label:ctx=>` ${fR((ctx.parsed??0)*(S.usdRub||90))}`},bodyFont:{family:'JetBrains Mono'}
        }
      }}
  });
}

// ─── ASSETS TAB ───
function renderAst(hs) {
  if (!hs.length) return empty('💼','Нет активов','Добавьте сделки для отображения активов');
  const rows = hs.map(h=>`
    <div class="asset-row">
      <div class="ai ${h.type}">${h.sym.slice(0,3)}</div>
      <div class="ai-info"><div class="ai-name">${h.name}</div>
        <div class="ai-sub">${fQ(h.qty,h.sym)} · ср. ${h.type==='cash'&&h.avgRub!=null?fR(h.avgRub):fU(h.avgUsd)}
          ${h.ch24?' · <span style="color:'+( h.ch24>=0?'var(--gain)':'var(--loss)')+'">'+fP(h.ch24)+' 24ч</span>':''}
        </div></div>
      <div class="ai-r"><div class="ai-val">${fR(h.cvR)}</div>
        <div class="ai-pnl ${cls(h.pnlR)}">${h.pnlR!=null?(h.pnlR>=0?'+':'')+fR(h.pnlR):''} ${fP(h.pct)}</div></div>
    </div>`).join('');
  return `<div class="card">${rows}</div>`;
}

// ─── TRANSACTIONS TAB ───
function renderTx() {
  if (!S.txs.length) return empty('📋','Нет сделок','Добавьте первую сделку кнопкой ＋');
  const sorted = [...S.txs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const groups = {};
  sorted.forEach(tx=>{ (groups[tx.date]=groups[tx.date]||[]).push(tx); });

  return Object.entries(groups).map(([date,txs])=>`
    <div class="tx-date-label">${fDate(date)}</div>
    <div class="card" style="padding:6px 12px">
      ${txs.map(tx=>`
        <div class="tx-row">
          <div class="tx-badge ${tx.op}">${tx.op==='buy'?'↑':'↓'}</div>
          <div class="tx-info">
            <div class="tx-nm">${tx.name} <span style="color:var(--text3);font-size:10px">${tx.sym}</span></div>
            <div class="tx-dt">${tx.op==='buy'?'Куплено':'Продано'} · ${fU(tx.priceUsd)} / шт.</div>
          </div>
          <div class="tx-amt">
            <div class="tx-v" style="color:var(--${tx.op==='buy'?'loss':'gain'})">${tx.op==='buy'?'-':'+'}${fR(tx.qty*tx.priceUsd*(S.usdRub||90))}</div>
            <div class="tx-q">${fQ(tx.qty,tx.sym)}</div>
          </div>
          <button class="tx-del" onclick="delTx('${tx.id}')">×</button>
        </div>`).join('')}
    </div>`).join('');
}

// ─── PORTFOLIO DYNAMICS ───
function calcPortfolioHistory(periodMonths) {
  if (!S.txs.length) return { labels: [], values: [], pct: null };
  const rub = S.usdRub || 90;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const periodMs = periodMonths * 30 * 24 * 60 * 60 * 1000;
  const periodStart = new Date(now.getTime() - periodMs);
  const sorted = [...S.txs].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstDate = new Date(sorted[0].date);
  const effectiveStart = firstDate > periodStart ? firstDate : periodStart;

  // Price timeline per asset: transaction prices + current price as endpoints
  const assetPrices = {};
  for (const tx of sorted) {
    if (!assetPrices[tx.sym]) assetPrices[tx.sym] = [];
    const txDate = new Date(tx.date);
    if (!assetPrices[tx.sym].find(p => p.date.getTime() === txDate.getTime()))
      assetPrices[tx.sym].push({ date: txDate, price: tx.priceUsd });
  }
  for (const sym of Object.keys(assetPrices)) {
    if (S.prices[sym]?.usd) assetPrices[sym].push({ date: new Date(now), price: S.prices[sym].usd });
    assetPrices[sym].sort((a, b) => a.date - b.date);
  }

  function getPriceAt(sym, date) {
    const prices = assetPrices[sym];
    if (!prices?.length) return null;
    let prev = null;
    for (const p of prices) {
      if (p.date <= date) { prev = p; continue; }
      if (!prev) return p.price;
      const t = (date - prev.date) / (p.date - prev.date);
      return prev.price + t * (p.price - prev.price);
    }
    return prev?.price ?? null;
  }

  function getValueAt(date) {
    const holdings = {};
    for (const tx of sorted) {
      if (new Date(tx.date) > date) break;
      if (!holdings[tx.sym]) holdings[tx.sym] = 0;
      holdings[tx.sym] += tx.op === 'buy' ? tx.qty : -tx.qty;
    }
    let val = 0;
    for (const [sym, qty] of Object.entries(holdings)) {
      if (qty <= 1e-9) continue;
      const price = getPriceAt(sym, date);
      if (price !== null) val += qty * price * rub;
    }
    return val;
  }

  const totalDays = Math.ceil((now - effectiveStart) / (24 * 60 * 60 * 1000));
  const step = Math.max(1, Math.floor(totalDays / 60));
  const labels = [], values = [];

  for (let i = 0; i <= totalDays; i += step) {
    const date = new Date(effectiveStart.getTime() + i * 24 * 60 * 60 * 1000);
    if (date > now) break;
    labels.push(date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }));
    values.push(Math.round(getValueAt(date)));
  }
  const todayLbl = now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  if (labels[labels.length - 1] !== todayLbl) {
    labels.push(todayLbl);
    values.push(Math.round(getValueAt(now)));
  }

  const firstNonZero = values.find(v => v > 0) || 0;
  const lastVal = values[values.length - 1] || 0;
  const pct = firstNonZero > 0 ? ((lastVal - firstNonZero) / firstNonZero) * 100 : null;
  return { labels, values, pct };
}

function setAnaPeriod(m) {
  S.anaPeriod = m;
  render();
}

// ─── ANALYTICS TAB ───
function renderAna(hs, st) {
  if (!hs.length) return empty('📈','Нет данных','Добавьте сделки для аналитики');
  const sorted = [...hs].filter(h=>h.pct!==null);
  const best   = sorted.length ? [...sorted].sort((a,b)=>b.pct-a.pct)[0] : null;
  const worst  = sorted.length ? [...sorted].sort((a,b)=>a.pct-b.pct)[0] : null;
  const txBuys = S.txs.filter(t=>t.op==='buy').reduce((s,t)=>s+t.qty*t.priceUsd,0)*(S.usdRub||90);

  const metrics = `<div class="ana-grid">
    <div class="mc"><div class="mc-lbl">Лучшая позиция</div>
      <div class="mc-val gain">${best?.sym??'—'}</div>
      <div class="mc-sub">${fP(best?.pct)}</div></div>
    <div class="mc"><div class="mc-lbl">Худшая позиция</div>
      <div class="mc-val loss">${worst?.sym??'—'}</div>
      <div class="mc-sub">${fP(worst?.pct)}</div></div>
    <div class="mc"><div class="mc-lbl">Позиций</div>
      <div class="mc-val acc">${hs.length}</div>
      <div class="mc-sub">${S.txs.length} сделок</div></div>
    <div class="mc"><div class="mc-lbl">Общий ROI</div>
      <div class="mc-val ${cls(st.pct)}">${fP(st.pct)}</div>
      <div class="mc-sub">${st.rub?'1 USD = '+st.rub.toFixed(2)+' ₽':'—'}</div></div>
    <div class="mc"><div class="mc-lbl">Инвестировано</div>
      <div class="mc-val">${fR(st.costR)}</div></div>
    <div class="mc"><div class="mc-lbl">Всего вложено</div>
      <div class="mc-val">${fR(txBuys)}</div>
      <div class="mc-sub">сумма покупок</div></div>
  </div>`;

  const periods = [1, 3, 6, 12];
  const dynCard = `<div class="card">
    <div class="card-ttl" style="justify-content:space-between">
      Динамика портфеля
      <div style="display:flex;gap:6px">
        ${periods.map(m=>`<button class="period-btn${S.anaPeriod===m?' on':''}" onclick="setAnaPeriod(${m})">${m===12?'1Y':m+'M'}</button>`).join('')}
      </div>
    </div>
    <div id="dynPct" class="dyn-pct">—</div>
    <div id="dynPeriodLbl" class="dyn-period-lbl"></div>
    <div class="chart-wrap" style="height:280px"><canvas id="dynC"></canvas></div>
  </div>`;

  const barCard = `<div class="card"><div class="card-ttl">P&L по активам</div>
    <div class="chart-wrap"><canvas id="barC"></canvas></div></div>`;
  const pieCard = `<div class="card"><div class="card-ttl">Доля в портфеле</div>
    <div class="chart-wrap"><canvas id="pieC"></canvas></div></div>`;

  return metrics + dynCard + barCard + pieCard;
}

function drawDynChart() {
  if (charts.dyn) { charts.dyn.destroy(); charts.dyn = null; }
  const c = document.getElementById('dynC');
  if (!c) return;

  const { labels, values, pct } = calcPortfolioHistory(S.anaPeriod);

  const pctEl = document.getElementById('dynPct');
  const lblEl = document.getElementById('dynPeriodLbl');
  if (pctEl) {
    if (pct !== null) {
      pctEl.className = 'dyn-pct' + (pct >= 0 ? '' : ' loss');
      pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2).replace('.', ',') + '%';
    } else {
      pctEl.className = 'dyn-pct';
      pctEl.textContent = '—';
    }
  }
  if (lblEl) {
    const lbl = { 1:'за 1 месяц', 3:'за 3 месяца', 6:'за 6 месяцев', 12:'за год' }[S.anaPeriod] || '';
    lblEl.textContent = lbl;
  }
  if (!values.length) return;

  charts.dyn = new Chart(c, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#7b86f5',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#7b86f5',
        tension: 0.4,
        fill: true,
        backgroundColor: ctx => {
          const grad = ctx.chart.canvas.getContext('2d').createLinearGradient(0, 0, 0, ctx.chart.canvas.height);
          grad.addColorStop(0, 'rgba(123,134,245,0.45)');
          grad.addColorStop(1, 'rgba(123,134,245,0.02)');
          return grad;
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a0433', borderColor: 'rgba(196,3,97,.45)', borderWidth: 1,
          titleColor: '#f4eaff', bodyColor: '#c6a8e6', padding: 12, cornerRadius: 10,
          callbacks: { label: ctx => ` ${fR(ctx.parsed.y)}` },
          bodyFont: { family: 'JetBrains Mono' }
        }
      },
      scales: {
        x: { ticks: { color: '#c6a8e6', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(140,2,134,.12)' } },
        y: { ticks: { color: '#c6a8e6', font: { family: 'JetBrains Mono', size: 10 }, callback: v => fR(v) }, grid: { color: 'rgba(140,2,134,.12)' } }
      }
    }
  });
}

function drawAnaCharts(hs, st) {
  ['bar','pie','dyn'].forEach(k=>{ if(charts[k]){charts[k].destroy();charts[k]=null;} });
  drawDynChart();

  const bar = document.getElementById('barC');
  if (bar && hs.length) {
    const srt = [...hs].sort((a,b)=>(b.pnlR??0)-(a.pnlR??0));
    charts.bar = new Chart(bar, {
      type:'bar',
      data:{labels:srt.map(h=>h.sym), datasets:[{
        data: srt.map(h=>h.pnlR??0),
        backgroundColor: srt.map(h=>(h.pnlR??0)>=0?'rgba(34,211,164,.55)':'rgba(255,79,119,.55)'),
        borderColor:      srt.map(h=>(h.pnlR??0)>=0?'#22d3a4':'#ff4f77'),
        borderWidth:1, borderRadius:6
      }]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'#1a0433',borderColor:'rgba(196,3,97,.45)',borderWidth:1,
            titleColor:'#f4eaff',bodyColor:'#c6a8e6',padding:12,cornerRadius:10,
            callbacks:{label:ctx=>` ${fR(ctx.parsed.y)}`},bodyFont:{family:'JetBrains Mono'}
          }
        },
        scales:{
          x:{ticks:{color:'#c6a8e6',font:{family:'JetBrains Mono',size:11}},grid:{color:'rgba(140,2,134,.18)'}},
          y:{ticks:{color:'#c6a8e6',font:{family:'JetBrains Mono',size:11},callback:v=>fR(v)},grid:{color:'rgba(140,2,134,.18)'}}
        }}
    });
  }

  const pie = document.getElementById('pieC');
  if (pie && hs.length) {
    charts.pie = new Chart(pie, {
      type:'doughnut',
      data:{labels:hs.map(h=>h.sym), datasets:[{
        data: hs.map(h=>Math.max(0,h.cvR??0)),
        backgroundColor: hs.map((_,i)=>COLORS[i%COLORS.length]),
        borderWidth:0
      }]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'66%',
        plugins:{
          legend:{position:'right',labels:{color:'#c6a8e6',font:{family:'JetBrains Mono',size:11},boxWidth:10,padding:10,usePointStyle:true}},
          tooltip:{
            backgroundColor:'#1a0433',borderColor:'rgba(196,3,97,.45)',borderWidth:1,
            titleColor:'#f4eaff',bodyColor:'#c6a8e6',padding:12,cornerRadius:10,
            callbacks:{label:ctx=>` ${fR(ctx.parsed)}`},bodyFont:{family:'JetBrains Mono'}
          }
        }}
    });
  }
}

function empty(ico,ttl,txt) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-ttl">${ttl}</div><div class="empty-txt">${txt}</div></div>`;
}

// ════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════
function openModal() {
  const ov = document.getElementById('overlay');
  ov.style.display = 'flex';
  requestAnimationFrame(()=>ov.classList.add('open'));
  document.getElementById('txDate').value = new Date().toISOString().slice(0,10);
  resetForm();
}
function closeModal() {
  const ov = document.getElementById('overlay');
  ov.classList.remove('open');
  setTimeout(()=>ov.style.display='none', 300);
}
function overlayClick(e) { if (e.target===document.getElementById('overlay')) closeModal(); }

function resetForm() {
  selOp('buy'); selType('crypto');
  ['txQty','txPrice'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('txTotal').textContent='0.00';
  document.getElementById('cryptoSel').value='';
  document.getElementById('stockIn').value='';
  document.getElementById('cashSel').value='';
  S.form.sym=''; S.form.name=''; S.form.geckoId='';
}

function selOp(op) {
  S.form.op = op;
  document.getElementById('btn-buy').className  = 'tb' + (op==='buy' ?' on-buy':'');
  document.getElementById('btn-sell').className = 'tb' + (op==='sell'?' on-sell':'');
}

function selType(type) {
  S.form.type = type;
  ['crypto','stock','cash'].forEach(t=>document.getElementById('btn-'+t).className='tb'+(t===type?' on-'+t:''));
  document.getElementById('cryptoSel').style.display = type==='crypto'?'block':'none';
  document.getElementById('stockIn').style.display   = type==='stock'?'block':'none';
  document.getElementById('cashSel').style.display   = type==='cash'?'block':'none';
  document.getElementById('assetLbl').textContent = type==='crypto'?'Криптовалюта':type==='stock'?'Тикер (Yahoo Finance)':'Валюта';
  const isCash = type === 'cash';
  document.getElementById('priceLbl').textContent = isCash ? 'Цена (₽)' : 'Цена (USD)';
  const totalLbl = document.getElementById('txTotalLbl');
  if (totalLbl) totalLbl.textContent = isCash ? 'Итого (₽)' : 'Итого (USD)';
  S.form.sym=''; S.form.name=''; S.form.geckoId='';
  document.getElementById('txPrice').value='';
  calcTotal();
}

function onCryptoPick() {
  const v = document.getElementById('cryptoSel').value;
  const c = CRYPTOS.find(x=>x.id===v);
  if (c) {
    S.form.sym=c.sym; S.form.name=c.name; S.form.geckoId=c.id;
    const p = S.prices[c.sym]?.usd;
    if (p) { document.getElementById('txPrice').value=p.toFixed(p>10?2:6); calcTotal(); }
  }
}

function onStockType() {
  const v = document.getElementById('stockIn').value.trim().toUpperCase();
  S.form.sym=v; S.form.name=v; S.form.geckoId=null;
  const p = S.prices[v]?.usd;
  if (p) { document.getElementById('txPrice').value=p.toFixed(2); calcTotal(); }
}

function onCashPick() {
  const v = document.getElementById('cashSel').value;
  const c = CASHES.find(x=>x.sym===v);
  if (c) {
    S.form.sym=c.sym; S.form.name=c.name; S.form.geckoId=null;
    // Show price in RUB: usd_price * usdRub rate
    const usdPrice = S.prices[c.sym]?.usd;
    if (usdPrice) {
      const rubPrice = c.sym === 'RUB' ? 1 : usdPrice * (S.usdRub || 90);
      document.getElementById('txPrice').value = rubPrice.toFixed(2);
      calcTotal();
    }
  }
}

function calcTotal() {
  const q = parseFloat(document.getElementById('txQty').value)||0;
  const p = parseFloat(document.getElementById('txPrice').value)||0;
  document.getElementById('txTotal').textContent = (q*p).toFixed(2);
}

function submitTx(e) {
  e.preventDefault();
  const {op, type, sym, name, geckoId} = S.form;
  if (!sym) { toast('Выберите актив ⚠️'); return; }
  const qty      = parseFloat(document.getElementById('txQty').value);
  const priceRaw = parseFloat(document.getElementById('txPrice').value);
  const date     = document.getElementById('txDate').value;
  if (!qty||qty<=0)      { toast('Введите количество ⚠️'); return; }
  if (!priceRaw||priceRaw<=0){ toast('Введите цену ⚠️'); return; }
  if (!date)              { toast('Выберите дату ⚠️'); return; }

  // For cash, user enters price in RUB; convert to USD for internal storage
  const isCash   = type === 'cash';
  const priceRub = isCash ? priceRaw : null;
  const priceUsd = isCash ? priceRaw / (S.usdRub || 90) : priceRaw;

  const tx = {
    id: Date.now().toString(36)+Math.random().toString(36).slice(2),
    op, type, sym, name, geckoId, qty, priceUsd, priceRub, date
  };
  S.txs.push(tx);
  saveTx();

  // Cache price if not present
  if (!S.prices[sym]) S.prices[sym]={usd:priceUsd, ch24:0, ts:0};

  closeModal();
  render();
  toast('Сделка добавлена ✓');

  // Fetch fresh prices for newly added asset
  setTimeout(doRefresh, 300);
}

function delTx(id) {
  if (!confirm('Удалить эту сделку?')) return;
  S.txs = S.txs.filter(t=>t.id!==id);
  saveTx();
  render();
  toast('Сделка удалена');
}

// ════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════
function doExport() {
  if (!S.txs.length) { toast('Нет данных для экспорта'); return; }
  const sorted = [...S.txs].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const hdr  = 'Дата,Операция,Тип,Символ,Название,Количество,Цена USD,Сумма USD,Сумма RUB\n';
  const rows = sorted.map(t=>{
    const sumU = t.qty*t.priceUsd;
    const sumR = sumU*(S.usdRub||90);
    return `${t.date},${t.op==='buy'?'Купля':'Продажа'},${t.type},${t.sym},${t.name},${t.qty},${t.priceUsd},${sumU.toFixed(2)},${sumR.toFixed(0)}`;
  }).join('\n');
  const blob = new Blob(['\ufeff'+hdr+rows], {type:'text/csv;charset=utf-8;'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`ptx_${new Date().toISOString().slice(0,10)}.csv`});
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV экспортирован ✓');
}

//  TOAST
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), 2400);
}

//  INIT
function initSelects() {
  const cs = document.getElementById('cryptoSel');
  cs.innerHTML = '<option value="">— выберите —</option>' + CRYPTOS.map(c=>`<option value="${c.id}">${c.name} (${c.sym})</option>`).join('');
  const ch = document.getElementById('cashSel');
  ch.innerHTML = '<option value="">— выберите —</option>' + CASHES.map(c=>`<option value="${c.sym}">${c.name} (${c.sym})</option>`).join('');
}

async function init() {
  load();
  initSelects();
  render();
  setStatus('','—');

  // If we have transactions and prices are stale (>5 min) — refresh
  const lastTs = Math.max(...Object.values(S.prices).map(p=>p.ts||0), 0);
  if (S.txs.length && Date.now()-lastTs > 5*60*1000) {
    await doRefresh();
  } else if (S.txs.length) {
    setStatus('live','Актуально');
  } else {
    setStatus('','Добавьте первую сделку');
  }
}

init();
