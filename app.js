/* yogurt-routes v1.1 — brand pick + peer alts + OPW. No invented prices. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { data: null, list: [], districtId: 'cwb' };

  const ROUTE_META = {
    high: { kind: '高價路線', cls: 'hi', blurb: '同覆蓋下估計總價較高' },
    mid: { kind: '中價路線', cls: 'mid', blurb: '介乎高低的折衷總價' },
    low: { kind: '低價路線', cls: 'lo', blurb: '可覆蓋材料中估計總價較低' },
    near: { kind: '方便路線', cls: 'near', blurb: '優先較近門市，兼顧覆蓋與價格' },
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  function brandMeta(roleId, brandName) {
    const role = roleById(roleId);
    if (!role || !brandName) return null;
    return (role.brands || []).find((b) => b.name === brandName) || null;
  }

  function productsForBrand(role, brand) {
    if (!brand) return role.products.slice();
    return role.products.filter((p) => (p.brand || '') === brand);
  }

  function preferProduct(products, roleId) {
    if (!products || !products.length) return null;
    if (roleId === 'milk_fresh' || roleId === 'milk_lowfat') {
      const scored = products.map((p) => {
        let s = 0;
        const n = p.name || '';
        if (/1\.?5\s*公升|1\.5L/i.test(n)) s += 3;
        else if (/1\s*公升|1L|946|950|908/i.test(n)) s += 5;
        else if (/500|475|400/i.test(n)) s += 1;
        else if (/236|200|250/i.test(n)) s -= 2;
        if (/鮮牛奶|全脂|純鮮奶|純牛奶|頂級|100%/.test(n)) s += 2;
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
        return { p, s };
      });
      scored.sort((a, b) => b.s - a.s || a.p.minPrice - b.p.minPrice);
      return scored[0].p;
    }
    return [...products].sort((a, b) => a.minPrice - b.minPrice)[0];
  }

  /** Resolve one list line: product + brand status + peer suggestions */
  function resolveLine(item) {
    if (String(item.role).startsWith('gap:')) {
      const gid = item.role.slice(4);
      const g = gapById(gid);
      return {
        kind: 'gap',
        label: item.label,
        brand: item.brand || '',
        optional: !!item.optional,
        qty: item.qty || 1,
        note: (g && g.note) || '暫無公開參考價',
        peers: [],
        defer: true,
      };
    }
    const role = roleById(item.role);
    if (!role) {
      return {
        kind: 'gap',
        label: item.label,
        brand: item.brand || '',
        optional: !!item.optional,
        qty: item.qty || 1,
        note: '暫無公開參考價',
        peers: [],
        defer: true,
      };
    }

    const brand = (item.brand || '').trim();
    const meta = brand ? brandMeta(item.role, brand) : null;
    let pool = productsForBrand(role, brand || null);
    let brandStatus = 'any'; // any | matched | missing_opw | empty_brand_pool
    let note = '';
    let product = null;
    let usedPeer = null;

    if (!brand) {
      product = preferProduct(role.products, item.role);
      brandStatus = 'any';
    } else if (pool.length) {
      product = preferProduct(pool, item.role);
      brandStatus = 'matched';
    } else {
      brandStatus = 'missing_opw';
      note =
        (meta && meta.note) ||
        'OPW 暫無「' + brand + '」公開參考價（不代表門市有／無貨）';
    }

    const peers = peerSuggestions(item.role, brand || (meta && meta.tier), brand);
    // If missing brand price, auto-pick first peer WITH opw product for route math (as suggested substitute)
    if (brandStatus === 'missing_opw' && peers.length) {
      const withPrice = peers.filter((p) => p.inOpw && p.product);
      if (withPrice.length) {
        usedPeer = withPrice[0];
        product = usedPeer.product;
      }
    }

    return {
      kind: product ? 'priced' : 'unpriced',
      role: item.role,
      label: item.label,
      brand,
      optional: !!item.optional,
      qty: item.qty || 1,
      product,
      brandStatus,
      note,
      peers,
      usedPeer,
      defer: brandStatus === 'missing_opw' && !product,
      meta,
    };
  }

  function peerSuggestions(roleId, brandOrTier, excludeBrand) {
    const role = roleById(roleId);
    if (!role) return [];
    let tier = null;
    if (brandOrTier && state.data.peerTiers && state.data.peerTiers[brandOrTier]) {
      tier = brandOrTier;
    } else {
      const meta = brandMeta(roleId, excludeBrand || brandOrTier);
      tier = meta && meta.tier;
    }
    // fallback: if no brand, no peer list for alerts (optional)
    if (!tier || !state.data.peerTiers[tier]) {
      // still suggest other in-role OPW brands when specific brand missing
      if (excludeBrand) {
        return (role.brands || [])
          .filter((b) => b.inOpw && b.name !== excludeBrand)
          .slice(0, 5)
          .map((b) => ({
            name: b.name,
            inOpw: true,
            tier: b.tier,
            product: preferProduct(productsForBrand(role, b.name), roleId),
            tierLabel: '同材料其他品牌',
          }));
      }
      return [];
    }
    const t = state.data.peerTiers[tier];
    const out = [];
    for (const name of t.brands) {
      if (excludeBrand && name === excludeBrand) continue;
      const bm = (role.brands || []).find((b) => b.name === name);
      const inOpw = !!(bm && bm.inOpw);
      const pool = productsForBrand(role, name);
      const product = pool.length ? preferProduct(pool, roleId) : null;
      out.push({
        name,
        inOpw: inOpw && !!product,
        tier,
        tierLabel: t.label,
        hint: t.hint,
        product,
        note: bm && bm.note,
      });
    }
    // Prefer those with OPW price first
    out.sort((a, b) => Number(b.inOpw) - Number(a.inOpw));
    return out;
  }

  function priceAtChain(product, chain) {
    if (!product) return null;
    const hit = (product.prices || []).find((p) => p.supermarketCode === chain);
    return hit ? hit.price : null;
  }

  function buildCandidates(userLat, userLng) {
    const chains = ['PARKNSHOP', 'WELLCOME', 'JASONS', 'AEON'];
    const resolved = state.list.map(resolveLine);
    const pricedItems = resolved.filter((x) => x.kind === 'priced' && x.product);
    const alertItems = resolved.filter(
      (x) => x.brandStatus === 'missing_opw' || x.kind === 'gap' || x.kind === 'unpriced'
    );
    const gapOnly = resolved.filter((x) => x.kind === 'gap' || (x.kind === 'unpriced' && !x.product));

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

    const requiredPriced = pricedItems.filter((x) => !x.optional);

    function basketFor(pickPriceFn, labelFn, type) {
      const lines = [];
      let total = 0;
      let coveredReq = 0;
      const missing = [];
      for (const it of pricedItems) {
        const pick = pickPriceFn(it);
        if (!pick) {
          if (!it.optional) missing.push(it.label);
          lines.push({
            label: it.label,
            brand: it.brand,
            productName: it.product.name,
            brandName: it.product.brand,
            price: null,
            status: '此方案暫無 OPW 參考價',
            suggested: !!it.usedPeer,
            wantedBrand: it.brand,
            peerUsed: it.usedPeer && it.usedPeer.name,
          });
          continue;
        }
        const lineTotal = pick.price * (it.qty || 1);
        total += lineTotal;
        if (!it.optional) coveredReq++;
        lines.push({
          label: it.label,
          brand: it.brand,
          productName: it.product.name,
          brandName: it.product.brand,
          price: lineTotal,
          unitPrice: pick.price,
          at: pick.at || null,
          status: 'ok',
          suggested: !!it.usedPeer,
          wantedBrand: it.brand,
          peerUsed: it.usedPeer && it.usedPeer.name,
        });
      }
      for (const g of gapOnly) {
        lines.push({
          label: g.label,
          brand: g.brand,
          productName: '',
          brandName: '',
          price: null,
          status: g.note || '暫無公開參考價',
          gap: true,
        });
      }
      const reqTotal = requiredPriced.length;
      const coverage = reqTotal ? coveredReq / reqTotal : 1;
      return {
        type,
        ...labelFn(),
        total,
        coverage,
        coveredReq,
        reqTotal,
        missing,
        lines,
        feasible: coverage >= 1 && missing.length === 0,
      };
    }

    const single = chains.map((chain) =>
      basketFor(
        (it) => {
          const pr = priceAtChain(it.product, chain);
          return pr == null ? null : { price: pr };
        },
        () => {
          const store = nearestByChain[chain];
          return {
            chain,
            storeName: store ? store.name : state.data.storeLabels[chain] || chain,
            distanceKm: store ? store.distanceKm : null,
          };
        },
        'single'
      )
    );

    const combos = [];
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const a = chains[i];
        const b = chains[j];
        combos.push(
          basketFor(
            (it) => {
              const pa = priceAtChain(it.product, a);
              const pb = priceAtChain(it.product, b);
              let pick = null;
              if (pa != null && pb != null)
                pick = pa <= pb ? { price: pa, at: state.data.storeLabels[a] } : { price: pb, at: state.data.storeLabels[b] };
              else if (pa != null) pick = { price: pa, at: state.data.storeLabels[a] };
              else if (pb != null) pick = { price: pb, at: state.data.storeLabels[b] };
              return pick;
            },
            () => {
              const storeA = nearestByChain[a];
              const storeB = nearestByChain[b];
              return {
                chain: a + '+' + b,
                storeName: (storeA ? storeA.name : a) + ' + ' + (storeB ? storeB.name : b),
                distanceKm: (storeA ? storeA.distanceKm : 0) + (storeB ? storeB.distanceKm : 0),
              };
            },
            'combo'
          )
        );
      }
    }

    return { single, combos, resolved, alertItems, pricedCount: pricedItems.length, requiredCount: requiredPriced.length };
  }

  function pickRoutes(cands) {
    const pool = [...cands.single, ...cands.combos];
    const feasible = pool.filter((p) => p.feasible);
    const base = feasible.length
      ? feasible
      : pool.slice().sort((a, b) => b.coverage - a.coverage || a.total - b.total);

    const byPriceAsc = base.slice().sort((a, b) => a.total - b.total || (a.distanceKm || 99) - (b.distanceKm || 99));
    const byPriceDesc = base.slice().sort((a, b) => b.total - a.total || (a.distanceKm || 99) - (b.distanceKm || 99));
    const byNear = base.slice().sort((a, b) => {
      const da = a.type === 'combo' ? (a.distanceKm || 99) + 0.8 : a.distanceKm || 99;
      const db = b.type === 'combo' ? (b.distanceKm || 99) + 0.8 : b.distanceKm || 99;
      if (Math.abs(da - db) > 0.15) return da - db;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return a.total - b.total;
    });

    const low = byPriceAsc[0];
    const high = byPriceDesc[0];
    const mid = byPriceAsc[Math.floor((byPriceAsc.length - 1) / 2)] || low;
    const near = byNear[0];
    const altFor = (primary, ranked) =>
      ranked.find((x) => x !== primary && (x.chain !== primary.chain || x.storeName !== primary.storeName)) || null;

    return {
      low: { primary: low, alt: altFor(low, byPriceAsc) },
      high: { primary: high, alt: altFor(high, byPriceDesc) },
      mid: { primary: mid, alt: altFor(mid, byPriceAsc) },
      near: { primary: near, alt: altFor(near, byNear) },
      meta: { feasibleCount: feasible.length, usedFeasibleOnly: feasible.length > 0 },
      alertItems: cands.alertItems,
      resolved: cands.resolved,
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
        if (l.gap || l.status !== 'ok') {
          return `<li><strong>${esc(l.label)}</strong>${l.brand ? ' · 想要 ' + esc(l.brand) : ''} — <em>${esc(l.status)}</em></li>`;
        }
        const at = l.at ? ` @ ${esc(l.at)}` : '';
        const brandBit = l.brandName ? esc(l.brandName) + ' ' : '';
        const sug =
          l.suggested && l.wantedBrand
            ? ` <span class="tag brand">以 ${esc(l.peerUsed || l.brandName)} 代替 ${esc(l.wantedBrand)}（建議）</span>`
            : l.brand
              ? ` <span class="tag brand">${esc(l.brand)}</span>`
              : '';
        return `<li><strong>${esc(l.label)}</strong>${sug}：${brandBit}${esc(l.productName)} — ${fmtMoney(l.price)}${at}</li>`;
      })
      .join('');
    const miss = (c.missing || []).length
      ? `<p class="err">未覆蓋必買：${c.missing.map(esc).join('、')}</p>`
      : '';
    return `
      <div class="sub">${esc(c.storeName)} · 距離約 ${fmtKm(c.distanceKm)} · 覆蓋 ${fmtCov(c)}
      · ${c.type === 'combo' ? '兩店組合' : '單店連鎖'}</div>
      ${miss}
      <ul>${lines}</ul>`;
  }

  function renderBrandAlerts(items) {
    const box = $('brandAlerts');
    const missing = (items || []).filter((x) => x.brandStatus === 'missing_opw' || x.kind === 'unpriced');
    const gaps = (items || []).filter((x) => x.kind === 'gap');
    if (!missing.length && !gaps.length) {
      box.innerHTML = '';
      return;
    }
    let html = '';
    for (const m of missing) {
      const peersWith = (m.peers || []).filter((p) => p.inOpw);
      const peerBtns = peersWith
        .slice(0, 4)
        .map(
          (p) =>
            `<button type="button" class="peer-btn" data-peer-role="${esc(m.role)}" data-peer-brand="${esc(p.name)}" data-from="${esc(m.brand)}">改用 ${esc(p.name)}</button>`
        )
        .join('');
      html += `<div class="peers" data-alert-brand="${esc(m.brand)}">
        <strong>「${esc(m.label)}」指定 ${esc(m.brand) || '品牌'}：暫無公開參考價</strong>
        <div>${esc(m.note || '')}　此為資料缺口標示，<em>不是</em>即時庫存狀態。</div>
        <div style="margin-top:8px">同級建議（${esc((m.peers[0] && m.peers[0].tierLabel) || '同類')}）${m.usedPeer ? ' · 路線暫以 <strong>' + esc(m.usedPeer.name) + '</strong> 計價' : ''}：</div>
        ${peerBtns}
        <button type="button" class="peer-btn later" data-defer-label="${esc(m.label)}" data-defer-brand="${esc(m.brand)}">改天再買（移出必買合計）</button>
      </div>`;
    }
    for (const g of gaps) {
      html += `<div class="peers" style="background:var(--gap-bg);border-color:#fcd34d">
        <strong>${esc(g.label)}：暫無公開參考價</strong>
        <div>${esc(g.note)} · 不計入路線總價。</div>
        <button type="button" class="peer-btn later" data-defer-label="${esc(g.label)}">改天再買（保持缺口標示）</button>
      </div>`;
    }
    box.innerHTML = html;
  }

  function renderResults(routes) {
    renderBrandAlerts(routes.alertItems);
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
            <div class="price">${p ? fmtMoney(p.total) : '—'}${p && !p.feasible ? '*' : ''}</div>
          </div>
          ${renderBasket(p)}
          ${
            alt
              ? `<div class="alt"><p class="alt-title"><span class="badge">次優替代</span>${fmtMoney(alt.total)} · ${esc(alt.storeName)} · ${fmtKm(alt.distanceKm)}</p>
            <div class="sub">覆蓋 ${fmtCov(alt)}</div>
            <details class="more"><summary>展開替代明細</summary>${renderBasket(alt)}</details>
            </div>`
              : ''
          }
        </article>`;
      })
      .join('');

    const note = routes.meta.usedFeasibleOnly
      ? '以下以「必買材料皆有參考價」的方案為主（含同級品牌建議代替後之計價）。'
      : '沒有方案能完全覆蓋所有必買；以下為覆蓋率較高的次優。';

    $('results').innerHTML = `
      <p class="notice">${note} 總價<strong>不含</strong>「暫無公開參考價」與已選「改天再買」項。* 表示覆蓋未完整。</p>
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

  function brandOptionsHtml(roleId, selected) {
    if (String(roleId).startsWith('gap:')) {
      return `<option value="">—</option>`;
    }
    const role = roleById(roleId);
    const brands = (role && role.brands) || [];
    let html = `<option value=""${selected ? '' : ' selected'}>不限品牌</option>`;
    for (const b of brands) {
      const mark = b.inOpw ? '' : '（OPW 無價）';
      const sel = selected === b.name ? ' selected' : '';
      html += `<option value="${esc(b.name)}"${sel}>${esc(b.name)}${mark}</option>`;
    }
    return html;
  }

  function renderList() {
    const box = $('ingredientList');
    box.innerHTML = state.list
      .map((item, idx) => {
        const isGap = String(item.role).startsWith('gap:');
        const role = !isGap ? roleById(item.role) : null;
        const nProd = role ? role.products.length : 0;
        const bm = item.brand ? brandMeta(item.role, item.brand) : null;
        const brandWarn =
          item.brand && bm && !bm.inOpw
            ? `<div class="brand-note">「${esc(item.brand)}」：${esc(bm.note || 'OPW 暫無公開參考價')}。計算時會提示同級替代或改天再買。</div>`
            : item.brand && role && !productsForBrand(role, item.brand).length
              ? `<div class="brand-note">「${esc(item.brand)}」在此材料類別暫無 OPW 商品價。</div>`
              : '';
        return `<div class="item" data-idx="${idx}">
          <div class="top">
            <div>
              <p class="name">${esc(item.label)}</p>
              <div class="meta">
                ${isGap ? '<span class="tag gap">暫無公開參考價</span>' : `<span class="tag ok">${nProd} 款 OPW</span>`}
                ${item.optional ? '<span class="tag opt">可選</span>' : '<span class="tag ok">必買</span>'}
                ${item.brand ? `<span class="tag brand">${esc(item.brand)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="btn-danger" data-del="${idx}" aria-label="移除">刪</button>
          </div>
          <div class="controls ${isGap ? '' : 'three'}">
            <div>
              <label for="brand-${idx}">品牌</label>
              <select id="brand-${idx}" data-brand="${idx}" ${isGap ? 'disabled' : ''}>${brandOptionsHtml(item.role, item.brand || '')}</select>
            </div>
            <div>
              <label for="qty-${idx}">數量</label>
              <input id="qty-${idx}" type="number" min="1" max="9" value="${item.qty || 1}" data-q="${idx}">
            </div>
          </div>
          ${brandWarn}
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
    $('locStatus').textContent = `已選：${d.label}（${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}）`;
  }

  async function geocode() {
    const q = $('addr').value.trim();
    if (!q) {
      $('locStatus').textContent = '請先輸入地址關鍵字。';
      return;
    }
    $('locStatus').textContent = '查詢地政署 ALS 中…';
    try {
      const url = 'https://www.als.gov.hk/lookup?q=' + encodeURIComponent(q) + '&n=1';
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
      $('locStatus').textContent = `ALS：${q}（${Number(geo.Latitude).toFixed(5)}, ${Number(geo.Longitude).toFixed(5)}）`;
    } catch (e) {
      $('locStatus').textContent = '地址查詢失敗（CORS 或服務問題）。請用地區按鈕或手動座標。';
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

  function applyPeerBrand(roleId, newBrand) {
    const idx = state.list.findIndex((x) => x.role === roleId);
    if (idx < 0) return;
    state.list[idx].brand = newBrand;
    renderList();
    compute();
  }

  function deferItem(label, brand) {
    // Mark matching item optional + move to "defer" by setting optional true and clearing brand if needed
    const idx = state.list.findIndex(
      (x) => x.label === label && (!brand || x.brand === brand || !x.brand)
    );
    if (idx < 0) return;
    state.list[idx].optional = true;
    // If it was a priced role with missing brand, keep brand but optional so it won't block coverage
    renderList();
    compute();
    const el = $('brandAlerts');
    if (el) {
      const note = document.createElement('p');
      note.className = 'notice';
      note.textContent = `已將「${label}」標為可選／改天再買：不再影響必買覆蓋，仍可能顯示於清單。`;
      el.prepend(note);
    }
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
      const optional =
        String(role).startsWith('gap:') ||
        role === 'honey' ||
        role === 'sugar' ||
        role === 'yogurt_fruit' ||
        role === 'soymilk' ||
        role === 'milk_lowfat';
      state.list.push({ role, label, qty: 1, optional, brand: '' });
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
      const b = e.target.getAttribute('data-brand');
      if (b != null) {
        state.list[Number(b)].brand = e.target.value;
        renderList();
      }
    });
    $('btnGo').addEventListener('click', compute);
    document.body.addEventListener('click', (e) => {
      const peer = e.target.closest('[data-peer-brand]');
      if (peer) {
        applyPeerBrand(peer.getAttribute('data-peer-role'), peer.getAttribute('data-peer-brand'));
        return;
      }
      const defer = e.target.closest('[data-defer-label]');
      if (defer) {
        deferItem(defer.getAttribute('data-defer-label'), defer.getAttribute('data-defer-brand') || '');
      }
    });
  }

  async function boot() {
    try {
      const res = await fetch('./data/opw-subset.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('load data ' + res.status);
      state.data = await res.json();
      state.list = (state.data.defaultList || []).map((x) => ({ brand: '', ...x }));
      // Demo-friendly: set plain yogurt brand to Fage to showcase missing-brand flow
      const yog = state.list.find((x) => x.role === 'yogurt_plain');
      if (yog) yog.brand = 'Fage';
      const milk = state.list.find((x) => x.role === 'milk_fresh');
      if (milk) milk.brand = '明治';
      $('attr').textContent =
        (state.data.attribution || '') +
        ' 資料擷取時效：' +
        (state.data.dataAsOf || '') +
        '。品牌規則見 evidence/DECISIONS.md。';
      fillDistricts();
      fillAddSelect();
      renderList();
      bind();
      compute();
    } catch (e) {
      $('results').innerHTML = '<p class="err">無法載入 data/opw-subset.json：' + esc(e.message) + '</p>';
    }
  }

  boot();
})();
