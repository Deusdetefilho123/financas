import { interpretar, CATEGORIAS, FORMAS } from './parser.js';

const VERSAO_FIREBASE = '10.12.2';
const CARTOES_PADRAO = ['Nubank', 'Inter', 'Itaú', 'Bradesco', 'Santander', 'C6'];
const CHAVES_CFG = ['cartoes', 'cartoesInfo', 'terceiros', 'lojas'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const soma = (l) => l.reduce((t, x) => t + x.valorCent, 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const rotCat = Object.fromEntries(CATEGORIAS);
const rotForma = { ...Object.fromEntries(FORMAS), '': 'Não informada' };
const guarda = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } },
  por(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço ou bloqueado */ } },
};

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, '0');
const hojeYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mesDe = (ymd) => ymd.slice(0, 7);
function somaMes(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function somaMesData(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const ultimo = new Date(y, m + n, 0).getDate();
  const r = new Date(y, m - 1 + n, Math.min(d, ultimo));
  return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`;
}
const nomeMes = (mes) => new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const nomeDia = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDM = (ymd) => ymd.slice(8, 10) + '/' + ymd.slice(5, 7); // 2026-12-10 -> 10/12

// ---------- estado ----------
const filtroVazio = () => ({ quem: '', forma: '', categoria: '', cartao: '', terceiro: '', loja: '' });
const S = {
  tab: 'inicio', mes: mesDe(hojeYmd()), itens: [],
  cartoes: CARTOES_PADRAO, cartoesInfo: [], terceiros: [], lojas: [],
  nome: guarda.ler('fin_nome', ''), nuvem: false, usuario: null, erroNuvem: '',
  filtro: filtroVazio(), edNovo: {},
};
const infoCartao = (nome) => S.cartoesInfo.find((c) => c.nome === nome) || {};

// ---------- armazenamento: neste aparelho ----------
const Local = {
  iniciar() {
    S.itens = guarda.ler('fin_itens', []);
    CHAVES_CFG.forEach((k) => { S[k] = guarda.ler('fin_' + k, S[k]); });
    mostrarApp();
  },
  salvar(lista) {
    const mapa = new Map(S.itens.map((x) => [x.id, x]));
    lista.forEach((l) => mapa.set(l.id, l));
    S.itens = [...mapa.values()]; guarda.por('fin_itens', S.itens); render();
  },
  apagar(ids) { S.itens = S.itens.filter((x) => !ids.includes(x.id)); guarda.por('fin_itens', S.itens); render(); },
  salvarCfg(p) { Object.assign(S, p); Object.keys(p).forEach((k) => guarda.por('fin_' + k, p[k])); },
  garantirPeriodo() {},
};

// ---------- armazenamento: nuvem (Firebase) ----------
const Nuvem = {
  fb: null, db: null, auth: null, desde: null, parar: null,
  async iniciar(cfg) {
    const base = `https://www.gstatic.com/firebasejs/${VERSAO_FIREBASE}/`;
    const [a, au, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const app = a.initializeApp(cfg);
    this.fb = { ...au, ...fs };
    this.auth = au.getAuth(app);
    try {
      this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch { this.db = fs.getFirestore(app); }
    au.onAuthStateChanged(this.auth, (u) => {
      S.usuario = u;
      if (u) { this.desde = somaMes(mesDe(hojeYmd()), -12) + '-01'; this.assinar(); mostrarApp(); }
      else { this.parar?.(); this.pararCfg?.(); S.itens = []; mostrarLogin(); }
    });
  },
  assinar() {
    const f = this.fb;
    this.parar?.();
    const q = f.query(f.collection(this.db, 'lancamentos'), f.where('data', '>=', this.desde));
    this.parar = f.onSnapshot(q, (snap) => { S.erroNuvem = ''; S.itens = snap.docs.map((d) => d.data()); render(); }, (e) => this.falha(e));
    this.pararCfg?.();
    this.pararCfg = f.onSnapshot(f.doc(this.db, 'config', 'geral'), (d) => {
      const c = d.data() || {};
      CHAVES_CFG.forEach((k) => { if (Array.isArray(c[k])) S[k] = c[k]; });
      if (S.tab !== 'ajustes') render(); // em Ajustes a tela já mostra o que foi digitado
    }, () => {});
  },
  falha(e) {
    S.erroNuvem = e?.code === 'permission-denied'
      ? 'Este e-mail não está autorizado nas regras do Firestore. Confira as regras no console do Firebase.'
      : 'Não consegui falar com a nuvem: ' + (e?.message || e);
    render();
  },
  salvar(lista) {
    const b = this.fb.writeBatch(this.db);
    lista.forEach((l) => b.set(this.fb.doc(this.db, 'lancamentos', l.id), l));
    b.commit().catch((e) => this.falha(e));
  },
  apagar(ids) {
    const b = this.fb.writeBatch(this.db);
    ids.forEach((id) => b.delete(this.fb.doc(this.db, 'lancamentos', id)));
    b.commit().catch((e) => this.falha(e));
  },
  salvarCfg(p) { Object.assign(S, p); this.fb.setDoc(this.fb.doc(this.db, 'config', 'geral'), p, { merge: true }).catch((e) => this.falha(e)); },
  // só baixa os últimos 12 meses; meses mais antigos são buscados quando você navega até eles
  garantirPeriodo(mes) { if (mes + '-01' < this.desde) { this.desde = mes + '-01'; this.assinar(); } },
};
let Dados = Local;

// ---------- telas ----------
function mostrarLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#nav').hidden = true; }
function mostrarApp() {
  $('#login').hidden = true; $('#app').hidden = false; $('#nav').hidden = false;
  if (!S.nome) {
    const sugestao = S.usuario?.email ? S.usuario.email.split('@')[0] : '';
    const n = (prompt('Como você se chama? (aparece em "quem gastou")', sugestao) || sugestao || 'Eu').trim();
    S.nome = n.charAt(0).toUpperCase() + n.slice(1); guarda.por('fin_nome', S.nome);
  }
  render();
}

const doMes = (mes) => S.itens.filter((x) => mesDe(x.data) === mes);
const ordenar = (l) => [...l].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (b.criadoEm || 0) - (a.criadoEm || 0)));
const pessoas = () => [...new Set([S.nome, ...S.itens.map((x) => x.quem)].filter(Boolean))];
const chaveForma = (x) => (x.terceiro ? 'terceiro' : x.forma || 'nao');
const rotFormaItem = (x) => (x.terceiro ? 'Cartão: ' + x.terceiro : x.forma === 'crediario' ? (x.loja ? 'Loja: ' + x.loja : 'Carnê') : rotForma[x.forma || '']);

