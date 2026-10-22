(function () {
'use strict';
/* PetHora — núcleo: utilitários, cálculo de horários e acesso a dados */

const CFG = window.PETHORA_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
// endereço do site do cliente (o painel usa para montar o link de cada petshop)
// pasta base do site: '' na Netlify/domínio próprio; '/nome-do-repositorio' no GitHub Pages (detectado sozinho)
const BASE = String(CFG.basePath ?? (/\.github\.io$/.test(location.hostname) ? '/' + (location.pathname.split('/')[1] || '') : '')).replace(/\/+$/, '');
const siteRoot = () => location.origin + BASE + '/';
const clienteBase = () => String(CFG.clienteUrl || location.origin + BASE).replace(/\/+$/, '');

const SIZES = [
  { k: 'P',  label: 'Pequeno', hint: 'até 10 kg' },
  { k: 'M',  label: 'Médio',   hint: '10 a 25 kg' },
  { k: 'G',  label: 'Grande',  hint: '25 a 40 kg' },
  { k: 'GG', label: 'Gigante', hint: 'acima de 40 kg' },
];
const WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const STATUS = { confirmado: 'Confirmado', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' };

const ERRORS = {
  HORARIO_INDISPONIVEL: 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.',
  ANTECEDENCIA: 'Esse horário está muito em cima da hora. Escolha um horário mais tarde.',
  MUITO_DISTANTE: 'Essa data ainda não está aberta para agendamento.',
  FECHADO: 'O petshop não abre nesse dia.',
  FORA_DO_HORARIO: 'O serviço terminaria depois do fechamento. Escolha um horário mais cedo.',
  INTERVALO: 'Esse horário cai no intervalo de almoço. Escolha outro.',
  BLOQUEADO: 'O petshop bloqueou esse horário. Escolha outro.',
  LIMITE_CLIENTE: 'Você já tem 3 agendamentos em aberto. Fale com o petshop pelo WhatsApp para marcar mais.',
  SERVICO_INVALIDO: 'Esse serviço não está mais disponível. Atualize a página.',
  PORTE_INVALIDO: 'Esse serviço não atende o porte escolhido.',
  DADOS_INVALIDOS: 'Confira seu nome, o WhatsApp com DDD e o nome do pet.',
  LOJA_INDISPONIVEL: 'O agendamento online deste petshop está pausado.',
  PROFISSIONAL_INVALIDO: 'Escolha um profissional válido.',
  SLUG_EM_USO: 'Esse link já está em uso por outro petshop. Tente outro.',
  RESERVA_EXPIRADA: 'O tempo para pagar o sinal acabou e o horário foi liberado. Faça um novo agendamento.',
  EMAIL_INVALIDO: 'Digite um e-mail válido para receber o comprovante do Pix.',
  MP_NAO_CONFIGURADO: 'O pagamento pelo Mercado Pago ainda não foi ativado no PetHora. Fale com o suporte.',
  MP_NAO_CONECTADO: 'Este petshop ainda não conectou a conta do Mercado Pago.',
  ESTORNO_FALHOU: 'O Mercado Pago não conseguiu devolver o sinal agora. Tente de novo em alguns minutos.',
  MP_ERRO: 'O Mercado Pago não respondeu. Tente de novo em instantes.',
  JA_PAGO: 'Esse sinal já foi pago.',
};
function errMsg(e) {
  const m = String((e && (e.code || e.message)) || e || '');
  for (const k in ERRORS) if (m.includes(k)) return ERRORS[k];
  if (/23P01|exclusion/i.test(m)) return ERRORS.HORARIO_INDISPONIVEL;
  if (/duplicate key.*slug|shops_slug_key/i.test(m)) return ERRORS.SLUG_EM_USO;
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Entre com sua senha.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return 'Algo deu errado. Tente de novo em instantes.' + (m ? ' (' + m.slice(0, 120) + ')' : '');
}

/* ---------- utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = (v) => String(v || '').replace(/\D/g, '');
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const dur = (m) => { m = Number(m) || 0; const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h${String(r).padStart(2, '0')}` : h ? `${h}h` : `${r} min`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function fmtPhone(v) {
  let d = digits(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function waLink(phone, text) {
  let d = digits(phone);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
function onBrand(hex) {
  const h = digits(hex) === '' ? '1F6F6B' : String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? '#14201D' : '#FFFFFF';
}
function applyBrand(color) {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#1F6F6B';
  document.documentElement.style.setProperty('--brand', c);
  document.documentElement.style.setProperty('--on-brand', onBrand(c));
}
function initials(name) {
  return String(name || '?').replace(/&/g, ' ').split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/* ---------- datas no fuso do petshop ---------- */
const _fmtCache = {};
function _fmt(tz) {
  return _fmtCache[tz] || (_fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
}
const T = {
  parts(d, tz) {
    const o = {};
    for (const p of _fmt(tz).formatToParts(d)) o[p.type] = p.value;
    const h = o.hour === '24' ? 0 : +o.hour;
    const ds = `${o.year}-${o.month}-${o.day}`;
    return { ds, min: h * 60 + +o.minute, sec: +o.second, dow: T.dow(ds), y: +o.year, mo: +o.month, d: +o.day, h };
  },
  offset(tz, d) {
    const p = T.parts(d, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.min % 60, p.sec);
    return (asUtc - (d.getTime() - d.getMilliseconds())) / 60000;
  },
  toUtc(ds, min, tz) {
    const [y, m, d] = ds.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d, 0, min);
    const off = T.offset(tz, new Date(guess));
    let t = guess - off * 60000;
    const off2 = T.offset(tz, new Date(t));
    if (off2 !== off) t = guess - off2 * 60000;
    return new Date(t);
  },
  today: (tz) => T.parts(new Date(), tz).ds,
  addDays(ds, n) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); },
  dow(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); },
  hm: (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
  pm(s) { if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; },
  label(ds, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
    const [y, m, d] = ds.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  },
  short(ds) { const [, m, d] = ds.split('-'); return `${d}/${m}`; },
  time: (date, tz) => T.hm(T.parts(date, tz).min),
};

/* ---------- sinal (Pix) ---------- */
const DEPOSIT = {
  active: (shop) => !!(shop && shop.deposit_enabled && shop.mp_connected),
  amount: (shop, price) => Math.round(Number(price || 0) * (Number(shop.deposit_percent) || 30)) / 100,
  // reserva aguardando Pix que já venceu conta como cancelada
  expired: (b) => b.deposit_status === 'pendente' && b.hold_expires_at && new Date(b.hold_expires_at).getTime() < Date.now(),
  live: (b) => b.status !== 'cancelado' && !DEPOSIT.expired(b),
  policy: (shop) => `Para garantir o horário, é cobrado um sinal de ${Number(shop.deposit_percent) || 30}% via Pix, descontado do valor no dia. `
    + `Cancelando com pelo menos ${shop.cancel_hours ?? 24}h de antecedência, o sinal é devolvido. Depois disso, ou se o pet não for levado, o sinal fica com o petshop.`,
};

/* ---------- regra principal: quais horários estão livres ----------
   Um horário só aparece se:
   - está dentro do expediente do dia e não cruza o almoço;
   - o serviço inteiro (duração do porte) cabe antes do fechamento;
   - respeita a antecedência mínima e o limite de dias;
   - não cruza nenhum bloqueio (folga/feriado);
   - existe pelo menos 1 profissional sem nenhum agendamento que cruze
     o intervalo [início, fim). Com 1 profissional, agendou às 14h = 14h some. */
function computeSlots(shop, ds, duration, busy, opts = {}) {
  const tz = shop.timezone || 'America/Sao_Paulo';
  const h = (shop.hours || [])[T.dow(ds)];
  if (!h || h.closed || !duration) return [];
  const open = T.pm(h.open), close = T.pm(h.close);
  const bs = T.pm(h.break_start), be = T.pm(h.break_end);
  if (open == null || close == null) return [];
  const step = Number(shop.slot_interval) || 30;
  const cap = Math.max(1, (shop.staff || []).length);
  const now = opts.now || Date.now();
  const earliest = now + (opts.owner ? 0 : Number(shop.min_notice) || 0) * 60000;
  const latest = now + (Number(shop.max_days) || 30) * 86400000;
  const lanes = opts.lane ? [Number(opts.lane)] : Array.from({ length: cap }, (_, i) => i + 1);
  const out = [];
  for (let m = open; m + duration <= close; m += step) {
    if (bs != null && be != null && bs < be && m < be && m + duration > bs) continue;
    const s = T.toUtc(ds, m, tz);
    const e = new Date(s.getTime() + duration * 60000);
    if (s.getTime() < earliest) continue;
    if (!opts.owner && s.getTime() > latest) continue;
    const over = busy.filter((b) => b.start < e && b.end > s);
    if (over.some((b) => b.lane == null)) continue;
    const lane = lanes.find((l) => !over.some((b) => b.lane === l));
    if (lane === undefined) continue;
    out.push({ min: m, start: s, end: e, lane });
  }
  return out;
}

/* Mesmas validações que o banco faz (usadas no modo demonstração) */
function validateBooking(shop, svc, p, existing, blocks, asOwner) {
  if (!shop || !shop.active) throw new Error('LOJA_INDISPONIVEL');
  if (!svc || !svc.active) throw new Error('SERVICO_INVALIDO');
  const sz = svc.sizes && svc.sizes[p.size];
  if (!sz || !(sz.min >= 5)) throw new Error('PORTE_INVALIDO');
  const phone = digits(p.phone);
  if (String(p.customer || '').trim().length < 2 || phone.length < 10 || phone.length > 13 || !String(p.pet || '').trim()) throw new Error('DADOS_INVALIDOS');
  const start = new Date(p.start), end = new Date(start.getTime() + sz.min * 60000);
  const tz = shop.timezone;
  if (!asOwner) {
    if (start.getTime() < Date.now() + shop.min_notice * 60000) throw new Error('ANTECEDENCIA');
    if (start.getTime() > Date.now() + shop.max_days * 86400000) throw new Error('MUITO_DISTANTE');
    const ls = T.parts(start, tz), le = T.parts(end, tz);
    const h = shop.hours[ls.dow];
    if (!h || h.closed) throw new Error('FECHADO');
    if (ls.min < T.pm(h.open) || le.ds !== ls.ds || le.min > T.pm(h.close)) throw new Error('FORA_DO_HORARIO');
    const bs = T.pm(h.break_start), be = T.pm(h.break_end);
    if (bs != null && be != null && ls.min < be && le.min > bs) throw new Error('INTERVALO');
    if (blocks.some((k) => new Date(k.starts_at) < end && new Date(k.ends_at) > start)) throw new Error('BLOQUEADO');
    const open = existing.filter((b) => b.status === 'confirmado' && new Date(b.starts_at) > new Date() && digits(b.customer_phone) === phone);
    if (open.length >= 3) throw new Error('LIMITE_CLIENTE');
  }
  const cap = shop.staff.length;
  const clash = (l) => existing.some((b) => b.lane === l && b.status !== 'cancelado' && new Date(b.starts_at) < end && new Date(b.ends_at) > start);
  let lane = null;
  if (asOwner && p.lane) {
    if (p.lane < 1 || p.lane > cap) throw new Error('PROFISSIONAL_INVALIDO');
    if (clash(p.lane)) throw new Error('HORARIO_INDISPONIVEL');
    lane = p.lane;
  } else {
    for (let l = 1; l <= cap; l++) if (!clash(l)) { lane = l; break; }
  }
  if (!lane) throw new Error('HORARIO_INDISPONIVEL');
  return { start, end, lane, price: Number(sz.price) || 0, phone };
}

/* ---------- padrões para um petshop novo ---------- */
const DEFAULT_HOURS = [
  { closed: true, open: '08:00', close: '12:00', break_start: '', break_end: '' },
  ...[1, 2, 3, 4, 5].map(() => ({ closed: false, open: '08:00', close: '18:00', break_start: '12:00', break_end: '13:00' })),
  { closed: false, open: '08:00', close: '13:00', break_start: '', break_end: '' },
];
const DEFAULT_SERVICES = [
  { name: 'Banho', description: 'Banho com shampoo neutro, secagem, escovação, limpeza de ouvidos e corte de unhas.', sort: 1,
    sizes: { P: { price: 45, min: 60 }, M: { price: 55, min: 60 }, G: { price: 75, min: 90 }, GG: { price: 95, min: 120 } } },
  { name: 'Banho + tosa higiênica', description: 'Banho completo e tosa nas patas, barriga e região íntima.', sort: 2,
    sizes: { P: { price: 60, min: 75 }, M: { price: 70, min: 90 }, G: { price: 95, min: 105 }, GG: { price: 120, min: 135 } } },
  { name: 'Banho + tosa completa', description: 'Banho e tosa na máquina ou tesoura, no estilo que você preferir.', sort: 3,
    sizes: { P: { price: 80, min: 120 }, M: { price: 95, min: 120 }, G: { price: 130, min: 150 }, GG: { price: 160, min: 180 } } },
];

/* =====================================================================
   ADAPTADOR DEMO — tudo no navegador (para apresentar aos petshops)
   ===================================================================== */
function DemoAdapter() {
  const KEY = 'pethora-demo-v2';
  let mem = null;
  const load = () => {
    if (mem) return mem;
    try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw); } catch (e) { /* armazenamento bloqueado */ }
    if (!mem || !mem.shops) mem = seed();
    return mem;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* segue em memória */ } };
  const delay = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 120));

  function seed() {
    const tz = 'America/Sao_Paulo';
    const shopId = 'demo-shop';
    const shop = {
      id: shopId, owner_id: 'demo', slug: 'patas-e-bolhas', name: 'Patas & Bolhas', tagline: 'Banho e tosa com hora marcada',
      logo_url: '', color: '#1F6F6B', whatsapp: '79999990000', address: 'Rua do Exemplo, 123 · Centro', instagram: 'patasebolhas',
      staff: ['Carla', 'Diego'], slot_interval: 30, min_notice: 60, max_days: 30, timezone: tz, active: true, remind_24h: true, remind_2h: false,
      deposit_enabled: true, deposit_percent: 30, cancel_hours: 24, mp_connected: true,
      hours: JSON.parse(JSON.stringify(DEFAULT_HOURS)),
    };
    const services = DEFAULT_SERVICES.map((s, i) => ({ id: 'demo-svc-' + (i + 1), shop_id: shopId, active: true, ...JSON.parse(JSON.stringify(s)) }));
    services.push({ id: 'demo-svc-4', shop_id: shopId, active: true, sort: 4, name: 'Hidratação de pelos', description: 'Máscara hidratante para pelos ressecados. Pode ser feita junto com o banho.',
      sizes: { P: { price: 35, min: 30 }, M: { price: 40, min: 30 }, G: { price: 50, min: 45 } } });
    // agendamentos de exemplo nos próximos dias úteis
    const bookings = [];
    const pets = [['Thor', 'Shih-tzu', 'Marina Costa', '79988110001'], ['Mel', 'Golden', 'Rafael Lima', '79988110002'], ['Pipoca', 'Poodle', 'Júlia Santos', '79988110003'],
      ['Luna', 'Lhasa Apso', 'Carlos Souza', '79988110004'], ['Bob', 'Vira-lata', 'Ana Paula', '79988110005'], ['Nina', 'Spitz', 'Pedro Alves', '79988110006']];
    // [minuto do dia, serviço, porte, profissional]
    const plans = [
      [[9 * 60, 0, 'P', 1], [9 * 60, 2, 'G', 2], [14 * 60, 1, 'M', 1], [14 * 60, 0, 'P', 2], [16 * 60, 0, 'M', 1]],
      [[10 * 60, 2, 'M', 1], [15 * 60, 0, 'GG', 2], [8 * 60, 3, 'P', 2]],
      [[9 * 60 + 30, 1, 'P', 1], [13 * 60, 0, 'G', 2]],
    ];
    const today = T.today(tz);
    let made = 0, k = 0;
    for (let i = 0; i < 12 && made < plans.length; i++) {
      const day = T.addDays(today, i);
      const h = shop.hours[T.dow(day)];
      if (h.closed || T.pm(h.close) < 17 * 60) continue;
      for (const [min, sv, size, lane] of plans[made]) {
        const svc = services[sv], z = svc.sizes[size];
        const start = T.toUtc(day, min, tz);
        const [pet, breed, cust, phone] = pets[k++ % pets.length];
        bookings.push({ id: uid(), shop_id: shopId, service_id: svc.id, service_name: svc.name, size, starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + z.min * 60000).toISOString(), lane, customer_name: cust, customer_phone: phone,
          pet_name: pet, pet_breed: breed, notes: '', price: z.price, status: 'confirmado', source: 'online', created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          reminder_24h_at: start.getTime() - Date.now() < 24 * 3600e3 ? new Date().toISOString() : null,
          deposit_status: k % 3 === 0 ? 'nenhum' : 'pago', deposit_amount: k % 3 === 0 ? 0 : Math.round(z.price * 30) / 100, pay_token: uid() });
      }
      made++;
    }
    return { shops: [shop], services, blocks: [], bookings };
  }

  const db = () => load();
  return {
    mode: 'demo',
    reset() { mem = seed(); save(); },
    async getShopBySlug(slug) { return delay(db().shops.find((s) => s.slug === slug) || db().shops[0]); },
    async listServices(shopId) { return delay(db().services.filter((s) => s.shop_id === shopId).sort((a, b) => a.sort - b.sort)); },
    async getBusy(shopId, from, to) {
      const f = new Date(from), t = new Date(to);
      const out = db().bookings.filter((b) => b.shop_id === shopId && DEPOSIT.live(b) && new Date(b.starts_at) < t && new Date(b.ends_at) > f)
        .map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at, lane: b.lane }))
        .concat(db().blocks.filter((k) => k.shop_id === shopId && new Date(k.starts_at) < t && new Date(k.ends_at) > f).map((k) => ({ starts_at: k.starts_at, ends_at: k.ends_at, lane: null })));
      return delay(out);
    },
    async createBooking(p, asOwner = false) {
      const d = db();
      const shop = d.shops.find((s) => s.id === p.shopId);
      const svc = d.services.find((s) => s.id === p.serviceId && s.shop_id === p.shopId);
      d.bookings.forEach((b) => { if (DEPOSIT.expired(b)) { b.status = 'cancelado'; b.deposit_status = 'expirado'; } });
      const mine = d.bookings.filter((b) => b.shop_id === p.shopId);
      const v = validateBooking(shop, svc, p, mine, d.blocks.filter((k) => k.shop_id === p.shopId), asOwner);
      const row = { id: uid(), shop_id: p.shopId, service_id: svc.id, service_name: svc.name, size: p.size, starts_at: v.start.toISOString(), ends_at: v.end.toISOString(),
        lane: v.lane, customer_name: p.customer.trim(), customer_phone: v.phone, pet_name: p.pet.trim(), pet_breed: (p.breed || '').trim(), notes: (p.notes || '').trim(),
        price: v.price, status: 'confirmado', source: asOwner ? 'painel' : 'online', created_at: new Date().toISOString(),
        deposit_status: 'nenhum', deposit_amount: 0, pay_token: uid() };
      if (!asOwner && DEPOSIT.active(shop) && v.price > 0) {
        row.deposit_status = 'pendente'; row.deposit_amount = DEPOSIT.amount(shop, v.price);
        row.hold_expires_at = new Date(Date.now() + 30 * 60000).toISOString();
      }
      d.bookings.push(row); save();
      const pend = row.deposit_status === 'pendente';
      return delay({ id: row.id, starts_at: row.starts_at, ends_at: row.ends_at, lane: row.lane, price: row.price,
        needs_payment: pend, deposit_amount: row.deposit_amount, hold_expires_at: row.hold_expires_at || null, pay_token: pend ? row.pay_token : null });
    },
    // Pix de mentira para a demonstração
    async pixCreate(id, token) {
      const b = db().bookings.find((x) => x.id === id && x.pay_token === token);
      if (!b || DEPOSIT.expired(b)) throw new Error('RESERVA_EXPIRADA');
      return delay({ demo: true, qr_code: '00020126580014BR.GOV.BCB.PIX0136demonstracao-pethora-pix-copia-e-cola5204000053039865406' + Number(b.deposit_amount).toFixed(2) + '5802BR6304DEMO',
        qr_code_base64: null, expires_at: b.hold_expires_at, amount: b.deposit_amount });
    },
    async bookingStatus(id, token) {
      const b = db().bookings.find((x) => x.id === id && x.pay_token === token);
      if (!b) return null;
      return delay({ status: b.status, deposit_status: DEPOSIT.expired(b) ? 'expirado' : b.deposit_status, hold_expires_at: b.hold_expires_at, deposit_amount: b.deposit_amount });
    },
    async demoPay(id) { const b = db().bookings.find((x) => x.id === id); b.deposit_status = 'pago'; b.hold_expires_at = null; save(); return delay(true); },
    async mpConnectUrl() { db().shops[0].mp_connected = true; save(); return null; },
    async mpDisconnect() { Object.assign(db().shops[0], { mp_connected: false, deposit_enabled: false }); save(); return delay(true); },
    async depositAction(id, acao, status) {
      const b = db().bookings.find((x) => x.id === id);
      b.status = status;
      if (b.deposit_status === 'pago') b.deposit_status = acao === 'devolver' ? 'devolvido' : 'retido';
      else if (b.deposit_status === 'pendente') b.deposit_status = 'expirado';
      save(); return delay(b);
    },
    // painel
    async session() { return { user: { id: 'demo', email: 'demo@pethora' } }; },
    async signIn() {}, async signUp() { return { needsConfirm: false }; }, async signOut() {},
    onAuth() {},
    async getMyShop() { return delay(db().shops[0]); },
    async createShop(data) { return delay(db().shops[0]); },
    async updateShop(id, patch) {
      const s = db().shops.find((x) => x.id === id);
      if (patch.slug && db().shops.some((x) => x.id !== id && x.slug === patch.slug)) throw new Error('SLUG_EM_USO');
      delete patch.active; delete patch.owner_id;
      Object.assign(s, patch); save(); return delay(s);
    },
    async saveService(svc) {
      const d = db();
      if (svc.id) { const i = d.services.findIndex((x) => x.id === svc.id); d.services[i] = { ...d.services[i], ...svc }; save(); return delay(d.services[i]); }
      const row = { ...svc, id: uid() }; d.services.push(row); save(); return delay(row);
    },
    async deleteService(id) { const d = db(); d.services = d.services.filter((s) => s.id !== id); save(); return delay(true); },
    async listBlocks(shopId) { return delay(db().blocks.filter((k) => k.shop_id === shopId && new Date(k.ends_at) > new Date(Date.now() - 86400000)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))); },
    async addBlock(b) { const row = { ...b, id: uid() }; db().blocks.push(row); save(); return delay(row); },
    async deleteBlock(id) { const d = db(); d.blocks = d.blocks.filter((k) => k.id !== id); save(); return delay(true); },
    async listBookings(shopId, from, to) {
      return delay(db().bookings.filter((b) => b.shop_id === shopId && b.starts_at >= from && b.starts_at < to).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    },
    async setBookingStatus(id, status) { const b = db().bookings.find((x) => x.id === id); b.status = status; save(); return delay(b); },
  };
}

