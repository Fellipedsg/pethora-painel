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


/* PetHora — página pública de agendamento (o que o tutor do pet vê) */

function minPrice(svc) {
  const v = Object.values(svc.sizes || {}).filter(Boolean);
  if (!v.length) return null;
  return { price: Math.min(...v.map((x) => Number(x.price) || 0)), min: Math.min(...v.map((x) => Number(x.min) || 0)) };
}

async function BookingPage(api, mount, slug) {
  mount.innerHTML = `<div class="book-wrap gutter" style="margin-top:24px"><div class="card step"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  let shop;
  try { shop = await api.getShopBySlug(slug); } catch (e) { mount.innerHTML = `<div class="auth gutter"><div class="card"><h2>Não foi possível carregar</h2><p class="muted">${esc(errMsg(e))}</p></div></div>`; return; }
  if (!shop) {
    mount.innerHTML = `<div class="auth gutter"><div class="card"><h2>Petshop não encontrado</h2><p class="muted">Confira se o link está certo ou fale com o petshop.</p></div></div>`;
    return;
  }
  applyBrand(shop.color);
  document.title = `${shop.name} · Agendar banho e tosa`;
  const tz = shop.timezone || 'America/Sao_Paulo';

  if (!shop.active) {
    mount.innerHTML = heroHtml(shop) + `<main class="book-wrap gutter">${contactHtml(shop)}<div class="card step"><h2>Agendamento online pausado</h2>
      <p class="muted">No momento os horários estão sendo marcados direto com o petshop.${shop.whatsapp ? ' Chame no WhatsApp ' + esc(fmtPhone(shop.whatsapp)) + '.' : ''}</p></div></main>`;
    return;
  }

  const services = (await api.listServices(shop.id)).filter((s) => s.active && Object.keys(s.sizes || {}).length);
  const S = { svc: null, size: null, ds: null, slot: null, busy: [], busyOk: false, timer: null };

  mount.innerHTML = heroHtml(shop) + `<main class="book-wrap gutter" id="bk-main">
    ${contactHtml(shop)}
    <section class="card step" id="st-svc" aria-labelledby="h-svc"></section>
    <section class="card step" id="st-size" aria-labelledby="h-size" hidden></section>
    <section class="card step" id="st-day" aria-labelledby="h-day" hidden></section>
    <section class="card step" id="st-slot" aria-labelledby="h-slot" hidden></section>
    <section class="card step" id="st-form" aria-labelledby="h-form" hidden></section>
    <p class="foot">Agendamento online por PetHora</p>
  </main>`;

  const sizeInfo = () => (S.svc && S.size ? S.svc.sizes[S.size] : null);
  const head = (n, id, title, sub = '') => `<div class="step-head"><span class="step-n">${n}</span><div><h2 id="${id}">${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div></div>`;

  /* 1. serviço */
  function renderSvc() {
    const el = $('#st-svc');
    if (!services.length) { el.innerHTML = head(1, 'h-svc', 'Serviços') + `<div class="empty">Este petshop ainda não cadastrou serviços.</div>`; return; }
    el.innerHTML = head(1, 'h-svc', 'Qual serviço?') + `<div class="options">${services.map((s) => {
      const mp = minPrice(s);
      return `<button type="button" class="opt" data-svc="${esc(s.id)}" aria-pressed="${S.svc && S.svc.id === s.id}">
        <span class="t">${esc(s.name)}</span><span class="p">${mp ? `<small>a partir de</small>${brl(mp.price)}` : ''}</span>
        ${s.description ? `<span class="d">${esc(s.description)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  /* 2. porte */
  function renderSize() {
    const el = $('#st-size');
    el.hidden = !S.svc;
    if (!S.svc) return;
    el.innerHTML = head(2, 'h-size', 'Porte do pet', 'O preço e o tempo do serviço mudam conforme o porte.') + `<div class="sizes">${SIZES.map((z) => {
      const v = S.svc.sizes[z.k];
      return `<button type="button" class="size" data-size="${z.k}" aria-pressed="${S.size === z.k}" ${v ? '' : 'disabled'} aria-label="${z.label}, ${z.hint}">
        <span class="k">${z.k}</span><span class="h">${z.hint}</span><span class="v">${v ? brl(v.price) : 'não faz'}</span></button>`;
    }).join('')}</div>${sizeInfo() ? `<p class="small muted">Duração estimada: <b class="num">${dur(sizeInfo().min)}</b></p>` : ''}`;
  }
  /* 3. dia */
  function dayList() {
    const today = T.today(tz);
    const n = Number(shop.max_days) || 30;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ds = T.addDays(today, i);
      const h = shop.hours[T.dow(ds)];
      let state = 'ok', count = 0;
      if (!h || h.closed) state = 'closed';
      else {
        count = computeSlots(shop, ds, sizeInfo().min, S.busy).length;
        if (!count) state = i === 0 ? 'over' : 'full';
      }
      out.push({ ds, state, count });
    }
    return out;
  }
  function renderDay() {
    const el = $('#st-day');
    el.hidden = !sizeInfo();
    if (!sizeInfo()) return;
    if (!S.busyOk) { el.innerHTML = head(3, 'h-day', 'Escolha o dia') + `<div class="row"><div class="skeleton" style="width:64px;height:84px"></div><div class="skeleton" style="width:64px;height:84px"></div><div class="skeleton" style="width:64px;height:84px"></div></div>`; return; }
    const days = dayList();
    if (S.ds && !days.some((d) => d.ds === S.ds && d.state === 'ok')) S.ds = null;
    if (!S.ds) { const f = days.find((d) => d.state === 'ok'); S.ds = f ? f.ds : null; }
    const tag = { closed: 'fechado', full: 'lotado', over: 'encerrado' };
    el.innerHTML = head(3, 'h-day', 'Escolha o dia') + (days.some((d) => d.state === 'ok')
      ? `<div class="days" role="list">${days.map((d) => `<button type="button" class="day" role="listitem" data-day="${d.ds}" aria-pressed="${S.ds === d.ds}" ${d.state === 'ok' ? '' : 'disabled'}
          aria-label="${esc(T.label(d.ds))}${d.state !== 'ok' ? ', ' + tag[d.state] : ''}">
          <span class="w">${esc(T.label(d.ds, { weekday: 'short' }).replace('.', ''))}</span><span class="n">${d.ds.slice(8)}</span>
          <span class="m">${esc(T.label(d.ds, { month: 'short' }).replace('.', ''))}</span>${d.state !== 'ok' ? `<span class="tag">${tag[d.state]}</span>` : ''}</button>`).join('')}</div>`
      : `<div class="empty">Não há horários livres nos próximos ${shop.max_days} dias para esse serviço. Fale com o petshop pelo WhatsApp.</div>`);
    const sel = $('.day[aria-pressed="true"]', el);
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /* 4. horário */
  function renderSlot() {
    const el = $('#st-slot');
    el.hidden = !(sizeInfo() && S.ds && S.busyOk);
    if (el.hidden) return;
    const slots = computeSlots(shop, S.ds, sizeInfo().min, S.busy);
    if (S.slot != null && !slots.some((s) => s.min === S.slot)) S.slot = null;
    const groups = [['Manhã', (m) => m < 720], ['Tarde', (m) => m >= 720 && m < 1080], ['Noite', (m) => m >= 1080]];
    el.innerHTML = head(4, 'h-slot', 'Horários livres', esc(T.label(S.ds))) + (slots.length
      ? groups.map(([g, f]) => { const list = slots.filter((s) => f(s.min)); return list.length ? `<p class="period">${g}</p><div class="slots">${list.map((s) =>
          `<button type="button" class="slot" data-slot="${s.min}" aria-pressed="${S.slot === s.min}">${T.hm(s.min)}</button>`).join('')}</div>` : ''; }).join('')
      : `<div class="empty">Esse dia lotou. Escolha outro dia.</div>`)
      + (S.slot != null ? `<p class="small muted">Previsão de término: <b class="num">${T.hm(S.slot + sizeInfo().min)}</b></p>` : '');
  }
  /* 5. dados */
  function summaryHtml() {
    const z = SIZES.find((x) => x.k === S.size);
    return `<dl class="summary"><dt>Serviço</dt><dd>${esc(S.svc.name)}</dd><dt>Porte</dt><dd>${esc(z.k)} · ${esc(z.label)}</dd>
      <dt>Quando</dt><dd>${esc(T.label(S.ds, { weekday: 'short', day: '2-digit', month: '2-digit' }))} às ${T.hm(S.slot)}</dd>
      <dt>Duração</dt><dd>${dur(sizeInfo().min)}</dd><dt>Valor</dt><dd>${brl(sizeInfo().price)}</dd>
      ${DEPOSIT.active(shop) ? `<dt>Sinal agora</dt><dd>${brl(DEPOSIT.amount(shop, sizeInfo().price))} via Pix</dd>` : ''}</dl>`;
  }
  function renderForm() {
    const el = $('#st-form');
    el.hidden = S.slot == null;
    if (el.hidden) return;
    if (!$('#bk-form', el)) {
      el.innerHTML = head(5, 'h-form', 'Seus dados') + `<div id="bk-sum"></div>
        <form id="bk-form" class="grid2" novalidate>
          <label class="field"><span>Seu nome</span><input class="input" id="f-name" name="name" autocomplete="name" required maxlength="80"></label>
          <label class="field"><span>WhatsApp com DDD</span><input class="input num" id="f-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="(79) 99999-0000" required></label>
          <label class="field"><span>Nome do pet</span><input class="input" id="f-pet" name="pet" required maxlength="60"></label>
          <label class="field"><span>Raça <span class="muted">(opcional)</span></span><input class="input" id="f-breed" name="breed" maxlength="60"></label>
          <label class="field" style="grid-column:1/-1"><span>Observações <span class="muted">(opcional)</span></span>
            <textarea class="input" id="f-notes" name="notes" maxlength="500" placeholder="Ex: tem medo de secador, alergia a algum produto, tosa curtinha..."></textarea></label>
          ${DEPOSIT.active(shop) ? `<label class="field" style="grid-column:1/-1"><span>E-mail <span class="muted">(para o comprovante do Pix)</span></span><input class="input" id="f-email" type="email" autocomplete="email" maxlength="120"></label>
          <div class="policy" style="grid-column:1/-1"><p><b>Sinal para garantir o horário</b></p><p>${esc(DEPOSIT.policy(shop))}</p>
            <label class="switch"><input type="checkbox" id="f-agree"> Li e concordo com a política de sinal e cancelamento</label></div>` : ''}
          <button class="btn primary block" id="f-submit" type="submit" style="grid-column:1/-1">${DEPOSIT.active(shop) ? 'Reservar e pagar o sinal' : 'Confirmar agendamento'}</button>
        </form>`;
      try { const saved = JSON.parse(localStorage.getItem('pethora-tutor') || 'null'); if (saved) { $('#f-name').value = saved.name || ''; $('#f-phone').value = saved.phone || ''; $('#f-pet').value = saved.pet || ''; $('#f-breed').value = saved.breed || ''; if ($('#f-email')) $('#f-email').value = saved.email || ''; } } catch (e) { /* sem memória local */ }
    }
    $('#bk-sum', el).innerHTML = summaryHtml();
  }
  function renderAll() { renderSvc(); renderSize(); renderDay(); renderSlot(); renderForm(); }

  async function refreshBusy(quiet) {
    try {
      const today = T.today(tz);
      const from = T.toUtc(today, 0, tz).toISOString();
      const to = T.toUtc(T.addDays(today, (Number(shop.max_days) || 30) + 1), 0, tz).toISOString();
      const before = S.slot;
      S.busy = toBusy(await api.getBusy(shop.id, from, to));
      S.busyOk = true;
      renderDay(); renderSlot();
      if (before != null && S.slot == null && quiet) toast(`O horário das ${T.hm(before)} acabou de ser reservado. Escolha outro.`, 'bad');
      renderForm();
    } catch (e) { if (!quiet) toast(errMsg(e), 'bad'); }
  }

  const main = $('#bk-main');
  main.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.svc) {
      S.svc = services.find((s) => s.id === b.dataset.svc);
      if (S.size && !S.svc.sizes[S.size]) S.size = null;
      S.slot = null; renderAll(); reveal($('#st-size'));
    } else if (b.dataset.size) {
      S.size = b.dataset.size; S.slot = null; renderAll();
      if (!S.busyOk) refreshBusy(false).then(() => reveal($('#st-day'))); else reveal($('#st-day'));
    } else if (b.dataset.day) {
      S.ds = b.dataset.day; S.slot = null; renderDay(); renderSlot(); renderForm(); reveal($('#st-slot'));
    } else if (b.dataset.slot) {
      S.slot = Number(b.dataset.slot); renderSlot(); renderForm(); reveal($('#st-form'));
    }
  });
  main.addEventListener('input', (ev) => { if (ev.target.id === 'f-phone') ev.target.value = fmtPhone(ev.target.value); });
  main.addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'bk-form') return;
    ev.preventDefault();
    const v = (id) => $('#' + id).value;
    const data = { name: v('f-name').trim(), phone: v('f-phone'), pet: v('f-pet').trim(), breed: v('f-breed').trim(), notes: v('f-notes').trim() };
    if (data.name.length < 2) return toast('Digite seu nome.', 'bad'), $('#f-name').focus();
    if (digits(data.phone).length < 10) return toast('Digite o WhatsApp com DDD.', 'bad'), $('#f-phone').focus();
    if (!data.pet) return toast('Digite o nome do pet.', 'bad'), $('#f-pet').focus();
    const needDep = DEPOSIT.active(shop);
    if (needDep) {
      data.email = v('f-email').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return toast(ERRORS.EMAIL_INVALIDO, 'bad'), $('#f-email').focus();
      if (!$('#f-agree').checked) return toast('Para reservar, marque que concorda com a política de sinal e cancelamento.', 'bad'), $('#f-agree').focus();
    }
    const btn = $('#f-submit'); btn.disabled = true; btn.textContent = 'Reservando...';
    const start = T.toUtc(S.ds, S.slot, tz);
    try {
      const res = await api.createBooking({ shopId: shop.id, serviceId: S.svc.id, size: S.size, start: start.toISOString(), customer: data.name, phone: data.phone, pet: data.pet, breed: data.breed, notes: data.notes });
      try { localStorage.setItem('pethora-tutor', JSON.stringify({ name: data.name, phone: data.phone, pet: data.pet, breed: data.breed, email: data.email || '' })); } catch (e) { /* ok */ }
      clearInterval(S.timer);
      if (res.needs_payment) renderPix(res, data); else renderTicket(res, data);
    } catch (e) {
      toast(errMsg(e), 'bad');
      btn.disabled = false; btn.textContent = needDep ? 'Reservar e pagar o sinal' : 'Confirmar agendamento';
      if (/HORARIO_INDISPONIVEL|23P01|ANTECEDENCIA|BLOQUEADO/.test(String(e.message))) { S.slot = null; await refreshBusy(false); reveal($('#st-slot')); }
    }
  });

  /* Pix do sinal: QR + copia e cola + contagem; confirma sozinho quando o Mercado Pago avisa */
  async function renderPix(res, data) {
    const z = SIZES.find((x) => x.k === S.size);
    const st = new Date(res.starts_at);
    const dlabel = T.label(S.ds, { weekday: 'long', day: '2-digit', month: '2-digit' });
    let stop = false, poll = null, tick = null;
    const end = () => { stop = true; clearInterval(poll); clearInterval(tick); };
    main.innerHTML = `${contactHtml(shop)}<section class="card ticket pix" aria-live="polite">
      <div><p class="eyebrow">Falta só o sinal</p><p class="pet">${esc(data.pet)}</p><p class="when">${esc(dlabel)} às ${T.time(st, tz)}</p></div>
      <div class="pix-amount"><span>Sinal de ${Number(shop.deposit_percent) || 30}% via Pix</span><b class="num">${brl(res.deposit_amount)}</b>
        <small>Restante no dia: ${brl(Number(res.price) - Number(res.deposit_amount))}</small></div>
      <div id="pix-box"><div class="skeleton" style="height:220px"></div></div>
      <p class="pix-wait" id="pix-wait"><span class="dot"></span> Aguardando o pagamento… o horário fica reservado por <b class="num" id="pix-left">30:00</b></p>
      <p class="small muted">${esc(DEPOSIT.policy(shop))}</p>
    </section><p class="foot">Pagamento processado pelo Mercado Pago</p>`;
    window.scrollTo({ top: 0, behavior: smooth() });
    const expires = new Date(res.hold_expires_at).getTime();
    const showExpired = () => {
      end();
      main.innerHTML = `${contactHtml(shop)}<section class="card ticket"><p class="eyebrow">Tempo esgotado</p><h2>O horário foi liberado</h2>
        <p class="muted">O sinal não foi pago em 30 minutos. Se você pagou agora há pouco, o valor volta automaticamente para a sua conta.</p>
        <button type="button" class="btn primary block" id="again">Escolher outro horário</button></section>`;
      $('#again').onclick = () => BookingPage(api, mount, slug);
    };
    tick = setInterval(() => {
      const left = Math.max(0, expires - Date.now());
      const el = $('#pix-left'); if (el) el.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      if (!left) showExpired();
    }, 1000);
    try {
      const pix = await api.pixCreate(res.id, res.pay_token, data.email);
      if (stop) return;
      $('#pix-box').innerHTML = `${pix.qr_code_base64 ? `<img class="pix-qr" alt="QR Code do Pix" src="data:image/png;base64,${esc(pix.qr_code_base64)}">` : `<div class="pix-qr fake">${ICON.paw}<span>QR Code de demonstração</span></div>`}
        <label class="field"><span>Pix copia e cola</span><textarea class="input num" id="pix-code" readonly rows="3">${esc(pix.qr_code || '')}</textarea></label>
        <button type="button" class="btn primary block" id="pix-copy">Copiar código Pix</button>
        ${pix.ticket_url ? `<a class="btn ghost block" href="${esc(pix.ticket_url)}" target="_blank" rel="noopener">Abrir o Pix no Mercado Pago</a>` : ''}
        ${pix.demo ? '<button type="button" class="btn block" id="pix-demo">Simular pagamento (demonstração)</button>' : ''}`;
      $('#pix-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(pix.qr_code); toast('Código copiado! Cole no app do seu banco, na opção Pix copia e cola.'); }
        catch (e) { const t = $('#pix-code'); t.focus(); t.select(); toast('Selecionei o código: copie e cole no app do banco.'); }
      };
      const demo = $('#pix-demo'); if (demo) demo.onclick = () => api.demoPay(res.id);
    } catch (e) {
      if (/RESERVA_EXPIRADA/.test(e.message)) return showExpired();
      $('#pix-box').innerHTML = `<div class="notice">${esc(errMsg(e))}</div><button type="button" class="btn block" id="pix-retry">Tentar de novo</button>`;
      $('#pix-retry').onclick = () => { end(); renderPix(res, data); };
      return;
    }
    poll = setInterval(async () => {
      if (stop || document.visibilityState === 'hidden') return;
      try {
        const s = await api.bookingStatus(res.id, res.pay_token);
        if (!s || stop) return;
        if (s.deposit_status === 'pago') { end(); toast('Pagamento confirmado!'); renderTicket({ ...res, paid: true }, data); }
        else if (s.deposit_status === 'expirado' || s.status === 'cancelado') showExpired();
      } catch (e) { /* tenta de novo no próximo ciclo */ }
    }, 4000);
  }

  function renderTicket(res, data) {
    const z = SIZES.find((x) => x.k === S.size);
    const st = new Date(res.starts_at), en = new Date(res.ends_at);
    const dlabel = T.label(S.ds, { weekday: 'long', day: '2-digit', month: '2-digit' });
    const code = String(res.id).replace(/-/g, '').slice(0, 6).toUpperCase();
    const msg = `Olá, ${shop.name}! Acabei de agendar pelo site${res.paid ? ' e paguei o sinal de ' + brl(res.deposit_amount) + ' pelo Pix' : ''}.\n\nPet: ${data.pet}${data.breed ? ' (' + data.breed + ')' : ''} · porte ${z.k}\nServiço: ${S.svc.name}\nDia: ${dlabel} às ${T.time(st, tz)}\nTutor: ${data.name} · ${fmtPhone(data.phone)}\nCódigo: ${code}`;
    const wa = waLink(shop.whatsapp, msg);
    main.innerHTML = `${contactHtml(shop)}<section class="card ticket" aria-live="polite">
      <div class="check">${ICON.check}</div>
      <div><p class="eyebrow">Horário reservado</p><p class="pet">${esc(data.pet)}</p></div>
      <p class="when">${esc(dlabel)}<br>${T.time(st, tz)} às ${T.time(en, tz)}</p>
      <div class="perf"></div>
      <dl class="summary"><dt>Serviço</dt><dd>${esc(S.svc.name)}</dd><dt>Porte</dt><dd>${esc(z.k)} · ${esc(z.label)}</dd>
        <dt>Valor</dt><dd>${brl(res.price)}</dd>${res.paid ? `<dt>Sinal pago</dt><dd>${brl(res.deposit_amount)}</dd><dt>Restante no dia</dt><dd>${brl(Number(res.price) - Number(res.deposit_amount))}</dd>` : ''}
        <dt>Tutor</dt><dd>${esc(data.name)}</dd><dt>Código</dt><dd>${code}</dd></dl>
      ${shop.remind_24h !== false && st.getTime() - Date.now() >= 12 * 3600e3 ? `<p class="small muted">${ICON.wa} Você vai receber um lembrete no WhatsApp <b>${esc(fmtPhone(data.phone))}</b> um dia antes.</p>` : ''}
      ${wa ? `<a class="btn primary block" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.wa} Enviar confirmação no WhatsApp</a>
        <p class="small muted">Se o WhatsApp não abrir, mande uma mensagem para <b class="num">${esc(fmtPhone(shop.whatsapp))}</b> com o código ${code}.</p>` : ''}
      <button type="button" class="btn ghost" id="again">Fazer outro agendamento</button>
    </section><p class="foot">Agendamento online por PetHora</p>`;
    $('#again').onclick = () => BookingPage(api, mount, slug);
    window.scrollTo({ top: 0, behavior: smooth() });
  }

  renderAll();
  S.timer = setInterval(() => { if (S.busyOk && document.visibilityState === 'visible' && document.body.contains(main)) refreshBusy(true); else if (!document.body.contains(main)) clearInterval(S.timer); }, 30000);
  window.addEventListener('focus', () => { if (S.busyOk && document.body.contains(main)) refreshBusy(true); });
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