// dia de vencimento cadastrado para o cartão, a pessoa ou a loja do lançamento
function vencDe(x) {
  if (x.terceiro) return S.terceiros.find((t) => t.nome === x.terceiro)?.venc || null;
  if (x.forma === 'crediario') return S.lojas.find((t) => t.nome === x.loja)?.venc || null;
  if (x.forma === 'credito' && x.cartao) return infoCartao(x.cartao).venc || null;
  return null;
}
// data em que a parcela vence: o próximo "dia do vencimento" a partir da data da parcela
function dataVenc(x) {
  const v = vencDe(x);
  return v ? vencData(x.data, v) : x.data;
}
const aPrazo = (x) => x.tipo !== 'receita' && (x.forma === 'crediario' || (x.forma === 'credito' && (x.cartao || x.terceiro)));
function vencData(ymd, v) {
  const [y, m, d] = ymd.split('-').map(Number);
  const mm = v >= d ? m : m + 1;
  const r = new Date(y, mm - 1, Math.min(v, new Date(y, mm, 0).getDate()));
  return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`;
}

function totais(l) {
  let g = 0, r = 0;
  l.forEach((x) => (x.tipo === 'receita' ? (r += x.valorCent) : (g += x.valorCent)));
  return { g, r, s: r - g };
}
function htmlTotais(l) {
  const t = totais(l);
  return `<div class="totais">
    <div><small>Gastos</small><b class="neg">${brl(t.g)}</b></div>
    <div><small>Receitas</small><b class="pos">${brl(t.r)}</b></div>
    <div><small>Saldo</small><b class="${t.s < 0 ? 'neg' : 'pos'}">${brl(t.s)}</b></div></div>`;
}
// Mostrador: quanto das receitas do mês já foi gasto
function htmlMostrador(l) {
  const t = totais(l);
  const pct = t.r ? Math.round((t.g / t.r) * 100) : 0;
  const passou = t.r > 0 && t.g > t.r;
  const txt = !t.r ? (t.g ? 'Nenhuma receita lançada neste mês para comparar.' : 'Nada lançado neste mês.')
    : passou ? `Os gastos passaram das receitas em ${brl(-t.s)}.`
    : `Você gastou ${pct}% das receitas. Sobram ${brl(t.s)}.`;
  return `<div class="medidor${passou ? ' est' : ''}" role="img" aria-label="${esc(txt)}"><u style="width:${t.r ? Math.min(100, pct) : 0}%"></u></div><p class="dica">${txt}</p>`;
}
function htmlItem(x, comData) {
  const meta = [rotCat[x.categoria] || 'Outros', rotFormaItem(x), !x.terceiro && x.forma !== 'crediario' ? x.cartao : '', x.pago ? 'Pago' : '',
    x.quem, comData ? nomeDia(x.data) : ''].filter(Boolean).join(' · ');
  const parc = x.parcela ? ` (${x.parcela.n}/${x.parcela.total})` : '';
  return `<button class="item" type="button" data-id="${esc(x.id)}">
    <div class="t"><b>${esc(x.descricao)}${parc}</b><span>${esc(meta)}</span>${aPrazo(x) && !x.pago && vencDe(x) ? `<span class="prox">Vence ${fmtDM(dataVenc(x))}</span>` : ''}</div>
    <div class="v ${x.tipo === 'receita' ? 'pos' : 'neg'}">${x.tipo === 'receita' ? '+' : '−'} ${brl(x.valorCent)}</div></button>`;
}
// Em "Últimos lançamentos", uma compra parcelada aparece uma vez só, com a próxima parcela a vencer
function htmlCompraParcelada(x) {
  const parcelas = S.itens.filter((y) => y.parcela?.grupo === x.parcela.grupo).sort((a, b) => a.parcela.n - b.parcela.n);
  const prox = parcelas.find((y) => !y.pago);
  const meta = [rotCat[x.categoria] || 'Outros', rotFormaItem(x), !x.terceiro && x.forma !== 'crediario' ? x.cartao : '', x.quem].filter(Boolean).join(' · ');
  const linha2 = prox ? `Próxima: ${prox.parcela.n}/${prox.parcela.total} em ${fmtDM(dataVenc(prox))}` : 'Todas as parcelas pagas';
  return `<button class="item" type="button" data-id="${esc((prox || x).id)}">
    <div class="t"><b>${esc(x.descricao)} (${x.parcela.total}x)</b><span>${esc(meta)}</span><span class="prox">${esc(linha2)}</span></div>
    <div class="v neg">− ${brl((prox || x).valorCent)}</div></button>`;
}
const htmlMes = () => `<div class="mes"><button type="button" data-mes="-1" aria-label="Mês anterior">‹</button><b>${nomeMes(S.mes)}</b><button type="button" data-mes="1" aria-label="Próximo mês">›</button></div>`;

// ---------- quadros: meus cartões, outras pessoas, lojas ----------
const doCampo = (campo, nome) => S.itens.filter((x) => x.tipo !== 'receita'
  && (campo === 'cartao' ? x.forma === 'credito' && !x.terceiro && x.cartao === nome : x[campo] === nome));
const porParcela = (a, b) => a.parcela.n - b.parcela.n;

// próximo vencimento entre o que ainda não foi pago: data e valor que vence nesse dia
function proximoVenc(dele) {
  const abertos = dele.filter((x) => !x.pago);
  if (!abertos.length) return null;
  const data = abertos.map(dataVenc).sort()[0];
  return { data, valor: soma(abertos.filter((x) => dataVenc(x) === data)) };
}
// uma linha por compra parcelada em aberto: "Sofá: 3 de 10 pagas · próxima 4/10 em 20/12"
function linhasCompras(dele) {
  const grupos = new Map();
  dele.filter((x) => x.parcela).forEach((x) => { if (!grupos.has(x.parcela.grupo)) grupos.set(x.parcela.grupo, []); grupos.get(x.parcela.grupo).push(x); });
  return [...grupos.values()].map((g) => {
    const prox = g.sort(porParcela).find((x) => !x.pago);
    return prox ? `${prox.descricao}: ${prox.parcela.n - 1} de ${prox.parcela.total} pagas · próxima ${prox.parcela.n}/${prox.parcela.total} em ${fmtDM(dataVenc(prox))}` : null;
  }).filter(Boolean);
}
const botaoPagar = (campo, nome, mes, pend, acao) => `<button type="button" class="btn mini${pend ? '' : ' sec'}" data-pagar="${pend ? 1 : 0}" data-campo="${campo}" data-nome="${esc(nome)}" data-m="${mes}">${pend ? acao : 'Pago ✓'}</button>`;

function htmlQuadro(titulo, campo, mes, linhas) {
  if (!linhas.length) return '';
  return `<div class="card"><h2>${titulo} · ${nomeMes(mes)}</h2>${linhas.map((l) => `<div class="deve-b"><div class="deve">
    <button type="button" class="deve-t" data-ir="${campo}" data-valor="${esc(l.nome)}"><b>${esc(l.nome)}</b>${l.subs.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</button>
    <div class="deve-v"><b>${l.total ? brl(l.total) : '—'}</b>${l.botao || '<span>Nada neste mês</span>'}</div>
    </div>${l.compras?.length ? `<div class="deve-c">${l.compras.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}${l.extra || ''}</div>`).join('')}</div>`;
}
function linhasDevo(campo, cadastro, mes, fora = []) {
  const nomes = [...new Set([...cadastro.map((t) => t.nome), ...S.itens.map((x) => x[campo]).filter(Boolean)])].filter((n) => !fora.includes(n));
  return nomes.map((nome) => {
    const dele = doCampo(campo, nome), noMes = dele.filter((x) => mesDe(x.data) === mes);
    const resta = soma(dele.filter((x) => !x.pago)), prox = proximoVenc(dele), total = soma(noMes), pend = soma(noMes.filter((x) => !x.pago));
    return { nome, total, resta, compras: linhasCompras(dele), botao: total ? botaoPagar(campo, nome, mes, pend, 'Marcar pago') : '',
      subs: [prox ? `Próximo vencimento: ${fmtDM(prox.data)} · ${brl(prox.valor)}` : 'Tudo pago', resta ? `Ainda devo ${brl(resta)} no total` : ''] };
  }).filter((l) => l.total || l.resta);
}
// lojas com pagamento mensal opcional (ex.: planilha de corrida): só vira gasto no mês em que for marcado como pago
function linhasMensais(mes) {
  return S.lojas.filter((t) => t.parcelado === false).map((t) => {
    const noMes = doCampo('loja', t.nome).filter((x) => mesDe(x.data) === mes);
    const pago = noMes.length > 0 && noMes.every((x) => x.pago);
    const [y, m] = mes.split('-').map(Number), dia = Math.min(t.venc || 1, new Date(y, m, 0).getDate());
    return { nome: t.nome, total: noMes.length ? soma(noMes) : t.valor || 0,
      subs: ['Pagamento mensal opcional', pago ? 'Pago neste mês' : t.venc ? `Vence ${pad(dia)}/${pad(m)}` : ''],
      botao: `<button type="button" class="btn mini${pago ? ' sec' : ''}" data-mensal="${pago ? 0 : 1}" data-nome="${esc(t.nome)}" data-m="${mes}">${pago ? 'Pago ✓' : 'Marcar pago'}</button>` };
  });
}
function htmlCartoes(mes) {
  const usados = S.itens.filter((x) => x.forma === 'credito' && !x.terceiro && x.cartao).map((x) => x.cartao);
  const nomes = [...new Set([...S.cartoes, ...usados])];
  return htmlQuadro('Meus cartões', 'cartao', mes, nomes.map((nome) => {
    const dele = doCampo('cartao', nome), noMes = dele.filter((x) => mesDe(x.data) === mes);
    const { limite, venc } = infoCartao(nome), usado = soma(dele.filter((x) => !x.pago)), prox = proximoVenc(dele);
    const total = soma(noMes), pend = soma(noMes.filter((x) => !x.pago));
    let extra = '';
    if (limite) {
      const livre = limite - usado, pct = Math.min(100, Math.round((usado / limite) * 100));
      extra = `<div class="lim${livre < 0 ? ' est' : ''}"><i><u style="width:${pct}%"></u></i>
        <span>Limite ${brl(limite)} · usado ${brl(usado)} · ${livre < 0 ? `<b class="neg">estourado em ${brl(-livre)}</b>` : `<b>disponível ${brl(livre)}</b>`}</span></div>`;
    }
    const quando = venc ? fmtDM(prox ? prox.data : vencData(hojeYmd(), venc)) : '';
    return { nome, total, usado, limite, extra, botao: total ? botaoPagar('cartao', nome, mes, pend, 'Marcar fatura paga') : '',
      subs: ['Fatura do mês', quando ? `Próximo vencimento: ${quando}` : ''] };
  }).filter((l) => l.total || l.usado || l.limite));
}
const htmlQuadros = (mes) => {
  const opcionais = S.lojas.filter((t) => t.parcelado === false).map((t) => t.nome);
  return htmlCartoes(mes) + htmlQuadro('Devo a outras pessoas', 'terceiro', mes, linhasDevo('terceiro', S.terceiros, mes))
    + htmlQuadro('Lojas e mensalidades', 'loja', mes, [...linhasDevo('loja', S.lojas.filter((t) => t.parcelado !== false), mes, opcionais), ...linhasMensais(mes)]);
};

// janela de confirmação / aviso (devolve true se a pessoa confirmou)
function caixa(titulo, html, rotOk, comCancelar, validar) {
  return new Promise((resolver) => {
    const d = $('#caixa'); let ok = false;
    $('#cxTitulo').textContent = titulo; $('#cxCorpo').innerHTML = html; $('#cxErro').textContent = '';
    $('#cxSim').textContent = rotOk; $('#cxNao').hidden = !comCancelar;
    $('#formCaixa').onsubmit = (e) => { e.preventDefault(); const er = validar?.(); if (er) { $('#cxErro').textContent = er; return; } ok = true; d.close(); };
    $('#cxNao').onclick = () => d.close();
    d.onclose = () => resolver(ok);
    d.showModal();
  });
}
const perguntar = (titulo, html, rotOk, validar) => caixa(titulo, html, rotOk, true, validar);
const avisar = (titulo, linhas) => caixa(titulo, linhas.map((l) => `<p>${esc(l)}</p>`).join(''), 'OK', false);

async function marcarPago(campo, nome, mes, pago) {
  const l = doCampo(campo, nome).filter((x) => mesDe(x.data) === mes && !!x.pago !== pago);
  if (!l.length) return;
  const oQue = campo === 'cartao' ? `a fatura de ${nomeMes(mes)} do cartão ${nome}` : `as parcelas de ${nomeMes(mes)} de ${nome}`;
  const ok = await perguntar(pago ? 'Marcar como pago?' : 'Desmarcar o pagamento?',
    `<p>${pago ? (campo === 'cartao' ? 'Marcar como paga' : 'Marcar como pagas') : 'Voltar para "a pagar"'} ${esc(oQue)}, no valor de <b>${brl(soma(l))}</b>?</p>`, pago ? 'Marcar pago' : 'Desmarcar');
  if (!ok) return;
  Dados.salvar(l.map((x) => ({ ...x, pago })));
  if (!pago) { toast('Pagamento desmarcado.'); return; }
  // resumo do que foi quitado e do que vem a seguir
  const quitados = new Set(l.map((x) => x.id)), linhas = [];
  let avulsas = 0;
  for (const x of l) {
    if (!x.parcela) { if (campo === 'cartao') avulsas++; else linhas.push(`${x.descricao}: quitado.`); continue; }
    const prox = S.itens.filter((y) => y.parcela?.grupo === x.parcela.grupo && y.parcela.n > x.parcela.n && !y.pago && !quitados.has(y.id)).sort(porParcela)[0];
    linhas.push(`${x.descricao}: parcela ${x.parcela.n}/${x.parcela.total} quitada. `
      + (prox ? `Próxima: ${prox.parcela.n}/${prox.parcela.total} em ${fmtDM(dataVenc(prox))}.` : 'Compra encerrada.'));
  }
  if (avulsas) linhas.push(`${avulsas} compra${avulsas > 1 ? 's' : ''} sem parcelamento: quitada${avulsas > 1 ? 's' : ''}.`);
  const lim = campo === 'cartao' ? infoCartao(nome).limite : null;
  if (lim) linhas.push(`Limite disponível agora: ${brl(lim - soma(doCampo('cartao', nome).filter((x) => !x.pago && !quitados.has(x.id))))}.`);
  avisar('Pagamento registrado', linhas);
}
async function pagarMensal(nome, mes, pagar) {
  const loja = S.lojas.find((t) => t.nome === nome) || {};
  const noMes = doCampo('loja', nome).filter((x) => mesDe(x.data) === mes);
  if (!pagar) {
    const ok = await perguntar('Desmarcar o pagamento?', `<p>Remover o pagamento de <b>${esc(nome)}</b> em ${nomeMes(mes)} (${brl(soma(noMes))})? O gasto sai do mês.</p>`, 'Desmarcar');
    if (!ok) return;
    const mensais = noMes.filter((x) => x.mensal), outros = noMes.filter((x) => !x.mensal);
    if (mensais.length) Dados.apagar(mensais.map((x) => x.id));
    if (outros.length) Dados.salvar(outros.map((x) => ({ ...x, pago: false })));
    toast('Pagamento desmarcado.'); return;
  }
  const ok = await perguntar('Marcar como pago?', `<p>Registrar o pagamento de <b>${esc(nome)}</b> em ${nomeMes(mes)}?</p>
    <div class="campo"><label for="cxValor">Valor pago (R$)</label><input id="cxValor" inputmode="decimal" autocomplete="off" value="${noMes.length ? fmtNum(soma(noMes)) : loja.valor ? fmtNum(loja.valor) : ''}"></div>`,
    'Marcar pago', () => (lerValor($('#cxValor').value) > 0 ? '' : 'Informe o valor pago.'));
  if (!ok) return;
  const valorCent = lerValor($('#cxValor').value);
  if (noMes.length) { Dados.salvar(noMes.map((x, i) => ({ ...x, pago: true, valorCent: noMes.length === 1 ? valorCent : x.valorCent }))); }
  else {
    const [y, m] = mes.split('-').map(Number), dia = Math.min(loja.venc || 1, new Date(y, m, 0).getDate());
    Dados.salvar([{ id: uid(), tipo: 'gasto', valorCent, descricao: nome, categoria: 'assinaturas', forma: 'crediario', cartao: null, terceiro: null,
      loja: nome, pago: true, mensal: true, data: mes === mesDe(hojeYmd()) ? hojeYmd() : `${mes}-${pad(dia)}`, quem: S.nome, parcela: null, criadoEm: Date.now() }]);
  }
  toast(`Pagamento de ${nome} registrado: ${brl(valorCent)}.`);
}

function telaInicio() {
  const mesAtual = mesDe(hojeYmd()), l = doMes(mesAtual);
  const vistos = new Set(), ultimos = [];
  for (const x of [...S.itens].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))) {
    const g = x.parcela?.grupo;
    if (g) { if (vistos.has(g)) continue; vistos.add(g); }
    ultimos.push(x); if (ultimos.length === 8) break;
  }
  return `<div class="card"><h2>${nomeMes(mesAtual)}</h2>${htmlTotais(l)}${htmlMostrador(l)}</div>
    ${htmlQuadros(mesAtual)}
    <div class="card"><h2>Últimos lançamentos</h2>${ultimos.length ? ultimos.map((x) => (x.parcela ? htmlCompraParcelada(x) : htmlItem(x, true))).join('')
      : '<div class="vazio">Nada lançado ainda. Use a caixa acima.</div>'}</div>`;
}