/* =====================================================================
   ADAPTADOR SUPABASE — produção (vários petshops, dados reais)
   ===================================================================== */
const sbOk = ({ data, error }) => { if (error) throw new Error(error.message || error.code); return data; };
function SupabaseAdapter(sb) {
  const ok = ({ data, error }) => { if (error) throw new Error(error.message || error.code); return data; };
  return {
    mode: 'cloud',
    async getShopBySlug(slug) { return ok(await sb.from('shops').select('*').eq('slug', slug).maybeSingle()); },
    async listServices(shopId) { return ok(await sb.from('services').select('*').eq('shop_id', shopId).order('sort').order('created_at')); },
    async getBusy(shopId, from, to) { return ok(await sb.rpc('get_busy', { p_shop: shopId, p_from: from, p_to: to })); },
    async createBooking(p) {
      return ok(await sb.rpc('create_booking', {
        p_shop: p.shopId, p_service: p.serviceId, p_size: p.size, p_start: p.start, p_customer: p.customer, p_phone: p.phone,
        p_pet: p.pet, p_breed: p.breed || '', p_notes: p.notes || '', p_lane: p.lane || null,
      }));
    },
    async pixCreate(id, token, email) { return fnCall(sb, 'mp-pix', { booking_id: id, token, email }); },
    async bookingStatus(id, token) { return ok(await sb.rpc('booking_status', { p_id: id, p_token: token })); },
  };
}