/* PetHora — SITE DO CLIENTE: só a página de agendamento de cada petshop.
   Endereços aceitos: /nome-do-petshop ou /?loja=nome-do-petshop (no GitHub Pages: /repositorio/nome-do-petshop) */
boot(async () => {
  const mount = document.getElementById('app');
  let api;
  if (CLOUD) { const sb = await supabaseClient(mount); if (!sb) return; api = SupabaseAdapter(sb); }
  else api = DemoAdapter();
  const path = location.pathname.slice(BASE.length).replace(/\/+$/, '').replace(/\/index\.html$/, '');
  const m = path.match(/^\/(?:p\/)?([a-z0-9][a-z0-9-]{1,40}[a-z0-9])$/);
  const slug = (m && m[1]) || new URLSearchParams(location.search).get('loja') || CFG.homeShop || (CLOUD ? '' : 'patas-e-bolhas');
  if (slug) return BookingPage(api, mount, slug);
  applyBrand('#1F6F6B');
  document.title = 'Agendamento de banho e tosa';
  mount.innerHTML = `<div class="auth gutter"><div class="brandmark"><i>${ICON.paw}</i>PetHora</div><div class="card">
    <h2>Agende o banho e a tosa do seu pet</h2><p class="muted">Use o link que o seu petshop enviou. Ele termina com o nome do petshop, por exemplo <b>/patas-e-bolhas</b>.</p></div></div>`;
});

})();