function telaLista() {
  const f = S.filtro;
  let l = doMes(S.mes).filter((x) => (!f.quem || x.quem === f.quem) && (!f.forma || chaveForma(x) === f.forma)
    && (!f.categoria || x.categoria === f.categoria) && (!f.cartao || x.cartao === f.cartao)
    && (!f.terceiro || x.terceiro === f.terceiro) && (!f.loja || x.loja === f.loja));
  l = ordenar(l);
  const sel = (nome, rot, ops) => `<select data-filtro="${nome}" aria-label="${rot}"><option value="">${rot}</option>${ops.map(([v, t]) => `<option value="${esc(v)}"${f[nome] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  let corpo = '', dia = '';
  for (const x of l) {
    if (x.data !== dia) {
      dia = x.data;
      const t = totais(l.filter((y) => y.data === dia));
      corpo += `<div class="dia"><span>${nomeDia(dia)}</span><span>${t.g ? '− ' + brl(t.g) : ''}</span></div>`;
    }
    corpo += htmlItem(x);
  }
  const so = f.cartao ? `o cartão ${f.cartao}` : f.terceiro ? `o cartão de ${f.terceiro}` : f.loja ? `a loja ${f.loja}` : '';
  return `${htmlMes()}
    <div class="filtros">${sel('quem', 'Pessoa', pessoas().map((p) => [p, p]))}${sel('forma', 'Forma', [...FORMAS, ['terceiro', 'Cartão de outra pessoa'], ['nao', 'Não informada']])}${sel('categoria', 'Categoria', CATEGORIAS)}</div>
    ${so ? `<div class="aviso">Mostrando só ${esc(so)}. <button type="button" data-limpa-filtro style="background:none;border:0;text-decoration:underline;color:inherit;padding:0">Mostrar todos</button></div>` : ''}
    <div class="card">${htmlTotais(l)}</div>
    <div class="card">${corpo || '<div class="vazio">Nenhum lançamento neste mês.</div>'}</div>`;
}

function telaResumo() {
  const l = doMes(S.mes), gastos = l.filter((x) => x.tipo !== 'receita');
  const grupo = (lista, chave, rotulo) => {
    const m = new Map();
    lista.forEach((x) => { const k = chave(x); if (k != null) m.set(k, (m.get(k) || 0) + x.valorCent); });
    const linhas = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const max = linhas[0]?.[1] || 1;
    return linhas.map(([k, v]) => ({ k, v, rot: rotulo(k), pct: Math.round((v / max) * 100) }));
  };
  const bloco = (titulo, filtro, linhas) => `<div class="card"><h2>${titulo}</h2>${linhas.length ? linhas.map((r) =>
    `<button class="barra" type="button" data-ir="${filtro}" data-valor="${esc(r.k)}"><span class="l"><span>${esc(r.rot)}</span><span>${brl(r.v)}</span></span><i><u style="width:${r.pct}%"></u></i></button>`).join('')
    : '<div class="vazio">Sem gastos neste mês.</div>'}</div>`;
  return `${htmlMes()}<div class="card">${htmlTotais(l)}${htmlMostrador(l)}</div>
    ${htmlQuadros(S.mes)}
    ${bloco('Gastos por categoria', 'categoria', grupo(gastos, (x) => x.categoria || 'outros', (k) => rotCat[k] || k))}
    ${bloco('Por forma de pagamento', 'forma', grupo(gastos, chaveForma, (k) => (k === 'nao' ? 'Não informada' : k === 'terceiro' ? 'Cartão de outra pessoa' : rotForma[k])))}
    ${bloco('Por pessoa', 'quem', grupo(gastos, (x) => x.quem || '?', (k) => k))}`;
}

function htmlEditor(tipo, titulo, lista, comLimite, rotAdd, dica) {
  const linhas = [...lista, ...Array.from({ length: S.edNovo[tipo] || 0 }, () => ({}))];
  return `<div class="card"><h2>${titulo}</h2><div data-ed="${tipo}" class="${comLimite ? 'ed3' : 'ed2'}">
    ${linhas.length ? `<div class="ed-l ed-cab"><span>Nome</span>${comLimite ? '<span>Limite (R$)</span>' : ''}<span>Venc.</span><span></span></div>` : ''}
    ${linhas.map((l) => `<div class="ed-l"><input data-c="nome" aria-label="Nome" value="${esc(l.nome || '')}">${comLimite
      ? `<input data-c="limite" inputmode="decimal" aria-label="Limite em reais" placeholder="sem limite" value="${l.limite ? fmtNum(l.limite) : ''}">` : ''}<input data-c="venc" inputmode="numeric" aria-label="Dia do vencimento" placeholder="dia" value="${l.venc || ''}"><button type="button" data-rm aria-label="Remover ${esc(l.nome || 'linha')}">×</button>${tipo === 'lojas'
      ? `<div class="ed-x"><label><input type="checkbox" data-c="parcelado"${l.parcelado !== false ? ' checked' : ''}> Parcelado</label>${l.parcelado === false
        ? `<label>Valor mensal (R$) <input data-c="valor" inputmode="decimal" aria-label="Valor mensal em reais" value="${l.valor ? fmtNum(l.valor) : ''}"></label>` : ''}</div>` : ''}</div>`).join('')}
    </div><button class="btn sec bloco" type="button" data-add="${tipo}">${rotAdd}</button><p class="dica">${dica}</p></div>`;
}
function salvarEditor(tipo) {
  const vistos = new Set();
  const linhas = [...document.querySelectorAll(`[data-ed="${tipo}"] .ed-l:not(.ed-cab)`)].map((l) => {
    const v = (c) => l.querySelector(`[data-c=${c}]`)?.value.trim() || '';
    const venc = parseInt(v('venc'), 10), lim = lerValor(v('limite'));
    const val = lerValor(v('valor'));
    return { nome: v('nome'), limite: lim > 0 ? lim : null, venc: venc >= 1 && venc <= 31 ? venc : null,
      parcelado: l.querySelector('[data-c=parcelado]')?.checked !== false, valor: val > 0 ? val : null };
  }).filter((l) => l.nome && !vistos.has(l.nome) && vistos.add(l.nome));
  S.edNovo[tipo] = 0;
  if (tipo === 'cartoes') Dados.salvarCfg({ cartoes: linhas.map((l) => l.nome), cartoesInfo: linhas });
  else if (tipo === 'lojas') Dados.salvarCfg({ lojas: linhas.map(({ nome, venc, parcelado, valor }) => ({ nome, venc, parcelado, valor: parcelado ? null : valor })) });
  else Dados.salvarCfg({ [tipo]: linhas.map(({ nome, venc }) => ({ nome, venc })) });
}

function telaAjustes() {
  const locais = guarda.ler('fin_itens', []).length;
  const sinc = S.nuvem
    ? `<p>Sincronizando na nuvem como <b>${esc(S.usuario?.email || '')}</b>. Tudo o que um lança aparece no celular do outro.</p>
       ${locais ? `<button class="btn sec bloco" type="button" id="aEnviar">Enviar para a nuvem os ${locais} lançamentos salvos só neste aparelho</button>` : ''}
       <button class="btn perigo bloco" type="button" id="aSair">Sair da conta</button>`
    : `<p>Os dados estão <b>só neste aparelho</b>. Para os dois celulares verem os mesmos lançamentos, preencha o arquivo <code>config.js</code> com os dados do Firebase (passo a passo no LEIAME).</p>`;
  return `<div class="card"><h2>Seu nome</h2><div class="campo" style="margin:0"><input id="aNome" aria-label="Seu nome" value="${esc(S.nome)}"></div></div>
    ${htmlEditor('cartoes', 'Meus cartões', S.cartoes.map((nome) => ({ nome, ...infoCartao(nome) })), true, 'Adicionar cartão',
      'O limite e o dia do vencimento são opcionais. O limite volta a ficar disponível quando você marca a fatura como paga.')}
    ${htmlEditor('terceiros', 'Cartões de outras pessoas', S.terceiros, false, 'Adicionar pessoa',
      'Nas frases, diga "no cartão da mãe" ou "no cartão do pai".')}
    ${htmlEditor('lojas', 'Lojas e mensalidades', S.lojas, false, 'Adicionar loja ou mensalidade',
      'Parcelado: compra com número certo de parcelas; diga "no carnê da" e o nome da loja. Sem marcar: pagamento mensal opcional, que só entra como gasto no mês em que você marcar como pago.')}
    <div class="card"><h2>Sincronização</h2>${sinc}</div>
    <div class="card"><h2>Seus dados</h2>
      <button class="btn sec bloco" type="button" id="aCsv">Exportar planilha (CSV)</button>
      <button class="btn sec bloco" type="button" id="aJson">Baixar cópia de segurança (JSON)</button>
      ${S.nuvem ? '<p class="dica">A exportação inclui os meses já carregados (os últimos 12, mais os que você abriu).</p>' : ''}</div>`;
}

function render() {
  if ($('#app').hidden) return;
  $('#lancar').hidden = S.tab !== 'inicio';
  $('#modo').textContent = S.nuvem ? (navigator.onLine ? 'Nuvem' : 'Sem internet') : 'Só neste aparelho';
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const ativo = document.activeElement;
  if (S.tab === 'ajustes' && ativo?.tagName === 'INPUT' && $('#tela').contains(ativo)) return; // não apaga o que está sendo digitado
  const tela = { inicio: telaInicio, lista: telaLista, resumo: telaResumo, ajustes: telaAjustes }[S.tab]();
  $('#tela').innerHTML = (S.erroNuvem ? `<div class="aviso">${esc(S.erroNuvem)}</div>` : '') + tela;
}

// ---------- folha de conferência / edição ----------
let emEdicao = null, extra = {}, formaAnterior = null;
function lerValor(txt) {
  let s = String(txt).replace(/[^\d.,]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) ? n : 0;
}
const formaMarcada = () => document.querySelector('#fFormas input:checked')?.value || '';
// O campo "Cartão" muda conforme a forma: seus cartões, cartões de outras pessoas ou lojas
function montarCartoes(forma, sel) {
  const op = (v, t) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`;
  let h = '<option value="">—</option>';
  if (forma === 'crediario') {
    h += [...new Set([...S.lojas.map((t) => t.nome), extra.loja].filter(Boolean))].map((n) => op('l:' + n, n)).join('');
  } else {
    h += [...new Set([...S.cartoes, extra.cartao].filter(Boolean))].map((c) => op(c, c)).join('');
    const outros = [...new Set([...S.terceiros.map((t) => t.nome), extra.terceiro].filter(Boolean))];
    if (forma === 'credito' && outros.length) h += `<optgroup label="De outra pessoa">${outros.map((n) => op('t:' + n, 'Cartão: ' + n)).join('')}</optgroup>`;
  }
  $('#fCartao').innerHTML = h;
  $('#lCartao').textContent = forma === 'crediario' ? 'Loja' : 'Cartão';
}
function ajustarCampos() {
  const tipo = document.querySelector('input[name=tipo]:checked')?.value;
  const f = formaMarcada();
  if (f !== formaAnterior) { montarCartoes(f, $('#fCartao').value); formaAnterior = f; }
  const cv = $('#fCartao').value;
  $('#cCartao').hidden = !['credito', 'debito', 'crediario'].includes(f);
  $('#cParc').hidden = !!emEdicao || tipo === 'receita';
  $('#cPago').hidden = tipo === 'receita' || !((f === 'credito' && cv) || f === 'crediario');
  const n = Math.max(1, parseInt($('#fParc').value, 10) || 1);
  $('#cParc2').hidden = $('#cParc').hidden || n < 2;
  const v = lerValor($('#fValor').value);
  $('#fCada').textContent = v > 0 ? brl(Math.floor(v / n)) : '—';
  $('#fErro').textContent = '';
}
function abrirFolha(l, avisos = []) {
  emEdicao = l.id ? l : null;
  extra = { cartao: l.cartao, terceiro: l.terceiro, loja: l.loja };
  $('#fTitulo').textContent = emEdicao ? 'Editar lançamento' : 'Conferir lançamento';
  $('#fAvisos').innerHTML = avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('');
  document.querySelectorAll('input[name=tipo]').forEach((r) => (r.checked = r.value === (l.tipo || 'gasto')));
  $('#fValor').value = l.valorCent ? fmtNum(l.valorCent) : '';
  $('#fDesc').value = l.descricao || '';
  $('#fCat').innerHTML = CATEGORIAS.map(([v, t]) => `<option value="${v}"${v === (l.categoria || 'outros') ? ' selected' : ''}>${t}</option>`).join('');
  $('#fData').value = l.data || hojeYmd();
  $('#fFormas').innerHTML = [...FORMAS, ['', 'Não sei']].map(([v, t]) => `<label><input type="radio" name="forma" value="${v}"${v === (l.forma || '') ? ' checked' : ''}><span>${t}</span></label>`).join('');
  formaAnterior = l.forma || '';
  montarCartoes(formaAnterior, l.terceiro ? 't:' + l.terceiro : l.loja ? 'l:' + l.loja : l.cartao || '');
  $('#fParc').value = l.parcelas || 1;
  $('#fParcIni').value = 1;
  $('#fPago').checked = !!l.pago;
  const quem = l.quem || S.nome;
  $('#fQuem').innerHTML = [...new Set([...pessoas(), quem])].map((p) => `<option${p === quem ? ' selected' : ''}>${esc(p)}</option>`).join('');
  $('#fApagar').hidden = !emEdicao;
  $('#fApagarTodas').hidden = !emEdicao?.parcela;
  $('#fApagar1').textContent = emEdicao?.parcela ? 'Apagar só esta parcela' : 'Apagar';
  ajustarCampos();
  $('#folha').showModal();
  if (!l.valorCent) $('#fValor').focus();
}
function salvarFolha() {
  const erro = (msg, campo) => { $('#fErro').textContent = msg; campo.focus(); };
  const valorCent = lerValor($('#fValor').value);
  if (valorCent <= 0) return erro('Informe o valor.', $('#fValor'));
  const tipo = document.querySelector('input[name=tipo]:checked')?.value || 'gasto';
  const forma = formaMarcada() || null, cv = $('#fCartao').value;
  const terceiro = forma === 'credito' && cv.startsWith('t:') ? cv.slice(2) : null;
  const loja = forma === 'crediario' && cv.startsWith('l:') ? cv.slice(2) : null;
  const cartao = (forma === 'credito' || forma === 'debito') && cv && !cv.startsWith('t:') && !cv.startsWith('l:') ? cv : null;
  const podePagar = tipo !== 'receita' && (terceiro || forma === 'crediario' || (forma === 'credito' && cartao));
  const base = {
    tipo, valorCent, descricao: $('#fDesc').value.trim() || rotCat[$('#fCat').value], categoria: $('#fCat').value,
    data: $('#fData').value || hojeYmd(), forma, cartao, terceiro, loja, pago: podePagar ? $('#fPago').checked : false,
    quem: $('#fQuem').value || S.nome,
  };
  if (emEdicao) { $('#folha').close(); Dados.salvar([{ ...emEdicao, ...base }]); toast('Alterado.'); return; }
  let n = 1, ini = 1;
  if (tipo !== 'receita') {
    n = parseInt($('#fParc').value, 10) || 1;
    if (n < 1 || n > 72) return erro('Parcelas: informe um número de 1 a 72.', $('#fParc'));
    if (n > 1) {
      ini = parseInt($('#fParcIni').value, 10) || 1;
      if (ini < 1) return erro('A parcela inicial deve ser 1 ou mais.', $('#fParcIni'));
      if (ini > n) return erro(`A parcela inicial (${ini}) é maior que o total de parcelas (${n}).`, $('#fParcIni'));
    }
  }
  $('#folha').close();
  // "Começar na parcela": para compras que já estão sendo pagas, cria só as parcelas que faltam
  const grupo = n > 1 ? uid() : null, cada = Math.floor(valorCent / n), resto = valorCent - cada * n, agora = Date.now();
  const novos = Array.from({ length: n - ini + 1 }, (_, i) => ({
    ...base, id: uid(), valorCent: cada + (i === 0 && ini === 1 ? resto : 0), data: somaMesData(base.data, i),
    parcela: n > 1 ? { n: ini + i, total: n, grupo } : null, pago: base.pago && i === 0, criadoEm: agora - i,
  }));
  Dados.garantirPeriodo(mesDe(base.data));
  Dados.salvar(novos);
  $('#frase').value = '';
  const ids = novos.map((x) => x.id);
  toast(n > 1 ? `Anotado: ${novos.length} parcela${novos.length > 1 ? 's' : ''} de ${brl(cada)}${ini > 1 ? ` (da ${ini}ª à ${n}ª)` : ''}.` : `Anotado: ${brl(valorCent)}.`,
    'Desfazer', () => Dados.apagar(ids));
}

let tempoToast;
function toast(msg, acao, fn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${acao ? `<button type="button">${esc(acao)}</button>` : ''}`;
  t.hidden = false;
  if (acao) t.querySelector('button').onclick = () => { fn(); t.hidden = true; };
  clearTimeout(tempoToast); tempoToast = setTimeout(() => (t.hidden = true), acao ? 7000 : 3000);
}

function lancarFrase() {
  const txt = $('#frase').value.trim();
  if (!txt) { $('#frase').focus(); return; }
  const r = interpretar(txt, { cartoes: S.cartoes, terceiros: S.terceiros.map((t) => t.nome), lojas: S.lojas.map((t) => t.nome) });
  abrirFolha({ ...r, quem: S.nome }, r.avisos);
}

function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportarCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma', 'Cartão', 'Cartão de outra pessoa', 'Loja', 'Pago', 'Parcela', 'Quem', 'Valor']];
  ordenar(S.itens).reverse().forEach((x) => linhas.push([x.data.split('-').reverse().join('/'), x.tipo === 'receita' ? 'Receita' : 'Gasto', x.descricao,
    rotCat[x.categoria] || '', rotForma[x.forma || ''], x.cartao || '', x.terceiro || '', x.loja || '', x.pago ? 'Sim' : '',
    x.parcela ? `${x.parcela.n}/${x.parcela.total}` : '', x.quem || '',
    ((x.tipo === 'receita' ? 1 : -1) * x.valorCent / 100).toFixed(2).replace('.', ',')]));
  baixar(`financas-${hojeYmd()}.csv`, '﻿' + linhas.map((l) => l.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------- eventos ----------
$('#formFrase').addEventListener('submit', (e) => { e.preventDefault(); lancarFrase(); });
$('#formLanc').addEventListener('submit', (e) => { e.preventDefault(); salvarFolha(); });
$('#formLanc').addEventListener('change', ajustarCampos);
$('#formLanc').addEventListener('input', ajustarCampos);
$('#fCancelar').onclick = () => $('#folha').close();
$('#fApagar1').onclick = () => { const x = emEdicao; $('#folha').close(); Dados.apagar([x.id]); toast('Apagado.', 'Desfazer', () => Dados.salvar([x])); };
$('#fApagarTodas').onclick = () => {
  const todas = S.itens.filter((x) => x.parcela?.grupo === emEdicao.parcela.grupo);
  $('#folha').close(); Dados.apagar(todas.map((x) => x.id));
  toast(`${todas.length} parcelas apagadas.`, 'Desfazer', () => Dados.salvar(todas));
};
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  document.activeElement?.blur?.();
  S.tab = b.dataset.tab; S.edNovo = {}; render(); scrollTo(0, 0);
});
$('#modo').onclick = () => { S.tab = 'ajustes'; render(); };
$('#tela').addEventListener('click', (e) => {
  const item = e.target.closest('.item');
  if (item) { const x = S.itens.find((y) => y.id === item.dataset.id); if (x) abrirFolha(x); return; }
  const mes = e.target.closest('[data-mes]');
  if (mes) { S.mes = somaMes(S.mes, Number(mes.dataset.mes)); Dados.garantirPeriodo(S.mes); render(); return; }
  const pg = e.target.closest('[data-pagar]');
  if (pg) { marcarPago(pg.dataset.campo, pg.dataset.nome, pg.dataset.m, pg.dataset.pagar === '1'); return; }
  const ms = e.target.closest('[data-mensal]');
  if (ms) { pagarMensal(ms.dataset.nome, ms.dataset.m, ms.dataset.mensal === '1'); return; }
  const ir = e.target.closest('[data-ir]');
  if (ir) {
    S.filtro = filtroVazio();
    S.filtro[ir.dataset.ir] = ir.dataset.valor;
    if (ir.dataset.ir === 'cartao') S.filtro.forma = 'credito';
    S.tab = 'lista'; render(); scrollTo(0, 0); return;
  }
  if (e.target.closest('[data-limpa-filtro]')) { Object.assign(S.filtro, { cartao: '', terceiro: '', loja: '' }); render(); return; }
  const add = e.target.closest('[data-add]');
  if (add) {
    const tipo = add.dataset.add;
    S.edNovo[tipo] = (S.edNovo[tipo] || 0) + 1; render();
    [...document.querySelectorAll(`[data-ed="${tipo}"] [data-c=nome]`)].pop()?.focus();
    return;
  }
  const rm = e.target.closest('[data-rm]');
  if (rm) { const tipo = rm.closest('[data-ed]').dataset.ed; rm.closest('.ed-l').remove(); salvarEditor(tipo); render(); toast('Removido.'); return; }
  const id = e.target.id;
  if (id === 'aCsv') exportarCsv();
  if (id === 'aJson') baixar(`financas-backup-${hojeYmd()}.json`, JSON.stringify({ itens: S.itens, cartoes: S.cartoes, cartoesInfo: S.cartoesInfo, terceiros: S.terceiros, lojas: S.lojas }, null, 1), 'application/json');
  if (id === 'aSair' && confirm('Sair da conta neste aparelho?')) Nuvem.fb.signOut(Nuvem.auth);
  if (id === 'aEnviar') {
    const locais = guarda.ler('fin_itens', []);
    for (let i = 0; i < locais.length; i += 400) Nuvem.salvar(locais.slice(i, i + 400));
    guarda.por('fin_itens', []); toast('Enviado para a nuvem.'); render();
  }
});
$('#tela').addEventListener('change', (e) => {
  const f = e.target.dataset?.filtro;
  if (f) { S.filtro[f] = e.target.value; render(); return; }
  if (e.target.dataset?.c === 'parcelado') {
    const cx = e.target, nome = cx.closest('.ed-l').querySelector('[data-c=nome]').value.trim() || 'este item';
    perguntar('Confirmar mudança', cx.checked
      ? `<p>Tratar <b>${esc(nome)}</b> como compra parcelada? As parcelas contam como dívida até serem pagas.</p>`
      : `<p>Tratar <b>${esc(nome)}</b> como pagamento mensal opcional? Ele só entra como gasto nos meses em que você marcar como pago.</p>`, 'Confirmar')
      .then((ok) => { if (!ok) { cx.checked = !cx.checked; return; } salvarEditor('lojas'); document.activeElement?.blur?.(); render(); toast('Salvo.'); });
    return;
  }
  const ed = e.target.closest('[data-ed]');
  if (ed) { salvarEditor(ed.dataset.ed); toast('Salvo.'); return; }
  if (e.target.id === 'aNome') { S.nome = e.target.value.trim() || S.nome; guarda.por('fin_nome', S.nome); toast('Nome salvo.'); }
});
$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lErro').textContent = '';
  try { await Nuvem.fb.signInWithEmailAndPassword(Nuvem.auth, $('#lEmail').value.trim(), $('#lSenha').value); }
  catch (err) {
    const c = err?.code || '';
    $('#lErro').textContent = /credential|password|user-not-found|invalid-email/.test(c) ? 'E-mail ou senha incorretos.'
      : /network/.test(c) ? 'Sem internet. Tente de novo.' : /too-many/.test(c) ? 'Muitas tentativas. Espere alguns minutos.' : 'Não consegui entrar: ' + (err?.message || c);
  }
});
addEventListener('online', render); addEventListener('offline', render);