/* chama uma função do servidor e devolve o erro com o código certo */
async function fnCall(sb, name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; if (j.detalhe) console.warn(name, j.detalhe); } catch (e) { /* sem corpo */ }
    throw new Error(msg);
  }
  return data;
}

const toBusy = (rows) => rows.map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at), lane: r.lane == null ? null : Number(r.lane) }));


/* PetHora — peças de interface usadas pelos dois sites (cliente e painel) */

const ICON = {
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2.2 4.1 4.5 4.6l1-1.1 1.8.8c-.2 1-1 1.7-2 1.7-3.3 0-6.4-3.1-6.4-6.4 0-1 .7-1.8 1.7-2l.8 1.8z"/></svg>',
  ig: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  check: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  paw: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="7" cy="9" rx="2" ry="2.6"/><ellipse cx="12" cy="6.5" rx="2" ry="2.6"/><ellipse cx="17" cy="9" rx="2" ry="2.6"/><path d="M12 11.5c-3 0-5.5 3.6-5.5 5.6 0 1.6 1.4 2.4 2.9 2.4 1 0 1.7-.5 2.6-.5s1.6.5 2.6.5c1.5 0 2.9-.8 2.9-2.4 0-2-2.5-5.6-5.5-5.6z"/></svg>',
  cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  scissors: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  store: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/></svg>',
  bulb: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>',
  tick: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
};

function toast(msg, kind = '') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6500 : 3500);
}
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const reveal = (el) => el && setTimeout(() => el.scrollIntoView({ behavior: smooth(), block: 'start' }), 60);

function logoHtml(shop, cls = 'logo') {
  return `<div class="${cls}">${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : esc(initials(shop.name))}</div>`;
}
function heroHtml(shop) {
  return `<header class="shop-hero"><div class="in gutter">${logoHtml(shop)}
    <div style="min-width:0"><h1>${esc(shop.name)}</h1>${shop.tagline ? `<p>${esc(shop.tagline)}</p>` : ''}</div></div></header>`;
}
function contactHtml(shop) {
  const bits = [];
  if (shop.address) bits.push(`<span>${ICON.pin}<b>${esc(shop.address)}</b></span>`);
  if (shop.whatsapp) bits.push(`<span>${ICON.wa}<a href="${esc(waLink(shop.whatsapp, 'Olá! Vim pela página de agendamento.'))}" target="_blank" rel="noopener"><b>${esc(fmtPhone(shop.whatsapp))}</b></a></span>`);
  if (shop.instagram) bits.push(`<span>${ICON.ig}<a href="https://instagram.com/${esc(shop.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener"><b>@${esc(shop.instagram.replace(/^@/, ''))}</b></a></span>`);
  return bits.length ? `<div class="card contact">${bits.join('')}</div>` : '';
}


/* PetHora — acesso a dados exclusivo do painel (login, configurações, agenda completa).
   Só entra no site do painel. As regras do banco (RLS) garantem que cada petshop só mexe nos próprios dados. */
function SupabaseAdminAdapter(sb) {
  const ok = sbOk;
  return Object.assign(SupabaseAdapter(sb), {
    async mpConnectUrl(returnUrl) { return (await fnCall(sb, 'mp-conectar', { return_url: returnUrl })).url; },
    async mpDisconnect() { return fnCall(sb, 'mp-conectar', { acao: 'desconectar' }); },
    async depositAction(id, acao, status) { return (await fnCall(sb, 'mp-sinal', { booking_id: id, acao, status })).booking; },
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) { const d = ok(await sb.auth.signUp({ email, password })); return { needsConfirm: !d.session }; },
    async signOut() { await sb.auth.signOut(); },
    onAuth(fn) { sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') fn(ev); }); },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteRoot() })); },
    async getMyShop() {
      const s = await this.session(); if (!s) return null;
      return ok(await sb.from('shops').select('*').eq('owner_id', s.user.id).maybeSingle());
    },
    async createShop(data) {
      const s = await this.session();
      const shop = ok(await sb.from('shops').insert({ ...data, owner_id: s.user.id, hours: DEFAULT_HOURS }).select().single());
      ok(await sb.from('services').insert(DEFAULT_SERVICES.map((x) => ({ ...x, shop_id: shop.id }))));
      return shop;
    },
    async updateShop(id, patch) { delete patch.active; delete patch.owner_id; return ok(await sb.from('shops').update(patch).eq('id', id).select().single()); },
    async saveService(svc) {
      const { id, ...rest } = svc;
      if (id) return ok(await sb.from('services').update(rest).eq('id', id).select().single());
      return ok(await sb.from('services').insert(rest).select().single());
    },
    async deleteService(id) { ok(await sb.from('services').delete().eq('id', id)); return true; },
    async listBlocks(shopId) { return ok(await sb.from('blocks').select('*').eq('shop_id', shopId).gt('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at')); },
    async addBlock(b) { return ok(await sb.from('blocks').insert(b).select().single()); },
    async deleteBlock(id) { ok(await sb.from('blocks').delete().eq('id', id)); return true; },
    async listBookings(shopId, from, to) { return ok(await sb.from('bookings').select('*').eq('shop_id', shopId).gte('starts_at', from).lt('starts_at', to).order('starts_at')); },
    async setBookingStatus(id, status) { return ok(await sb.from('bookings').update({ status }).eq('id', id).select().single()); },
  });
}


/* PetHora — painel do petshop */

function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="card modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  const first = bg.querySelector('input, select, textarea, button:not(.x)');
  if (first) first.focus();
  if (onMount) onMount(bg.firstElementChild, close);
  return close;
}
const mhead = (title, sub = '') => `<div class="modal-head"><div><h2>${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div><button class="x" data-close aria-label="Fechar">×</button></div>`;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado!'); } catch (e) { toast('Não deu para copiar. Selecione o texto e copie manualmente.'); }
}
function shopLink(shop) {
  if (CLOUD) return `${clienteBase()}/${shop.slug}`;
  return `agenda.seusite.com.br/${shop.slug}`;
}

/* ---------- login (produção) ---------- */
function AuthPage(api, mount, onDone) {
  applyBrand('#1F6F6B');
  document.title = 'PetHora · Painel do petshop';
  let mode = 'in';
  const draw = () => {
    mount.innerHTML = `<div class="auth gutter"><div class="brandmark"><i>${ICON.paw}</i>PetHora</div>
      <div class="card"><div class="seg2"><button type="button" data-m="in" aria-pressed="${mode === 'in'}">Entrar</button><button type="button" data-m="up" aria-pressed="${mode === 'up'}">Criar conta</button></div>
      <h2>${mode === 'in' ? 'Painel do petshop' : 'Cadastre seu petshop'}</h2>
      <form id="au" class="grid2" style="grid-template-columns:1fr" novalidate>
        <label class="field"><span>E-mail</span><input class="input" id="au-email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Senha</span><input class="input" id="au-pass" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="6" required></label>
        <button class="btn primary block" type="submit">${mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
        ${mode === 'in' ? '<button class="btn ghost sm" type="button" id="au-forgot">Esqueci minha senha</button>' : ''}
      </form></div></div>`;
    $$('[data-m]', mount).forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
    const fg = $('#au-forgot');
    if (fg) fg.onclick = async () => {
      const email = $('#au-email').value.trim();
      if (!email) return toast('Digite seu e-mail primeiro.', 'bad');
      try { await api.resetPassword(email); toast('Enviamos um link para redefinir a senha.'); } catch (e) { toast(errMsg(e), 'bad'); }
    };
    $('#au').onsubmit = async (ev) => {
      ev.preventDefault();
      const email = $('#au-email').value.trim(), pass = $('#au-pass').value;
      if (!email || pass.length < 6) return toast('Preencha o e-mail e uma senha de pelo menos 6 caracteres.', 'bad');
      const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (mode === 'in') { await api.signIn(email, pass); onDone(); }
        else {
          const r = await api.signUp(email, pass);
          if (r.needsConfirm) { mount.innerHTML = `<div class="auth gutter"><div class="card"><h2>Confirme seu e-mail</h2><p class="muted">Enviamos um link para <b>${esc(email)}</b>. Clique nele e depois volte aqui para entrar.</p><button class="btn" id="back">Voltar ao login</button></div></div>`; $('#back').onclick = () => { mode = 'in'; draw(); }; }
          else onDone();
        }
      } catch (e) { toast(errMsg(e), 'bad'); btn.disabled = false; }
    };
  };
  draw();
}

function OnboardingPage(api, mount, onDone) {
  mount.innerHTML = `<div class="auth gutter"><div class="brandmark"><i>${ICON.paw}</i>PetHora</div><div class="card">
    <h2>Vamos criar a página do seu petshop</h2><p class="muted small">Você pode mudar tudo isso depois no painel.</p>
    <form id="ob" class="grid2" style="grid-template-columns:1fr" novalidate>
      <label class="field"><span>Nome do petshop</span><input class="input" id="ob-name" required maxlength="80"></label>
      <label class="field"><span>Link da página</span><input class="input" id="ob-slug" required maxlength="42" placeholder="nome-do-petshop"><small class="muted" id="ob-prev"></small></label>
      <label class="field"><span>WhatsApp do petshop</span><input class="input num" id="ob-wa" inputmode="tel" placeholder="(79) 99999-0000"></label>
      <button class="btn primary block" type="submit">Criar minha página</button></form></div></div>`;
  let touched = false;
  const prev = () => ($('#ob-prev').textContent = `${clienteBase()}/${$('#ob-slug').value || '...'}`);
  $('#ob-name').oninput = (e) => { if (!touched) $('#ob-slug').value = slugify(e.target.value); prev(); };
  $('#ob-slug').oninput = (e) => { touched = true; e.target.value = slugify(e.target.value); prev(); };
  $('#ob-wa').oninput = (e) => (e.target.value = fmtPhone(e.target.value));
  prev();
  $('#ob').onsubmit = async (ev) => {
    ev.preventDefault();
    const name = $('#ob-name').value.trim(), slug = slugify($('#ob-slug').value);
    if (name.length < 2 || slug.length < 3) return toast('Preencha o nome e um link com pelo menos 3 letras.', 'bad');
    try { await api.createShop({ name, slug, whatsapp: digits($('#ob-wa').value), tagline: 'Banho e tosa com hora marcada' }); onDone(); } catch (e) { toast(errMsg(e), 'bad'); }
  };
}

