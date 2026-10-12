/* yogurt-routes v1 — OPW path A. No invented prices. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    data: null,
    list: [],
    districtId: 'cwb',
  };

  const ROUTE_META = {
    high: { kind: '高價路線', cls: 'hi', blurb: '同覆蓋下估計總價較高（通常較貴品牌／門市）' },
    mid: { kind: '中價路線', cls: 'mid', blurb: '介乎高低之間的折衷總價' },
    low: { kind: '低價路線', cls: 'lo', blurb: '在可覆蓋材料中估計總價較低' },
    near: { kind: '方便路線', cls: 'near', blurb: '優先較近門市，兼顧覆蓋與價格' },
  };

  function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(bLat - aLat);
    const dLng = toR(bLng - aLng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function roleById(id) {
    return (state.data.roles || []).find((r) => r.id === id);
  }
  function gapById(id) {
    return (state.data.gaps || []).find((g) => g.id === id);
  }

  function preferProduct(products, roleId) {
    if (!products || !products.length) return null;
    // Prefer ~1L milk packs for yogurt making
    if (roleId === 'milk_fresh' || roleId === 'milk_lowfat') {
      const scored = products.map((p) => {
        let s = 0;
        const n = p.name || '';
        if (/1\.?5\s*公升|1\.5L|1500/i.test(n)) s += 3;
        else if (/1\s*公升|1L|946|950|908/i.test(n)) s += 5;
        else if (/500|475|400/i.test(n)) s += 1;
        else if (/236|200|250/i.test(n)) s -= 2;
        if (/鮮牛奶|全脂|純鮮奶|純牛奶|希臘|純乳酪|原味|天然/.test(n)) s += 2;
        if (/朱古力|香蕉|芒果|木瓜/.test(n)) s -= 5;
        return { p, s };
      });
      scored.sort((a, b) => b.s - a.s || a.p.minPrice - b.p.minPrice);
      return scored[0].p;
    }
    if (roleId === 'yogurt_plain') {
      const scored = products.map((p) => {
        let s = 0;
        const n = p.name || '';
        if (/希臘/.test(n)) s += 3;
        if (/純乳酪|原味|天然/.test(n)) s += 2;
        if (/1\s*公斤|500|475|450/.test(n)) s += 2;
        if (/130|100/.test(n)) s -= 1;
        return { p, s };
      });
      scored.sort((a, b) => b.s - a.s || a.p.minPrice - b.p.minPrice);
      return scored[0].p;
    }
    // default: cheapest median-ish — pick minPrice product
    return [...products].sort((a, b) => a.minPrice - b.minPrice)[0];
  }

  function priceAtChain(product, chain) {
    if (!product) return null;
    const hit = (product.prices || []).find((p) => p.supermarketCode === chain);
    return hit ? hit.price : null;
  }

  /** Build basket options per chain and multi-store combos */
  function buildCandidates(userLat, userLng) {
    const chains = ['PARKNSHOP', 'WELLCOME', 'JASONS', 'AEON'];
    const pricedItems = [];
    const gapItems = [];

    for (const item of state.list) {
      if (String(item.role).startsWith('gap:')) {
        const gid = item.role.slice(4);
        const g = gapById(gid);
        gapItems.push({
          label: item.label,
          note: (g && g.note) || '暫無公開參考價',
          optional: !!item.optional,
          qty: item.qty || 1,
        });
        continue;
      }
      const role = roleById(item.role);
      if (!role || !role.products.length) {
        gapItems.push({
          label: item.label,
          note: '暫無公開參考價',
          optional: !!item.optional,
          qty: item.qty || 1,
        });
        continue;
      }
      const product = preferProduct(role.products, item.role);
      pricedItems.push({
        role: item.role,
        label: item.label,
        optional: !!item.optional,
        qty: item.qty || 1,
        product,
      });
    }

    const requiredPriced = pricedItems.filter((x) => !x.optional);
    const allPriced = pricedItems;

    // Nearest store per chain
    const nearestByChain = {};
    for (const chain of chains) {
      const branches = (state.data.stores || []).filter((s) => s.chain === chain);
      let best = null;
      for (const b of branches) {
        const d = haversineKm(userLat, userLng, b.lat, b.lng);
        if (!best || d < best.distanceKm) best = { ...b, distanceKm: d };
      }
      if (best) nearestByChain[chain] = best;
    }

    // Single-chain baskets
    const single = [];
    for (const chain of chains) {
      const lines = [];
      let total = 0;
      let coveredReq = 0;
      let missing = [];
      for (const it of allPriced) {
        const pr = priceAtChain(it.product, chain);
        if (pr == null) {
          if (!it.optional) missing.push(it.label);
          lines.push({
            label: it.label,
            productName: it.product.name,
            brand: it.product.brand,
            price: null,
            status: '此門市連鎖暫無 OPW 參考價',
          });
          continue;
        }
        const lineTotal = pr * (it.qty || 1);
        total += lineTotal;
        if (!it.optional) coveredReq++;
        lines.push({
          label: it.label,
          productName: it.product.name,
          brand: it.product.brand,
          price: lineTotal,
          unitPrice: pr,
          status: 'ok',
        });
      }
      const reqTotal = requiredPriced.length;
      const coverage = reqTotal ? coveredReq / reqTotal : 1;
      const store = nearestByChain[chain];
      single.push({
        type: 'single',
        chain,
        storeName: store ? store.name : (state.data.storeLabels[chain] || chain),
        distanceKm: store ? store.distanceKm : null,
        total,
        coverage,
        coveredReq,
        reqTotal,
        missing,
        lines,
        gaps: gapItems,
        feasible: coverage >= 1 && missing.length === 0,
      });
    }

    // Two-store combo: pick best coverage then price for items missing in primary
    const combos = [];
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const a = chains[i];
        const b = chains[j];
        const lines = [];
        let total = 0;
        let coveredReq = 0;
        let missing = [];
        const used = new Set();
        for (const it of allPriced) {
          const pa = priceAtChain(it.product, a);
          const pb = priceAtChain(it.product, b);
          let pick = null;
          if (pa != null && pb != null) pick = pa <= pb ? { chain: a, price: pa } : { chain: b, price: pb };
          else if (pa != null) pick = { chain: a, price: pa };
          else if (pb != null) pick = { chain: b, price: pb };
          if (!pick) {
            if (!it.optional) missing.push(it.label);
            lines.push({
              label: it.label,
              productName: it.product.name,
              brand: it.product.brand,
              price: null,
              status: '兩店合計仍無 OPW 參考價',
            });
            continue;
          }
          used.add(pick.chain);
          const lineTotal = pick.price * (it.qty || 1);
          total += lineTotal;
          if (!it.optional) coveredReq++;
          lines.push({
            label: it.label,
            productName: it.product.name,
            brand: it.product.brand,
            price: lineTotal,
            unitPrice: pick.price,
            at: state.data.storeLabels[pick.chain] || pick.chain,
            status: 'ok',
          });
        }
        const storeA = nearestByChain[a];
        const storeB = nearestByChain[b];
        const dist =
          (storeA ? storeA.distanceKm : 0) + (storeB ? storeB.distanceKm : 0);
        const reqTotal = requiredPriced.length;
        const coverage = reqTotal ? coveredReq / reqTotal : 1;
        combos.push({
          type: 'combo',
          chain: a + '+' + b,
          storeName:
            (storeA ? storeA.name : a) + ' + ' + (storeB ? storeB.name : b),
          distanceKm: dist,
          hopKm: dist,
          total,
          coverage,
          coveredReq,
          reqTotal,
          missing,
          lines,
          gaps: gapItems,
          feasible: coverage >= 1 && missing.length === 0,
          storesUsed: [storeA, storeB].filter(Boolean),
        });
      }
    }

    return { single, combos, gapItems, pricedCount: allPriced.length, requiredCount: requiredPriced.length };
  }

  function pickRoutes(cands) {
    // Prefer feasible single-store; else feasible combo; else best coverage
    const pool = [...cands.single, ...cands.combos];
    const feasible = pool.filter((p) => p.feasible);
    const base = feasible.length ? feasible : pool.slice().sort((a, b) => b.coverage - a.coverage || a.total - b.total);

    const byPriceAsc = base.slice().sort((a, b) => a.total - b.total || (a.distanceKm || 99) - (b.distanceKm || 99));
    const byPriceDesc = base.slice().sort((a, b) => b.total - a.total || (a.distanceKm || 99) - (b.distanceKm || 99));
    const byNear = base.slice().sort((a, b) => {
      const da = a.type === 'combo' ? (a.distanceKm || 99) + 0.8 : (a.distanceKm || 99);
      const db = b.type === 'combo' ? (b.distanceKm || 99) + 0.8 : (b.distanceKm || 99);
      // convenience score: distance primary, then coverage, then price
      if (Math.abs(da - db) > 0.15) return da - db;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return a.total - b.total;
    });

    const low = byPriceAsc[0];
    const high = byPriceDesc[0];
    // mid: median total among base
    const midSorted = byPriceAsc;
    const mid = midSorted[Math.floor((midSorted.length - 1) / 2)] || low;
    const near = byNear[0];

    function altFor(primary, ranked) {
      const alt = ranked.find((x) => x !== primary && (x.chain !== primary.chain || x.storeName !== primary.storeName));
      return alt || null;
    }

    return {
      low: { primary: low, alt: altFor(low, byPriceAsc) },
      high: { primary: high, alt: altFor(high, byPriceDesc) },
      mid: { primary: mid, alt: altFor(mid, midSorted) },
      near: { primary: near, alt: altFor(near, byNear) },
      meta: {
        feasibleCount: feasible.length,
        poolSize: pool.length,
        usedFeasibleOnly: feasible.length > 0,
      },
    };
  }

  function fmtMoney(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return '$' + n.toFixed(1);
  }
  function fmtKm(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return n < 1 ? Math.round(n * 1000) + ' m' : n.toFixed(2) + ' km';
  }
  function fmtCov(c) {
    return Math.round((c.coverage || 0) * 100) + '%（必買 ' + c.coveredReq + '/' + c.reqTotal + '）';
  }

  function renderBasket(c) {
    if (!c) return '<p class="err">無可用方案</p>';
    const lines = (c.lines || [])
      .map((l) => {
        if (l.status !== 'ok') {
          return `<li><strong>${esc(l.label)}</strong>：${esc(l.productName || '')} — <em>${esc(l.status)}</em></li>`;
        }
        const at = l.at ? ` @ ${esc(l.at)}` : '';
        return `<li><strong>${esc(l.label)}</strong>：${esc(l.brand ? l.brand + ' ' : '')}${esc(l.productName)} — ${fmtMoney(l.price)}${at}</li>`;
      })
      .join('');
    const gaps = (c.gaps || [])
      .map((g) => `<li><span class="tag gap">暫無公開參考價</span> ${esc(g.label)}${g.optional ? '（可選）' : ''}</li>`)
      .join('');
    const miss = (c.missing || []).length
      ? `<p class="err">未覆蓋必買：${c.missing.map(esc).join('、')}</p>`
      : '';
    return `
      <div class="sub">${esc(c.storeName)} · 距離約 ${fmtKm(c.distanceKm)} · 覆蓋 ${fmtCov(c)}
      ${c.type === 'combo' ? ' · 兩店組合' : ' · 單店連鎖'}</div>
      ${miss}
      <ul>${lines}${gaps}</ul>`;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderResults(routes) {
    const order = ['low', 'mid', 'high', 'near'];
    const cards = order
      .map((key) => {
        const m = ROUTE_META[key];
        const block = routes[key];
        const p = block.primary;
        const alt = block.alt;
        return `<article class="route ${m.cls}">
          <div class="head">
            <div>
              <div class="kind">${m.kind}</div>
              <div class="sub">${m.blurb}</div>
            </div>
            <div class="price">${p && p.feasible ? fmtMoney(p.total) : p ? fmtMoney(p.total) + '*' : '—'}</div>
          </div>
          ${renderBasket(p)}
          ${
            alt
              ? `<div class="alt"><span class="badge">次優替代</span>
            ${fmtMoney(alt.total)} · ${esc(alt.storeName)} · ${fmtKm(alt.distanceKm)} · 覆蓋 ${fmtCov(alt)}
            <details class="more"><summary>展開替代明細</summary>${renderBasket(alt)}</details>
            </div>`
              : ''
          }
        </article>`;
      })
      .join('');

    const note = routes.meta.usedFeasibleOnly
      ? '下列以「必買材料皆有 OPW 參考價」的方案為主。'
      : '目前沒有單店／兩店能完全覆蓋所有必買材料；以下為覆蓋率較高的次優。';

    $('results').innerHTML = `
      <p class="notice">${note} 標價合計<strong>不含</strong>「暫無公開參考價」項目。有 * 表示覆蓋未完整。</p>
      <div class="routes">${cards}</div>
      <table class="compare" aria-label="四線速查">
        <thead><tr><th>路線</th><th>估計總價</th><th>門市</th><th>距離</th><th>覆蓋</th></tr></thead>
        <tbody>
        ${order
          .map((key) => {
            const p = routes[key].primary;
            return `<tr>
              <td>${ROUTE_META[key].kind}</td>
              <td class="cov">${p ? fmtMoney(p.total) : '—'}</td>
              <td>${p ? esc(p.storeName) : '—'}</td>
              <td>${p ? fmtKm(p.distanceKm) : '—'}</td>
              <td class="cov">${p ? fmtCov(p) : '—'}</td>
            </tr>`;
          })
          .join('')}
        </tbody>
      </table>`;
  }

  function renderList() {
    const box = $('ingredientList');
    box.innerHTML = state.list
      .map((item, idx) => {
        const isGap = String(item.role).startsWith('gap:');
        const role = !isGap ? roleById(item.role) : null;
        const nProd = role ? role.products.length : 0;
        return `<div class="list-item" data-idx="${idx}">
          <div>
            <div class="name">${esc(item.label)}</div>
            <div class="meta">
              ${isGap ? '<span class="tag gap">暫無公開參考價</span>' : `<span class="tag">${nProd} 款 OPW 對應</span>`}
              ${item.optional ? '<span class="tag opt">可選</span>' : '<span class="tag">必買</span>'}
            </div>
          </div>
          <input type="number" min="1" max="9" value="${item.qty || 1}" aria-label="數量" data-q="${idx}">
          <button type="button" class="btn-danger" data-del="${idx}" aria-label="移除">刪</button>
        </div>`;
      })
      .join('');
  }

  function fillAddSelect() {
    const sel = $('addRole');
    const opts = [];
    for (const r of state.data.roles || []) {
      opts.push(`<option value="${esc(r.id)}">${esc(r.label)}</option>`);
    }
    for (const g of state.data.gaps || []) {
      opts.push(`<option value="gap:${esc(g.id)}">${esc(g.label)}（暫無公開參考價）</option>`);
    }
    sel.innerHTML = opts.join('');
  }

  function fillDistricts() {
    const box = $('districtChips');
    box.innerHTML = (state.data.districts || [])
      .map(
        (d) =>
          `<button type="button" class="chip${d.id === state.districtId ? ' active' : ''}" data-d="${esc(d.id)}">${esc(d.label)}</button>`
      )
      .join('');
  }

  function setDistrict(id) {
    const d = (state.data.districts || []).find((x) => x.id === id);
    if (!d) return;
    state.districtId = id;
    $('lat').value = d.lat;
    $('lng').value = d.lng;
    fillDistricts();
    $('locStatus').textContent = `已選地區：${d.label}（${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}）`;
  }

  async function geocode() {
    const q = $('addr').value.trim();
    if (!q) {
      $('locStatus').textContent = '請先輸入地址關鍵字。';
      return;
    }
    $('locStatus').textContent = '查詢地政署 ALS 中…';
    try {
      const url =
        'https://www.als.gov.hk/lookup?q=' + encodeURIComponent(q) + '&n=1';
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const sug = data && data.SuggestedAddress && data.SuggestedAddress[0];
      const geo =
        sug &&
        sug.Address &&
        sug.Address.PremisesAddress &&
        sug.Address.PremisesAddress.GeospatialInformation;
      if (!geo || geo.Latitude == null) throw new Error('沒有座標');
      $('lat').value = Number(geo.Latitude);
      $('lng').value = Number(geo.Longitude);
      const chi =
        (sug.Address.PremisesAddress.ChiPremisesAddress &&
          (sug.Address.PremisesAddress.ChiPremisesAddress.BuildingName ||
            (sug.Address.PremisesAddress.ChiPremisesAddress.ChiStreet &&
              sug.Address.PremisesAddress.ChiPremisesAddress.ChiStreet.StreetName))) ||
        q;
      $('locStatus').textContent = `ALS 結果：${chi}（${Number(geo.Latitude).toFixed(5)}, ${Number(geo.Longitude).toFixed(5)}）。資料來源：地政總署。`;
    } catch (e) {
      $('locStatus').textContent =
        '地址查詢失敗（可能是瀏覽器 CORS 或服務暫時不可用）。請改用上方地區按鈕或手動改緯度經度。';
    }
  }

  function compute() {
    const lat = Number($('lat').value);
    const lng = Number($('lng').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      $('results').innerHTML = '<p class="err">緯度／經度無效</p>';
      return;
    }
    if (!state.list.length) {
      $('results').innerHTML = '<p class="err">請至少加入一項材料</p>';
      return;
    }
    const cands = buildCandidates(lat, lng);
    const routes = pickRoutes(cands);
    renderResults(routes);
  }

  function bind() {
    $('districtChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-d]');
      if (btn) setDistrict(btn.getAttribute('data-d'));
    });
    $('btnGeocode').addEventListener('click', geocode);
    $('btnAdd').addEventListener('click', () => {
      const role = $('addRole').value;
      let label = $('addRole').selectedOptions[0].textContent.replace(/（暫無公開參考價）/, '').trim();
      const optional = String(role).startsWith('gap:') || role === 'honey' || role === 'sugar' || role === 'yogurt_fruit' || role === 'soymilk' || role === 'milk_lowfat';
      state.list.push({ role, label, qty: 1, optional });
      renderList();
    });
    $('ingredientList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        state.list.splice(Number(del.getAttribute('data-del')), 1);
        renderList();
      }
    });
    $('ingredientList').addEventListener('change', (e) => {
      const q = e.target.getAttribute('data-q');
      if (q != null) {
        const n = Math.max(1, Math.min(9, Number(e.target.value) || 1));
        state.list[Number(q)].qty = n;
        e.target.value = n;
      }
    });
    $('btnGo').addEventListener('click', compute);
  }

  async function boot() {
    try {
      const res = await fetch('./data/opw-subset.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('load data ' + res.status);
      state.data = await res.json();
      state.list = (state.data.defaultList || []).map((x) => ({ ...x }));
      $('attr').textContent =
        (state.data.attribution || '') +
        ' 資料擷取時效：' +
        (state.data.dataAsOf || '（見 DECISIONS）') +
        '。';
      fillDistricts();
      fillAddSelect();
      renderList();
      bind();
      // auto first compute for demo
      compute();
    } catch (e) {
      $('results').innerHTML = '<p class="err">無法載入 data/opw-subset.json：' + esc(e.message) + '</p>';
    }
  }

  boot();
})();