// ---------- voz (reconhecimento do próprio Android, gratuito) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $('#mic'); mic.hidden = false;
  let rec = null;
  mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
    let falou = false;
    rec.onresult = (e) => { $('#frase').value = [...e.results].map((r) => r[0].transcript).join(' ').trim(); falou = true; };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permita o uso do microfone para este app.');
      else if (e.error === 'no-speech') toast('Não ouvi nada. Tente de novo.');
      else if (e.error !== 'aborted') toast('Não consegui ouvir (' + e.error + ').');
    };
    rec.onend = () => { rec = null; mic.classList.remove('ouvindo'); if (falou && $('#frase').value.trim()) lancarFrase(); };
    try { rec.start(); mic.classList.add('ouvindo'); } catch { rec = null; }
  };
} else {
  $('#dica').textContent += ' Para falar, use o microfone do teclado.';
}

// ---------- início ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
const cfg = window.FIREBASE_CONFIG;
if (cfg && cfg.apiKey && cfg.projectId) {
  S.nuvem = true; Dados = Nuvem;
  Nuvem.iniciar(cfg).catch((e) => {
    // sem internet na primeira abertura ou config errada: avisa e segue no aparelho
    S.nuvem = false; Dados = Local; Local.iniciar();
    S.erroNuvem = 'Não consegui ligar a sincronização (' + (e?.message || e) + '). Usando os dados deste aparelho por enquanto.';
    render();
  });
} else Local.iniciar();