async function AdminPage(api, mount, opts = {}) {
  let shop;
  if (CLOUD) {
    const s = await api.session();
    if (!s) return AuthPage(api, mount, () => AdminPage(api, mount, opts));
    shop = await api.getMyShop();
    if (!shop) return OnboardingPage(api, mount, () => AdminPage(api, mount, opts));
  } else shop = await api.getMyShop();

  applyBrand(shop.color);
  document.title = `Painel · ${shop.name}`;
  const qp = new URLSearchParams(location.search);
  if (qp.get('mp')) {
    setTimeout(() => toast(qp.get('mp') === 'ok' ? 'Mercado Pago conectado! Agora ligue o sinal em Horários.' : 'Não deu para conectar o Mercado Pago: ' + (qp.get('mp_msg') || 'tente de novo.'), qp.get('mp') === 'ok' ? '' : 'bad'), 300);
    history.replaceState(null, '', location.pathname);
    if (qp.get('mp') === 'ok') opts.tab = 'horarios';
  }
  const A = { shop, services: await api.listServices(shop.id), tab: opts.tab || 'agenda', ds: T.today(shop.timezone), bookings: [], blocks: [], timer: null };
  const tz = () => A.shop.timezone || 'America/Sao_Paulo';
  const staff = () => A.shop.staff || [];

  /* ---------- estrutura: menu lateral (computador) e barra inferior (celular) ---------- */
  const NAV = [
    ['agenda', 'Agenda', 'Quem vem e quando', ICON.cal],
    ['servicos', 'Serviços', 'Preço e tempo por porte', ICON.scissors],
    ['horarios', 'Horários', 'Funcionamento e equipe', ICON.clock],
    ['marca', 'Sua página', 'Visual e link dos clientes', ICON.store],
  ];
  const stepsKey = () => 'pethora-steps-' + A.shop.id;
  const steps = () => { try { return JSON.parse(localStorage.getItem(stepsKey()) || '{}'); } catch (e) { return {}; } };
  const markStep = (k) => { const s = steps(); if (s[k]) return; s[k] = 1; try { localStorage.setItem(stepsKey(), JSON.stringify(s)); } catch (e) { /* ok */ } };

  const drawShell = () => {
    const pageBtn = CLOUD ? `<a class="btn sm" href="${esc(shopLink(A.shop))}" target="_blank" rel="noopener">Ver minha página</a>`
      : window.PETHORA_DEMO_COMBINED ? `<button class="btn sm" data-seepage>Ver minha página</button>` : '';
    mount.innerHTML = `<div class="adm">
      <aside class="side" aria-label="Menu do painel">
        <div class="side-brand">${logoHtml(A.shop, 'logo')}<div style="min-width:0"><div class="name">${esc(A.shop.name)}</div><div class="small muted">Painel do petshop</div></div></div>
        <nav class="side-nav">${NAV.map(([k, l, d, ic]) => `<button class="nav-i" data-tab="${k}" aria-current="${A.tab === k ? 'page' : 'false'}">${ic}<span><b>${l}</b><small>${d}</small></span></button>`).join('')}</nav>
        <div class="side-foot"><p class="eyebrow">Link dos clientes</p><code class="side-link">${esc(shopLink(A.shop))}</code>
          <div class="row" style="gap:6px"><button class="btn sm" data-copylink>Copiar</button>${pageBtn}</div>
          ${CLOUD ? '<button class="btn sm ghost" data-logout>Sair do painel</button>' : ''}</div>
      </aside>
      <div class="adm-body">
        <header class="m-top gutter">${logoHtml(A.shop, 'logo')}<div style="min-width:0"><div class="name">${esc(A.shop.name)}</div><div class="small muted">Painel do petshop</div></div>
          <div class="sp">${pageBtn.replace('Ver minha página', 'Minha página')}${CLOUD ? '<button class="btn sm ghost" data-logout>Sair</button>' : ''}</div></header>
        <main class="adm-main gutter" id="adm"></main>
      </div>
      <nav class="bnav" aria-label="Menu do painel">${NAV.map(([k, l, , ic]) => `<button data-tab="${k}" aria-current="${A.tab === k ? 'page' : 'false'}">${ic}<span>${l}</span></button>`).join('')}</nav>
    </div>`;
    $$('[data-tab]', mount).forEach((b) => (b.onclick = () => go2(b.dataset.tab)));
    $$('[data-logout]', mount).forEach((b) => (b.onclick = async () => { await api.signOut(); location.reload(); }));
    $$('[data-seepage]', mount).forEach((b) => (b.onclick = () => { location.hash = 'cliente'; }));
    $$('[data-copylink]', mount).forEach((b) => (b.onclick = () => { markStep('link'); copyText(shopLink(A.shop)); }));
  };
  const go2 = (tab) => {
    A.tab = tab;
    $$('[data-tab]', mount).forEach((x) => x.setAttribute('aria-current', x.dataset.tab === tab ? 'page' : 'false'));
    window.scrollTo(0, 0);
    drawTab();
  };
  const drawTab = () => {
    clearInterval(A.timer);
    if (A.tab === 'servicos') markStep('servicos');
    ({ agenda: Agenda, servicos: Services, horarios: Hours, marca: Brand })[A.tab]();
  };
  const tip = (html) => `<div class="tip">${ICON.bulb}<p>${html}</p></div>`;
  const laneColor = (l) => `var(--lane${((l - 1) % 6) + 1})`;
  const laneChip = (l) => `<span class="lane-chip" style="--c:${laneColor(l)}"><i></i>${esc(staff()[l - 1] || 'Profissional ' + l)}</span>`;

  /* =================== AGENDA =================== */
  A.view = 'lista';
  A.weekStart = T.today(tz());
  A.week = [];
  async function loadDay() {
    if (A.ds < A.weekStart || A.ds >= T.addDays(A.weekStart, 7)) A.weekStart = A.ds;
    const from = T.toUtc(A.weekStart, 0, tz()).toISOString(), to = T.toUtc(T.addDays(A.weekStart, 7), 0, tz()).toISOString();
    const [bk, bl] = await Promise.all([api.listBookings(A.shop.id, from, to), api.listBlocks(A.shop.id)]);
    A.week = bk;
    const dFrom = T.toUtc(A.ds, 0, tz()).toISOString(), dTo = T.toUtc(T.addDays(A.ds, 1), 0, tz()).toISOString();
    A.bookings = bk.filter((b) => b.starts_at >= dFrom && b.starts_at < dTo);
    A.blocks = bl.filter((k) => k.starts_at < dTo && k.ends_at > dFrom);
  }
  async function Agenda() {
    const el = $('#adm');
    el.innerHTML = `<section class="card panel"><div class="skeleton"></div><div class="skeleton" style="height:240px"></div></section>`;
    try { await loadDay(); } catch (e) { el.innerHTML = `<div class="notice">${esc(errMsg(e))}</div>`; return; }
    drawAgenda();
    A.timer = setInterval(async () => { if (document.visibilityState !== 'visible' || A.tab !== 'agenda' || $('.modal-bg')) return; try { await loadDay(); drawAgenda(); } catch (e) { /* tenta de novo */ } }, 45000);
  }
  async function go(ds) { A.ds = ds; await loadDay(); drawAgenda(); }

  const fromNow = (ms) => { const m = Math.round(ms / 60000); if (m < 60) return `daqui a ${m} min`; const h = Math.floor(m / 60), r = m % 60; return `daqui a ${h}h${r ? String(r).padStart(2, '0') : ''}`; };
  function dayTitle() {
    const today = T.today(tz());
    const lbl = T.label(A.ds);
    if (A.ds === today) return `Hoje <span>${esc(lbl)}</span>`;
    if (A.ds === T.addDays(today, 1)) return `Amanhã <span>${esc(lbl)}</span>`;
    if (A.ds === T.addDays(today, -1)) return `Ontem <span>${esc(lbl)}</span>`;
    return esc(lbl.charAt(0).toUpperCase() + lbl.slice(1));
  }

  function checklistHtml() {
    const s = steps();
    if (s.hidden) return '';
    const items = [
      ['servicos', 'Confira seus serviços e preços', 'servicos'],
      ['horarios', 'Ajuste dias, horários e equipe', 'horarios'],
      ['marca', 'Coloque seu logo e sua cor', 'marca'],
      ['link', 'Copie o link e divulgue para os clientes', 'marca'],
    ];
    const done = items.filter(([k]) => s[k]).length;
    if (done === items.length) return '';
    return `<section class="card panel steps"><div class="panel-head"><div><h2>Primeiros passos</h2><p class="muted small">${done} de ${items.length} concluídos. Faça uma vez e a agenda passa a funcionar sozinha.</p></div>
      <button class="btn sm ghost" data-hidesteps>Esconder</button></div>
      <div class="progress" aria-hidden="true"><i style="width:${(done / items.length) * 100}%"></i></div>
      <ol class="step-list">${items.map(([k, t, tab]) => `<li class="${s[k] ? 'done' : ''}"><span class="ck">${s[k] ? ICON.tick : ''}</span><span>${t}</span>${s[k] ? '' : `<button class="btn sm" data-goto="${tab}">Fazer agora</button>`}</li>`).join('')}</ol></section>`;
  }

  function drawAgenda() {
    const el = $('#adm');
    const today = T.today(tz());
    const nowMs = Date.now();
    const active = A.bookings.filter((b) => DEPOSIT.live(b));
    const done = active.filter((b) => b.status === 'concluido').length;
    const todo = active.filter((b) => b.status === 'confirmado').length;
    const revenue = active.filter((b) => b.status !== 'faltou').reduce((s, b) => s + Number(b.price || 0), 0);
    const next = A.ds === today ? active.find((b) => new Date(b.starts_at).getTime() > nowMs && b.status === 'confirmado') : active[0];
    const h = A.shop.hours[T.dow(A.ds)];

    // semana
    const days = Array.from({ length: 7 }, (_, i) => T.addDays(A.weekStart, i));
    const weekHtml = `<section class="card wk" aria-label="Escolher dia">
      <button class="btn sm ghost" id="w-prev" aria-label="Semana anterior">‹</button>
      <div class="wk-days">${days.map((ds) => {
        const hh = A.shop.hours[T.dow(ds)];
        const n = A.week.filter((b) => DEPOSIT.live(b) && T.parts(new Date(b.starts_at), tz()).ds === ds).length;
        const closed = !hh || hh.closed;
        return `<button class="wday ${ds === today ? 'is-today' : ''}" data-day="${ds}" aria-pressed="${ds === A.ds}">
          <span class="w">${ds === today ? 'hoje' : esc(T.label(ds, { weekday: 'short' }).replace('.', ''))}</span><span class="n">${ds.slice(8)}</span>
          <span class="c">${closed && !n ? 'fechado' : n ? `${n} pet${n > 1 ? 's' : ''}` : 'livre'}</span></button>`;
      }).join('')}</div>
      <button class="btn sm ghost" id="w-next" aria-label="Próxima semana">›</button></section>`;

    // números do dia
    const nextHtml = next
      ? `<b class="num">${T.time(new Date(next.starts_at), tz())} · ${esc(next.pet_name)}</b><small>${A.ds === today ? fromNow(new Date(next.starts_at).getTime() - nowMs) + ' · ' : ''}${esc(next.service_name)}</small>`
      : `<b>${A.ds === today && active.length ? 'Dia encerrado' : 'Nenhum'}</b><small>${A.ds === today && active.length ? 'Todos os atendimentos já passaram' : 'Sem atendimentos marcados'}</small>`;
    const kpis = `<div class="kpis">
      <div class="kpi"><span class="eyebrow">Pets agendados</span><b class="num">${active.length}</b><small>${done} concluído${done === 1 ? '' : 's'} · ${todo} a fazer</small></div>
      <div class="kpi"><span class="eyebrow">Faturamento previsto</span><b class="num">${brl(revenue)}</b><small>Sem contar cancelados e faltas</small></div>
      <div class="kpi"><span class="eyebrow">${A.ds === today ? 'Próximo atendimento' : 'Primeiro atendimento'}</span>${nextHtml}</div></div>`;

    el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Agenda</p><h1 class="day-title">${dayTitle()}</h1></div>
        <div class="row"><input type="date" class="input" id="d-pick" value="${A.ds}" aria-label="Ir para uma data" title="Ir para uma data">
        <button class="btn primary" id="new-bk">${ICON.plus} Novo agendamento</button></div></div>
      ${checklistHtml()}
      ${weekHtml}
      ${kpis}
      <section class="card panel">
        <div class="panel-head"><h2>Atendimentos do dia</h2>
          <div class="seg2 sm" role="group" aria-label="Forma de ver"><button type="button" data-view="lista" aria-pressed="${A.view === 'lista'}">Lista por horário</button><button type="button" data-view="equipe" aria-pressed="${A.view === 'equipe'}">Por profissional</button></div></div>
        ${(!h || h.closed) && !active.length ? `<div class="empty">O petshop não abre neste dia. Para mudar, vá em <b>Horários</b>.</div>` : A.view === 'lista' ? listHtml() : lanesHtml()}
      </section>`;

    $('#d-pick').onchange = (e) => e.target.value && go(e.target.value);
    $('#new-bk').onclick = () => newBooking({});
    $('#w-prev').onclick = () => { A.weekStart = T.addDays(A.weekStart, -7); go(A.weekStart); };
    $('#w-next').onclick = () => { A.weekStart = T.addDays(A.weekStart, 7); go(A.weekStart); };
    $$('[data-day]', el).forEach((b) => (b.onclick = () => go(b.dataset.day)));
    $$('[data-view]', el).forEach((b) => (b.onclick = () => { A.view = b.dataset.view; drawAgenda(); }));
    $$('[data-goto]', el).forEach((b) => (b.onclick = () => go2(b.dataset.goto)));
    const hs = $('[data-hidesteps]', el); if (hs) hs.onclick = () => { markStep('hidden'); drawAgenda(); };
    $$('[data-bk]', el).forEach((c) => (c.onclick = (e) => { if (e.target.closest('[data-quick], a')) return; detail(A.bookings.find((x) => x.id === c.dataset.bk)); }));
    $$('[data-quick]', el).forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      try { await api.setBookingStatus(b.dataset.quick, 'concluido'); toast('Atendimento concluído.'); await loadDay(); drawAgenda(); } catch (err) { toast(errMsg(err), 'bad'); }
    }));
    const fb = $('[data-first]', el); if (fb) fb.onclick = () => newBooking({});
    $$('[data-free]', el).forEach((b) => (b.onclick = () => newBooking({ lane: Number(b.dataset.lane), min: Number(b.dataset.free) })));
  }

  /* situação do lembrete automático de um atendimento */
  function reminderState(b) {
    if (b.reminder_error) return { cls: 'bad', txt: 'Lembrete não entregue', tip: b.reminder_error };
    if (b.reminder_24h_at || b.reminder_2h_at) return { cls: 'ok', txt: 'Lembrete enviado' };
    if (b.status !== 'confirmado' || b.deposit_status === 'pendente') return null;
    const st = new Date(b.starts_at).getTime(), cr = new Date(b.created_at || 0).getTime(), now = Date.now();
    if (st <= now) return null;
    const win = [];
    if (A.shop.remind_24h !== false && st - cr >= 12 * 3600e3) win.push([st - 24 * 3600e3, st - 2 * 3600e3]);
    if (A.shop.remind_2h && st - cr >= 3 * 3600e3) win.push([st - 2 * 3600e3, st]);
    for (const [from, to] of win) {
      if (now < from) { const p = T.parts(new Date(from), tz()); return { cls: 'wait', txt: `Lembrete automático ${T.short(p.ds)} às ${T.hm(p.min)}` }; }
      if (now < to) return { cls: 'wait', txt: 'Lembrete sai em instantes' };
    }
    return null;
  }
  function depositState(b) {
    const ds = DEPOSIT.expired(b) ? 'expirado' : b.deposit_status;
    if (ds === 'pendente') { const p = T.parts(new Date(b.hold_expires_at), tz()); return { cls: 'wait', txt: `Aguardando Pix até ${T.hm(p.min)}` }; }
    if (ds === 'pago') return { cls: 'ok', txt: `Sinal pago ${brl(b.deposit_amount)}` };
    if (ds === 'devolvido') return { cls: '', txt: `Sinal devolvido ${brl(b.deposit_amount)}` };
    if (ds === 'retido') return { cls: 'bad', txt: `Sinal retido ${brl(b.deposit_amount)}` };
    if (ds === 'expirado') return { cls: 'bad', txt: 'Pix não pago, horário liberado' };
    return null;
  }
  const depositHtml = (b) => { const r = depositState(b); return r ? `<span class="dep ${r.cls}">${r.cls === 'ok' ? ICON.tick : '●'} ${esc(r.txt)}</span>` : ''; };
  const statusLabel = (b) => (b.deposit_status === 'pendente' && !DEPOSIT.expired(b) ? 'Aguardando Pix' : STATUS[b.status]);
  const statusCls = (b) => (b.deposit_status === 'pendente' && !DEPOSIT.expired(b) ? 'pix' : b.status);
  const reminderHtml = (b) => { const r = reminderState(b); return r ? `<span class="rem ${r.cls}" ${r.tip ? `title="${esc(r.tip)}"` : ''}>${r.cls === 'ok' ? ICON.tick : ICON.wa}${esc(r.txt)}</span>` : ''; };

  /* lista por horário, separada por período, com a marca de "agora" */
  function listHtml() {
    const today = T.today(tz());
    const rows = A.bookings.filter((b) => DEPOSIT.live(b));
    const canc = A.bookings.filter((b) => !DEPOSIT.live(b));
    if (!rows.length && !canc.length) return `<div class="empty">Nenhum atendimento neste dia ainda.<br><button class="btn sm primary" style="margin-top:10px" data-first>Marcar o primeiro</button></div>`;
    const nowMin = A.ds === today ? T.parts(new Date(), tz()).min : null;
    const card = (b) => {
      const s = new Date(b.starts_at), e = new Date(b.ends_at);
      const sm = T.parts(s, tz()).min, em = T.parts(e, tz()).min || 1440;
      const late = nowMin != null && b.status === 'confirmado' && em <= nowMin;
      const remind = waLink(b.customer_phone, `Olá, ${b.customer_name.split(' ')[0]}! Aqui é do ${A.shop.name}. Lembrete: ${b.service_name.toLowerCase()} do(a) ${b.pet_name} hoje às ${T.time(s, tz())}. Até já!`);
      return `<article class="ag ${b.status}" data-bk="${esc(b.id)}" tabindex="0" style="--c:${laneColor(b.lane)}">
        <div class="ag-time"><b class="num">${T.hm(sm)}</b><span class="num">até ${T.hm(em % 1440)}</span><small>${dur(em - sm)}</small></div>
        <div class="ag-main"><p class="ag-pet">${esc(b.pet_name)}${b.pet_breed ? ` <span>${esc(b.pet_breed)}</span>` : ''}</p>
          <p class="ag-svc">${esc(b.service_name)} <span class="size-chip">Porte ${esc(b.size)}</span></p>
          <p class="ag-meta"><span>${ICON.user}${esc(b.customer_name)}</span>${laneChip(b.lane)}</p>
          ${b.notes ? `<p class="ag-note">“${esc(b.notes)}”</p>` : ''}${depositHtml(b)}${reminderHtml(b)}</div>
        <div class="ag-side"><span class="pill ${statusCls(b)}">${late ? 'Aguardando conclusão' : statusLabel(b)}</span><span class="num ag-price">${brl(b.price)}</span>
          <div class="row ag-actions">${b.status === 'confirmado' ? `<button class="btn sm" data-quick="${esc(b.id)}">${ICON.tick} Concluir</button>` : ''}
          ${remind && b.status === 'confirmado' ? `<a class="btn sm ghost" href="${esc(remind)}" target="_blank" rel="noopener" aria-label="Avisar no WhatsApp">${ICON.wa}</a>` : ''}</div></div>
      </article>`;
    };
    const periods = [['Manhã', 0, 720], ['Tarde', 720, 1080], ['Noite', 1080, 1441]];
    let out = '';
    for (const [name, a, z] of periods) {
      const list = rows.filter((b) => { const m = T.parts(new Date(b.starts_at), tz()).min; return m >= a && m < z; });
      if (!list.length) continue;
      out += `<div class="period-h"><span>${name}</span><small>${list.length} atendimento${list.length > 1 ? 's' : ''}</small></div><div class="ag-list">`;
      let nowPut = false;
      for (const b of list) {
        const m = T.parts(new Date(b.starts_at), tz()).min;
        if (nowMin != null && !nowPut && m > nowMin && nowMin >= a && nowMin < z) { out += `<div class="now-line"><span>Agora · ${T.hm(nowMin)}</span></div>`; nowPut = true; }
        out += card(b);
      }
      out += `</div>`;
    }
    if (canc.length) out += `<details class="canc"><summary>${canc.length} cancelado${canc.length > 1 ? 's' : ''} neste dia</summary><div class="ag-list">${canc.map(card).join('')}</div></details>`;
    return `<p class="legend small muted">Toque num atendimento para ver os detalhes, avisar o tutor ou cancelar.</p>` + out;
  }

  /* uma faixa por profissional: ocupado, livre e almoço lado a lado */
  function lanesHtml() {
    const h = A.shop.hours[T.dow(A.ds)];
    const loc = (iso) => T.parts(new Date(iso), tz()).min;
    const shown = A.bookings.filter((b) => DEPOSIT.live(b));
    let start = h && !h.closed ? T.pm(h.open) : 8 * 60, end = h && !h.closed ? T.pm(h.close) : 18 * 60;
    shown.forEach((b) => { start = Math.min(start, loc(b.starts_at)); end = Math.max(end, loc(b.ends_at) || 1440); });
    start = Math.floor(start / 60) * 60; end = Math.min(1440, Math.ceil(end / 60) * 60);
    const span = end - start;
    const pct = (m) => ((m - start) / span) * 100;
    const offs = [];
    if (h && !h.closed && T.pm(h.break_start) != null && T.pm(h.break_end) > T.pm(h.break_start)) offs.push([T.pm(h.break_start), T.pm(h.break_end), 'Almoço']);
    A.blocks.forEach((k) => {
      const s = new Date(k.starts_at) < T.toUtc(A.ds, 0, tz()) ? start : Math.max(start, loc(k.starts_at));
      const e = new Date(k.ends_at) >= T.toUtc(T.addDays(A.ds, 1), 0, tz()) ? end : Math.min(end, loc(k.ends_at));
      if (e > s) offs.push([s, e, k.reason || 'Bloqueado']);
    });
    const openS = h && !h.closed ? T.pm(h.open) : start, openE = h && !h.closed ? T.pm(h.close) : start;
    const lanes = Math.max(staff().length, ...shown.map((b) => b.lane));
    const nowMin = A.ds === T.today(tz()) ? T.parts(new Date(), tz()).min : null;
    let ticks = '';
    for (let m = start; m <= end; m += 60) ticks += `<span style="left:${pct(m)}%">${String(m / 60).padStart(2, '0')}h</span>`;
    let rows = '';
    for (let l = 1; l <= lanes; l++) {
      const mine = shown.filter((b) => b.lane === l).map((b) => [loc(b.starts_at), loc(b.ends_at) || 1440, b]);
      // espaços livres = expediente menos almoço, bloqueios e atendimentos
      let free = [[Math.max(openS, nowMin != null ? Math.ceil(nowMin / 15) * 15 : openS), openE]];
      for (const [a, z] of [...offs, ...mine]) free = free.flatMap(([fa, fz]) => (z <= fa || a >= fz ? [[fa, fz]] : [[fa, a], [z, fz]]));
      free = free.filter(([a, z]) => z - a >= 15);
      const busyMin = mine.reduce((s, [a, z]) => s + (z - a), 0);
      const freeMin = free.reduce((s, [a, z]) => s + (z - a), 0);
      const seg = (a, z, cls, inner, attrs = '') => `<${cls.startsWith('free') ? 'button' : 'div'} class="sg ${cls}" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%" ${attrs}>${inner}</${cls.startsWith('free') ? 'button' : 'div'}>`;
      rows += `<div class="lane-row" style="--c:${laneColor(l)}">
        <div class="lane-name"><i></i><div><b>${esc(staff()[l - 1] || 'Profissional removido')}</b><small>${mine.length} atendimento${mine.length === 1 ? '' : 's'} · ${dur(busyMin) || '0 min'} ocupado · ${freeMin ? dur(freeMin) + ' livre' : 'sem horário livre'}</small></div></div>
        <div class="bar">
          ${free.map(([a, z]) => seg(a, z, 'free', `<span>+ ${T.hm(a)}</span>`, `data-free="${a}" data-lane="${l}" aria-label="Marcar com ${esc(staff()[l - 1] || '')} a partir das ${T.hm(a)}"`)).join('')}
          ${offs.map(([a, z, r]) => seg(a, z, 'off', `<span>${esc(r)}</span>`)).join('')}
          ${mine.map(([a, z, b]) => seg(a, z, 'busy ' + b.status, `<b>${esc(b.pet_name)}</b><span class="num">${T.hm(a)}–${T.hm(z % 1440)}</span>`, `data-bk="${esc(b.id)}" role="button" tabindex="0"`)).join('')}
          ${nowMin != null && nowMin >= start && nowMin <= end ? `<div class="bar-now" style="left:${pct(nowMin)}%"></div>` : ''}
        </div></div>`;
    }
    return `<div class="legend-row small"><span><i class="lg busy"></i>Ocupado</span><span><i class="lg free"></i>Livre, toque para marcar</span><span><i class="lg off"></i>Almoço ou bloqueio</span></div>
      <div class="lanes-scroll"><div class="lanes"><div class="lane-row ticks-row"><div></div><div class="ticks">${ticks}</div></div>${rows}</div></div>`;
  }

  function detail(b) {
    if (!b) return;
    const s = new Date(b.starts_at), e = new Date(b.ends_at);
    const z = SIZES.find((x) => x.k === b.size) || { label: '' };
    const dl = T.label(T.parts(s, tz()).ds, { weekday: 'long', day: '2-digit', month: '2-digit' });
    const remind = waLink(b.customer_phone, `Olá, ${b.customer_name.split(' ')[0]}! Aqui é do ${A.shop.name}. Passando para lembrar: ${b.service_name.toLowerCase()} do(a) ${b.pet_name} está marcado para ${dl} às ${T.time(s, tz())}. Até lá!`);
    modal(mhead(esc(b.pet_name), `${esc(b.service_name)} · porte ${esc(b.size)}`) + `
      <dl class="kv"><dt>Quando</dt><dd class="num">${esc(dl)}, ${T.time(s, tz())}–${T.time(e, tz())}</dd>
        <dt>Profissional</dt><dd>${esc(staff()[b.lane - 1] || 'Profissional ' + b.lane)}</dd>
        <dt>Porte</dt><dd>${esc(b.size)} · ${esc(z.label)}</dd>
        ${b.pet_breed ? `<dt>Raça</dt><dd>${esc(b.pet_breed)}</dd>` : ''}
        <dt>Tutor</dt><dd>${esc(b.customer_name)}</dd>
        <dt>WhatsApp</dt><dd class="num">${esc(fmtPhone(b.customer_phone))} <button class="btn sm ghost" id="cp">Copiar</button></dd>
        ${b.notes ? `<dt>Observações</dt><dd>${esc(b.notes)}</dd>` : ''}
        <dt>Valor</dt><dd>${brl(b.price)}${b.deposit_status === 'pago' ? ` <span class="muted small">(restante no dia ${brl(Number(b.price) - Number(b.deposit_amount))})</span>` : ''}</dd>
        ${depositState(b) ? `<dt>Sinal</dt><dd>${esc(depositState(b).txt)}</dd>` : ''}
        <dt>Origem</dt><dd>${b.source === 'painel' ? 'Marcado no painel' : 'Agendado pelo cliente'}</dd>
        ${reminderState(b) ? `<dt>Lembrete</dt><dd>${esc(reminderState(b).txt)}${b.reminder_error ? ` <span class="muted small">(${esc(b.reminder_error)})</span>` : ''}</dd>` : ''}
        <dt>Situação</dt><dd><span class="pill ${statusCls(b)}">${statusLabel(b)}</span></dd></dl>
      <div id="dep-choice"></div>
      <div class="row">${b.status === 'confirmado'
        ? `<button class="btn sm" data-st="concluido">Concluído</button><button class="btn sm" data-st="faltou">Faltou</button><button class="btn sm danger" id="cancel">Cancelar horário</button>`
        : `<button class="btn sm" data-st="confirmado">Voltar para confirmado</button>`}
        ${remind ? `<a class="btn sm primary" href="${esc(remind)}" target="_blank" rel="noopener">${ICON.wa} Lembrar no WhatsApp</a>` : ''}</div>`,
    (m, close) => {
      $('#cp', m).onclick = () => copyText(fmtPhone(b.customer_phone));
      const setSt = async (st) => {
        try { await api.setBookingStatus(b.id, st); close(); toast(st === 'cancelado' ? 'Horário cancelado. Ele voltou a ficar livre para os clientes.' : 'Situação atualizada.'); await loadDay(); drawAgenda(); }
        catch (err) { toast(errMsg(err), 'bad'); }
      };
      const paid = b.deposit_status === 'pago';
      const dep = async (acao, st) => {
        try { await api.depositAction(b.id, acao, st); close(); toast(acao === 'devolver' ? 'Sinal devolvido ao cliente pelo Mercado Pago.' : st === 'faltou' ? 'Falta registrada. O sinal ficou com o petshop.' : 'Horário cancelado e sinal retido.'); await loadDay(); drawAgenda(); }
        catch (err) { toast(errMsg(err), 'bad'); }
      };
      // com sinal pago, cancelar pergunta o que fazer com o dinheiro (sugere pela política de horas)
      const askDeposit = () => {
        const hours = (new Date(b.starts_at).getTime() - Date.now()) / 3600e3;
        const lim = Number(A.shop.cancel_hours ?? 24);
        const refund = hours >= lim;
        $('#dep-choice', m).innerHTML = `<div class="choice"><b>O que fazer com o sinal de ${brl(b.deposit_amount)}?</b>
          <p class="small muted">${refund ? `Faltam ${Math.floor(hours)}h para o horário. Pela sua política (${lim}h), o sinal deve ser devolvido.` : `Faltam menos de ${lim}h para o horário. Pela sua política, o sinal pode ficar com o petshop.`}</p>
          <div class="row"><button class="btn sm ${refund ? 'primary' : ''}" data-dep="devolver">Cancelar e devolver o sinal</button>
          <button class="btn sm ${refund ? '' : 'primary'}" data-dep="reter">Cancelar e ficar com o sinal</button></div></div>`;
        $$('[data-dep]', m).forEach((x) => (x.onclick = () => dep(x.dataset.dep, 'cancelado')));
      };
      $$('[data-st]', m).forEach((x) => (x.onclick = () => (paid && x.dataset.st === 'faltou' ? dep('reter', 'faltou') : setSt(x.dataset.st))));
      const c = $('#cancel', m);
      if (c) c.onclick = () => {
        if (paid) return askDeposit();
        if (b.deposit_status === 'pendente') return dep('reter', 'cancelado');
        if (c.dataset.sure) return setSt('cancelado');
        c.dataset.sure = '1'; c.textContent = 'Toque de novo para cancelar'; c.classList.add('primary');
      };
    });
  }

  function newBooking(pre) {
    const svcs = A.services.filter((s) => s.active);
    if (!svcs.length) return toast('Cadastre um serviço primeiro, na aba Serviços e preços.', 'bad');
    modal(mhead('Novo agendamento', 'Para clientes que ligam ou chegam no balcão. Só aparecem horários livres.') + `
      <form id="nb" class="grid2" novalidate>
        <label class="field"><span>Serviço</span><select class="input" id="nb-svc">${svcs.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Porte</span><select class="input" id="nb-size"></select></label>
        <label class="field"><span>Profissional</span><select class="input" id="nb-lane"><option value="">Qualquer um livre</option>${staff().map((n, i) => `<option value="${i + 1}" ${pre.lane === i + 1 ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="field"><span>Data</span><input type="date" class="input" id="nb-date" value="${A.ds}"></label>
        <label class="field" style="grid-column:1/-1"><span>Horário</span><select class="input num" id="nb-time"></select></label>
        <label class="field"><span>Nome do tutor</span><input class="input" id="nb-name" maxlength="80"></label>
        <label class="field"><span>WhatsApp</span><input class="input num" id="nb-phone" inputmode="tel" placeholder="(79) 99999-0000"></label>
        <label class="field"><span>Nome do pet</span><input class="input" id="nb-pet" maxlength="60"></label>
        <label class="field"><span>Raça</span><input class="input" id="nb-breed" maxlength="60"></label>
        <label class="field" style="grid-column:1/-1"><span>Observações</span><input class="input" id="nb-notes" maxlength="500"></label>
        <button class="btn primary block" type="submit" style="grid-column:1/-1">Agendar</button></form>`,
    (m, close) => {
      let busy = [];
      const svc = () => A.services.find((s) => s.id === $('#nb-svc', m).value);
      const fillSizes = () => {
        const cur = $('#nb-size', m).value;
        $('#nb-size', m).innerHTML = SIZES.filter((z) => svc().sizes[z.k]).map((z) => `<option value="${z.k}" ${cur === z.k ? 'selected' : ''}>${z.k} · ${z.label} — ${brl(svc().sizes[z.k].price)} · ${dur(svc().sizes[z.k].min)}</option>`).join('');
      };
      const fillTimes = async (loadBusy) => {
        const ds = $('#nb-date', m).value;
        const sel = $('#nb-time', m);
        if (!ds) return;
        if (loadBusy) {
          sel.innerHTML = '<option>Carregando...</option>';
          busy = toBusy(await api.getBusy(A.shop.id, T.toUtc(ds, 0, tz()).toISOString(), T.toUtc(T.addDays(ds, 1), 0, tz()).toISOString()));
        }
        const z = svc().sizes[$('#nb-size', m).value];
        const slots = z ? computeSlots(A.shop, ds, z.min, busy, { owner: true, lane: $('#nb-lane', m).value || null }) : [];
        const want = pre.min != null ? pre.min : null;
        sel.innerHTML = slots.length ? slots.map((s) => `<option value="${s.min}" ${want === s.min ? 'selected' : ''}>${T.hm(s.min)} até ${T.hm(s.min + z.min)}</option>`).join('') : '<option value="">Nenhum horário livre</option>';
        pre.min = null;
      };
      fillSizes(); fillTimes(true);
      $('#nb-svc', m).onchange = () => { fillSizes(); fillTimes(false); };
      $('#nb-size', m).onchange = () => fillTimes(false);
      $('#nb-lane', m).onchange = () => fillTimes(false);
      $('#nb-date', m).onchange = () => fillTimes(true);
      $('#nb-phone', m).oninput = (e) => (e.target.value = fmtPhone(e.target.value));
      $('#nb', m).onsubmit = async (ev) => {
        ev.preventDefault();
        const min = $('#nb-time', m).value, ds = $('#nb-date', m).value;
        if (min === '') return toast('Escolha um horário livre.', 'bad');
        const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
        try {
          await api.createBooking({ shopId: A.shop.id, serviceId: svc().id, size: $('#nb-size', m).value, start: T.toUtc(ds, Number(min), tz()).toISOString(),
            customer: $('#nb-name', m).value, phone: $('#nb-phone', m).value, pet: $('#nb-pet', m).value, breed: $('#nb-breed', m).value, notes: $('#nb-notes', m).value,
            lane: Number($('#nb-lane', m).value) || null }, true);
          close(); toast('Agendamento criado.'); A.ds = ds; await loadDay(); drawAgenda();
        } catch (e) { toast(errMsg(e), 'bad'); btn.disabled = false; if (/HORARIO/.test(e.message)) fillTimes(true); }
      };
    });
  }

  /* =================== SERVIÇOS =================== */
  function Services() {
    const el = $('#adm');
    const list = [...A.services].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Serviços</p><h1>O que você oferece</h1></div><button class="btn primary" id="svc-new">${ICON.plus} Novo serviço</button></div>
      ${tip('Cada porte tem <b>preço</b> e <b>tempo</b>. O tempo é quanto o horário fica ocupado na agenda: um banho porte G de 1h30 marcado às 9h ocupa o profissional até 10h30.')}
      <div class="svc-grid">${list.length ? list.map((s) => `<section class="card svc-card ${s.active ? '' : 'off'}">
        <div class="svc-head"><div style="min-width:0"><h3>${esc(s.name)}</h3>${s.description ? `<p class="small muted">${esc(s.description)}</p>` : ''}</div>
          <span class="pill ${s.active ? 'concluido' : 'cancelado'}">${s.active ? 'Visível' : 'Oculto'}</span></div>
        <div class="ptable">${SIZES.map((z) => { const v = s.sizes[z.k]; return `<div class="pcell ${v ? '' : 'no'}"><span class="pk">${z.k}</span><small>${z.hint}</small>${v ? `<b class="num">${brl(v.price)}</b><span class="num">${dur(v.min)}</span>` : '<b>não faz</b><span>&nbsp;</span>'}</div>`; }).join('')}</div>
        <div><button class="btn sm" data-edit="${esc(s.id)}">Editar preços e tempo</button></div></section>`).join('')
        : '<div class="empty">Nenhum serviço ainda. Crie o primeiro.</div>'}</div>`;
    $('#svc-new').onclick = () => editService(null);
    $$('[data-edit]', el).forEach((b) => (b.onclick = () => editService(A.services.find((s) => s.id === b.dataset.edit))));
  }
  function editService(svc) {
    const s = svc || { name: '', description: '', active: true, sizes: { P: { price: 50, min: 60 }, M: { price: 60, min: 60 }, G: { price: 80, min: 90 }, GG: { price: 100, min: 120 } }, sort: A.services.length + 1 };
    const durs = []; for (let m = 15; m <= 300; m += 15) durs.push(m);
    modal(mhead(svc ? 'Editar serviço' : 'Novo serviço') + `<form id="sv" class="grid2" style="grid-template-columns:1fr" novalidate>
      <label class="field"><span>Nome</span><input class="input" id="sv-name" value="${esc(s.name)}" maxlength="60" placeholder="Ex: Banho + tosa higiênica"></label>
      <label class="field"><span>Descrição <span class="muted">(aparece para o cliente)</span></span><textarea class="input" id="sv-desc" maxlength="240">${esc(s.description || '')}</textarea></label>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Porte</th><th>Faz?</th><th>Preço (R$)</th><th>Duração</th></tr></thead><tbody>
        ${SIZES.map((z) => { const v = s.sizes[z.k]; return `<tr><td class="k">${z.k} <span class="muted small">${z.hint}</span></td>
          <td><input type="checkbox" data-on="${z.k}" ${v ? 'checked' : ''} aria-label="Oferece para porte ${z.k}" style="width:20px;height:20px;accent-color:var(--brand)"></td>
          <td><input class="input num" type="number" min="0" step="1" data-price="${z.k}" value="${v ? v.price : ''}" style="width:96px"></td>
          <td><select class="input" data-min="${z.k}" style="width:110px">${durs.map((m) => `<option value="${m}" ${(v ? v.min : 60) === m ? 'selected' : ''}>${dur(m)}</option>`).join('')}</select></td></tr>`; }).join('')}
      </tbody></table></div>
      <label class="switch"><input type="checkbox" id="sv-active" ${s.active ? 'checked' : ''}> Mostrar para os clientes</label>
      <div class="row"><button class="btn primary" type="submit">Salvar</button>${svc ? '<button class="btn danger ghost" type="button" id="sv-del">Excluir serviço</button>' : ''}</div></form>`,
    (m, close) => {
      $('#sv', m).onsubmit = async (ev) => {
        ev.preventDefault();
        const sizes = {};
        for (const z of SIZES) if ($(`[data-on="${z.k}"]`, m).checked) {
          const price = Number($(`[data-price="${z.k}"]`, m).value);
          if (!(price >= 0) || $(`[data-price="${z.k}"]`, m).value === '') return toast(`Preencha o preço do porte ${z.k}.`, 'bad');
          sizes[z.k] = { price, min: Number($(`[data-min="${z.k}"]`, m).value) };
        }
        const name = $('#sv-name', m).value.trim();
        if (name.length < 2) return toast('Dê um nome ao serviço.', 'bad');
        if (!Object.keys(sizes).length) return toast('Marque pelo menos um porte.', 'bad');
        try {
          const row = await api.saveService({ ...(svc ? { id: svc.id } : { shop_id: A.shop.id }), name, description: $('#sv-desc', m).value.trim(), sizes, active: $('#sv-active', m).checked, sort: s.sort || 0 });
          const i = A.services.findIndex((x) => x.id === row.id);
          if (i >= 0) A.services[i] = row; else A.services.push(row);
          close(); toast('Serviço salvo.'); Services();
        } catch (e) { toast(errMsg(e), 'bad'); }
      };
      const del = $('#sv-del', m);
      if (del) del.onclick = async () => {
        if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Toque de novo para excluir'; return; }
        try { await api.deleteService(svc.id); A.services = A.services.filter((x) => x.id !== svc.id); close(); toast('Serviço excluído. Agendamentos já feitos continuam na agenda.'); Services(); }
        catch (e) { toast(errMsg(e), 'bad'); }
      };
    });
  }

  /* =================== HORÁRIOS E EQUIPE =================== */
  function Hours() {
    const el = $('#adm');
    const H = JSON.parse(JSON.stringify(A.shop.hours));
    let team = [...staff()];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const notices = [[0, 'Sem antecedência'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [720, '12 horas'], [1440, '1 dia']];
    const draw = () => {
      el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Horários</p><h1>Quando você atende</h1></div><button class="btn primary" data-hsave>Salvar alterações</button></div>
      <section class="card panel"><div><h2>Quem atende</h2><p class="muted small">Cada profissional cuida de um pet por vez.</p></div>
        ${tip(`Com <b>${team.length} profissiona${team.length > 1 ? 'is' : 'l'}</b>, cada horário pode ser vendido <b>${team.length} ${team.length > 1 ? 'vezes' : 'vez'}</b>. Quando todos estão ocupados, o horário some da página do cliente.`)}
        <div class="staff">${team.map((n, i) => `<div class="row"><input class="input" data-staff="${i}" value="${esc(n)}" maxlength="30" aria-label="Nome do profissional ${i + 1}">
          ${team.length > 1 ? `<button class="btn sm ghost danger" data-rm="${i}" aria-label="Remover">Remover</button>` : ''}</div>`).join('')}</div>
        ${team.length < 12 ? '<div><button class="btn sm" id="st-add">+ Adicionar profissional</button></div>' : ''}</section>
      <section class="card panel"><div><h2>Dias e horários</h2><p class="muted small">Desmarque os dias em que o petshop não abre. O serviço precisa terminar até o horário de fechamento.</p></div>
        <div class="week">${order.map((d) => { const h = H[d]; return `<div class="wd ${h.closed ? 'closed' : ''}" data-wd="${d}">
          <label class="switch"><input type="checkbox" data-open="${d}" ${h.closed ? '' : 'checked'}> ${WEEK[d]}</label>
          <div class="times"><input type="time" class="input num" data-k="open" value="${esc(h.open)}" aria-label="Abre"> às <input type="time" class="input num" data-k="close" value="${esc(h.close)}" aria-label="Fecha">
            <span>· almoço</span><input type="time" class="input num" data-k="break_start" value="${esc(h.break_start || '')}" aria-label="Início do almoço"> às <input type="time" class="input num" data-k="break_end" value="${esc(h.break_end || '')}" aria-label="Fim do almoço"></div></div>`; }).join('')}</div>
      </section>
      <section class="card panel" id="sinal"><div><h2>Sinal para garantir o horário</h2><p class="muted small">O cliente paga ${Number(A.shop.deposit_percent) || 30}% do serviço no Pix para confirmar. O valor cai direto na conta Mercado Pago do petshop.</p></div>
        ${A.shop.mp_connected
          ? `<div class="linkbox"><span>${ICON.tick} <b>Mercado Pago conectado</b></span><button class="btn sm ghost danger" id="mp-off">Desconectar</button></div>`
          : `<div class="row"><button class="btn primary" id="mp-on">Conectar Mercado Pago</button><span class="small muted">Você entra na sua conta do Mercado Pago e autoriza o PetHora a gerar os Pix.</span></div>`}
        <label class="switch"><input type="checkbox" id="r-dep" ${A.shop.deposit_enabled ? 'checked' : ''} ${A.shop.mp_connected ? '' : 'disabled'}> Cobrar sinal de ${Number(A.shop.deposit_percent) || 30}% para confirmar o agendamento</label>
        <label class="field" style="max-width:340px"><span>Prazo para cancelar e receber o sinal de volta</span><select class="input" id="r-cancel">${[12, 24, 48, 72].map((v) => `<option value="${v}" ${Number(A.shop.cancel_hours ?? 24) === v ? 'selected' : ''}>Até ${v}h antes do horário</option>`).join('')}</select></label>
        ${tip(esc(DEPOSIT.policy(A.shop)) + ' O horário fica reservado por 30 minutos esperando o Pix; sem pagamento, ele volta para a lista.')}
        <div><button class="btn primary" data-hsave>Salvar alterações</button></div></section>
      <section class="card panel"><div><h2>Regras para o cliente</h2><p class="muted small">Como os horários aparecem na sua página.</p></div><div class="grid2">
        <label class="field"><span>Intervalo entre horários</span><select class="input" id="r-int">${[15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${A.shop.slot_interval === v ? 'selected' : ''}>A cada ${v} min</option>`).join('')}</select></label>
        <label class="field"><span>Antecedência mínima</span><select class="input" id="r-not">${notices.map(([v, l]) => `<option value="${v}" ${A.shop.min_notice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Agenda aberta para os próximos</span><select class="input" id="r-max">${[7, 14, 21, 30, 45, 60, 90].map((v) => `<option value="${v}" ${A.shop.max_days === v ? 'selected' : ''}>${v} dias</option>`).join('')}</select></label></div></section>
      <section class="card panel"><div><h2>Lembretes automáticos no WhatsApp</h2><p class="muted small">O tutor recebe a mensagem sozinho, sem você precisar fazer nada.</p></div>
        ${tip(`Exemplo do que chega: <i>"Olá, Marina! Passando para lembrar do atendimento no ${esc(A.shop.name)}: banho do(a) Thor amanhã (quinta, 22/10) às 14:00."</i>`)}
        <label class="switch"><input type="checkbox" id="r-24h" ${A.shop.remind_24h !== false ? 'checked' : ''}> Lembrete 1 dia antes <span class="muted small">(para quem agendou com pelo menos 12h de antecedência)</span></label>
        <label class="switch"><input type="checkbox" id="r-2h" ${A.shop.remind_2h ? 'checked' : ''}> Lembrete 2 horas antes <span class="muted small">(para quem agendou com pelo menos 3h de antecedência)</span></label>
        <div><button class="btn primary" data-hsave>Salvar alterações</button></div></section>
      <section class="card panel" id="blk"></section>`;
      $$('[data-staff]', el).forEach((i) => (i.oninput = () => (team[i.dataset.staff] = i.value)));
      $$('[data-rm]', el).forEach((b) => (b.onclick = () => { team.splice(Number(b.dataset.rm), 1); draw(); }));
      const add = $('#st-add'); if (add) add.onclick = () => { team.push('Profissional ' + (team.length + 1)); draw(); };
      $$('[data-open]', el).forEach((c) => (c.onchange = () => { H[c.dataset.open].closed = !c.checked; c.closest('.wd').classList.toggle('closed', !c.checked); }));
      $$('.wd input[type=time]', el).forEach((i) => (i.onchange = () => (H[i.closest('.wd').dataset.wd][i.dataset.k] = i.value)));
      $$('[data-hsave]', el).forEach((b) => (b.onclick = save));
      const on = $('#mp-on');
      if (on) on.onclick = async () => {
        on.disabled = true;
        try {
          const back = location.href.split('#')[0].split('?')[0];
          const url = await api.mpConnectUrl(back);
          if (url) location.href = url;
          else { A.shop = await api.getMyShop(); toast('Mercado Pago conectado (demonstração).'); draw(); }
        } catch (e) { toast(errMsg(e), 'bad'); on.disabled = false; }
      };
      const off = $('#mp-off');
      if (off) off.onclick = async () => {
        if (!off.dataset.sure) { off.dataset.sure = '1'; off.textContent = 'Toque de novo para desconectar'; return; }
        try { await api.mpDisconnect(); A.shop = await api.getMyShop(); toast('Mercado Pago desconectado. O sinal foi desligado.'); draw(); }
        catch (e) { toast(errMsg(e), 'bad'); }
      };
      drawBlocks();
    };
    const save = async () => {
      const names = team.map((n) => n.trim()).filter(Boolean);
      if (!names.length) return toast('Cadastre pelo menos um profissional.', 'bad');
      for (const d of order) {
        const h = H[d];
        if (h.closed) continue;
        const o = T.pm(h.open), c = T.pm(h.close), bs = T.pm(h.break_start), be = T.pm(h.break_end);
        if (o == null || c == null || o >= c) return toast(`${WEEK[d]}: o fechamento precisa ser depois da abertura.`, 'bad');
        if ((bs == null) !== (be == null)) return toast(`${WEEK[d]}: preencha início e fim do almoço, ou deixe os dois vazios.`, 'bad');
        if (bs != null && (bs >= be || bs < o || be > c)) return toast(`${WEEK[d]}: o almoço precisa ficar dentro do expediente.`, 'bad');
        if (bs == null) { h.break_start = ''; h.break_end = ''; }
      }
      try {
        A.shop = await api.updateShop(A.shop.id, { staff: names, hours: H, slot_interval: Number($('#r-int').value), min_notice: Number($('#r-not').value), max_days: Number($('#r-max').value), remind_24h: $('#r-24h').checked, remind_2h: $('#r-2h').checked,
          deposit_enabled: A.shop.mp_connected ? $('#r-dep').checked : false, cancel_hours: Number($('#r-cancel').value) });
        team = [...A.shop.staff]; markStep('horarios'); toast('Horários e equipe salvos.'); draw();
      } catch (e) { toast(errMsg(e), 'bad'); }
    };
    draw();
  }
  async function drawBlocks() {
    const box = $('#blk'); if (!box) return;
    const list = await api.listBlocks(A.shop.id);
    const fmt = (iso) => { const p = T.parts(new Date(iso), tz()); return `${T.short(p.ds)} ${T.hm(p.min)}`; };
    box.innerHTML = `<div><h2>Folgas e feriados</h2><p class="muted small">Nenhum horário é oferecido nesse período. Agendamentos que já existem continuam na agenda.</p></div>
      ${list.length ? `<div class="list">${list.map((k) => `<div class="li" style="cursor:default"><span class="tm" style="font-size:13px">${fmt(k.starts_at)}</span><span class="who"><b>${esc(k.reason || 'Bloqueado')}</b><span>até ${fmt(k.ends_at)}</span></span>
        <button class="btn sm ghost danger" data-unblock="${esc(k.id)}">Remover</button></div>`).join('')}</div>` : '<div class="empty">Nenhum bloqueio agendado.</div>'}
      <form id="bf" class="grid2" novalidate>
        <label class="field"><span>Data</span><input type="date" class="input" id="bf-date" value="${T.today(tz())}"></label>
        <label class="field"><span>De</span><input type="time" class="input" id="bf-from" value="00:00"></label>
        <label class="field"><span>Até</span><input type="time" class="input" id="bf-to" value="23:59"></label>
        <label class="field"><span>Motivo</span><input class="input" id="bf-reason" placeholder="Ex: Feriado" maxlength="60"></label>
        <button class="btn" type="submit">Adicionar bloqueio</button></form>`;
    $$('[data-unblock]', box).forEach((b) => (b.onclick = async () => { await api.deleteBlock(b.dataset.unblock); toast('Bloqueio removido.'); drawBlocks(); }));
    $('#bf').onsubmit = async (ev) => {
      ev.preventDefault();
      const ds = $('#bf-date').value, f = T.pm($('#bf-from').value), t = T.pm($('#bf-to').value);
      if (!ds || f == null || t == null || t <= f) return toast('Confira a data e os horários do bloqueio.', 'bad');
      try {
        await api.addBlock({ shop_id: A.shop.id, starts_at: T.toUtc(ds, f, tz()).toISOString(), ends_at: T.toUtc(ds, t === 1439 ? 1440 : t, tz()).toISOString(), reason: $('#bf-reason').value.trim() });
        toast('Bloqueio adicionado.'); drawBlocks();
      } catch (e) { toast(errMsg(e), 'bad'); }
    };
  }

  /* =================== MARCA E LINK =================== */
  function Brand() {
    const el = $('#adm');
    const D = { name: A.shop.name, tagline: A.shop.tagline || '', slug: A.shop.slug, color: A.shop.color, whatsapp: A.shop.whatsapp || '', address: A.shop.address || '', instagram: A.shop.instagram || '', logo_url: A.shop.logo_url || '' };
    const presets = ['#1F6F6B', '#2457A6', '#7A3EB1', '#C2410C', '#BE185D', '#15803D', '#0F172A', '#B88A1E'];
    el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Sua página</p><h1>Como os clientes veem você</h1></div><button class="btn primary" data-bsave>Salvar alterações</button></div>
      <section class="card panel"><div><h2>Link para os clientes</h2><p class="muted small">Coloque na bio do Instagram, no status do WhatsApp e no Google Meu Negócio.</p></div>
      <div class="linkbox"><code id="lk">${esc(shopLink(A.shop))}</code><button class="btn sm" id="lk-copy">Copiar link</button></div></section>
      <section class="card panel"><div><h2>Visual da página</h2><p class="muted small">A prévia abaixo muda enquanto você edita.</p></div>
      <div class="preview" id="pv"></div>
      <div class="grid2">
        <label class="field"><span>Nome do petshop</span><input class="input" id="b-name" value="${esc(D.name)}" maxlength="80"></label>
        <label class="field"><span>Frase de apresentação</span><input class="input" id="b-tag" value="${esc(D.tagline)}" maxlength="90"></label>
        <label class="field"><span>Endereço do link</span><input class="input" id="b-slug" value="${esc(D.slug)}" maxlength="42"></label>
        <label class="field"><span>WhatsApp do petshop</span><input class="input num" id="b-wa" value="${esc(fmtPhone(D.whatsapp))}" inputmode="tel"></label>
        <label class="field"><span>Endereço</span><input class="input" id="b-addr" value="${esc(D.address)}" maxlength="120"></label>
        <label class="field"><span>Instagram</span><input class="input" id="b-ig" value="${esc(D.instagram)}" maxlength="40" placeholder="seupetshop"></label>
      </div>
      <div class="field"><span>Cor principal</span><div class="colors">${presets.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" aria-label="Cor ${c}" aria-pressed="${D.color.toLowerCase() === c.toLowerCase()}"></button>`).join('')}
        <input type="color" class="input" id="b-color" value="${esc(D.color)}" aria-label="Outra cor"></div></div>
      <div class="field"><span>Logo</span><div class="row"><input type="file" id="b-logo" accept="image/*"><button type="button" class="btn sm ghost" id="b-nologo" ${D.logo_url ? '' : 'hidden'}>Remover logo</button></div>
        <small class="muted">Use uma imagem quadrada. Ela é reduzida automaticamente.</small></div>
      <div><button class="btn primary" data-bsave>Salvar alterações</button></div></section>`;
    const pv = () => { $('#pv').innerHTML = heroHtml({ ...A.shop, ...D }); applyBrand(D.color); };
    pv();
    const bind = (id, k, f = (v) => v) => ($(id).oninput = (e) => { D[k] = f(e.target.value); if (id === '#b-wa') e.target.value = fmtPhone(e.target.value); if (id === '#b-slug') e.target.value = D.slug; pv(); });
    bind('#b-name', 'name'); bind('#b-tag', 'tagline'); bind('#b-slug', 'slug', slugify); bind('#b-wa', 'whatsapp', digits); bind('#b-addr', 'address'); bind('#b-ig', 'instagram', (v) => v.replace(/^@/, '').trim());
    $$('[data-c]', el).forEach((b) => (b.onclick = () => { D.color = b.dataset.c; $('#b-color').value = D.color; $$('[data-c]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); pv(); }));
    $('#b-color').oninput = (e) => { D.color = e.target.value; $$('[data-c]', el).forEach((x) => x.setAttribute('aria-pressed', 'false')); pv(); };
    $('#lk-copy').onclick = () => { markStep('link'); copyText(shopLink(A.shop)); };
    $('#b-nologo').onclick = () => { D.logo_url = ''; $('#b-nologo').hidden = true; pv(); };
    $('#b-logo').onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
        const ctx = c.getContext('2d'); const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        D.logo_url = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
        URL.revokeObjectURL(url); $('#b-nologo').hidden = false; pv();
      };
      img.onerror = () => toast('Não consegui ler essa imagem. Tente um PNG ou JPG.', 'bad');
      img.src = url;
    };
    const saveBrand = async () => {
      if (D.name.trim().length < 2) return toast('Preencha o nome do petshop.', 'bad');
      if (D.slug.length < 3) return toast('O endereço do link precisa de pelo menos 3 letras.', 'bad');
      try { A.shop = await api.updateShop(A.shop.id, { ...D, name: D.name.trim() }); markStep('marca'); toast('Página salva.'); drawShell(); drawTab(); }
      catch (e) { toast(errMsg(e), 'bad'); }
    };
    $$('[data-bsave]', el).forEach((b) => (b.onclick = saveBrand));
  }

  drawShell();
  drawTab();
}



/* PetHora — carregamento comum aos dois sites */
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src)); document.head.appendChild(s); });
}
async function supabaseClient(mount) {
  try { await loadScript(SUPABASE_JS); } catch (e) {
    mount.innerHTML = `<div class="auth gutter"><div class="card"><h2>Sem conexão</h2><p class="muted">Verifique sua internet e recarregue a página.</p></div></div>`;
    return null;
  }
  return window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
}
const boot = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());


/* PetHora — SITE DO PAINEL: login e gestão do petshop. Não tem página de agendamento. */
boot(async () => {
  const mount = document.getElementById('app');
  let api;
  if (CLOUD) {
    const sb = await supabaseClient(mount); if (!sb) return;
    api = SupabaseAdminAdapter(sb);
    // link "esqueci minha senha": o usuário volta logado e define a nova senha
    sb.auth.onAuthStateChange((ev) => {
      if (ev !== 'PASSWORD_RECOVERY') return;
      modal(mhead('Nova senha') + `<form id="np" class="grid2" style="grid-template-columns:1fr"><label class="field"><span>Nova senha</span><input class="input" id="np-pass" type="password" minlength="6" autocomplete="new-password"></label><button class="btn primary" type="submit">Salvar senha</button></form>`, (m, close) => {
        $('#np', m).onsubmit = async (e) => {
          e.preventDefault();
          const { error } = await sb.auth.updateUser({ password: $('#np-pass', m).value });
          if (error) return toast(errMsg(error), 'bad');
          close(); toast('Senha alterada.');
        };
      });
    });
  } else api = DemoAdapter();
  AdminPage(api, mount);
});

})();
