import { interpretar, CATEGORIAS, FORMAS } from './parser.js';

const VERSAO_FIREBASE = '10.12.2';
const CARTOES_PADRAO = ['Nubank', 'Inter', 'Itaú', 'Bradesco', 'Santander', 'C6'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const rotCat = Object.fromEntries(CATEGORIAS);
const rotForma = { ...Object.fromEntries(FORMAS), '': 'Não informada' };
const guarda = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } },
  por(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço ou bloqueado */ } },
};

// ---------- datas ----------
const hojeYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mesDe = (ymd) => ymd.slice(0, 7);
function somaMes(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function somaMesData(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const ultimo = new Date(y, m + n, 0).getDate();
  const r = new Date(y, m - 1 + n, Math.min(d, ultimo));
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
}
const nomeMes = (mes) => new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const nomeDia = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

// ---------- estado ----------
const S = {
  tab: 'inicio', mes: mesDe(hojeYmd()), itens: [], cartoes: CARTOES_PADRAO,
  terceiros: [], nome: guarda.ler('fin_nome', ''), nuvem: false, usuario: null, erroNuvem: '',
  filtro: { quem: '', forma: '', categoria: '', cartao: '', terceiro: '' },
};

// ---------- armazenamento: neste aparelho ----------
const Local = {
  iniciar() {
    S.itens = guarda.ler('fin_itens', []);
    S.cartoes = guarda.ler('fin_cartoes', CARTOES_PADRAO);
    S.terceiros = guarda.ler('fin_terceiros', []);
    mostrarApp();
  },
  salvar(lista) {
    const mapa = new Map(S.itens.map((x) => [x.id, x]));
    lista.forEach((l) => mapa.set(l.id, l));
    S.itens = [...mapa.values()]; guarda.por('fin_itens', S.itens); render();
  },
  apagar(ids) { S.itens = S.itens.filter((x) => !ids.includes(x.id)); guarda.por('fin_itens', S.itens); render(); },
  salvarCartoes(c) { S.cartoes = c; guarda.por('fin_cartoes', c); render(); },
  salvarTerceiros(t) { S.terceiros = t; guarda.por('fin_terceiros', t); render(); },
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
      if (Array.isArray(c.cartoes)) S.cartoes = c.cartoes;
      if (Array.isArray(c.terceiros)) S.terceiros = c.terceiros;
      render();
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
  salvarCartoes(c) { S.cartoes = c; this.fb.setDoc(this.fb.doc(this.db, 'config', 'geral'), { cartoes: c }, { merge: true }).catch((e) => this.falha(e)); render(); },
  salvarTerceiros(t) { S.terceiros = t; this.fb.setDoc(this.fb.doc(this.db, 'config', 'geral'), { terceiros: t }, { merge: true }).catch((e) => this.falha(e)); render(); },
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
function htmlItem(x, comData) {
  const meta = [rotCat[x.categoria] || 'Outros', x.terceiro ? 'Cartão: ' + x.terceiro : rotForma[x.forma || ''], x.terceiro ? (x.pago ? 'Pago' : '') : x.cartao, x.quem, comData ? nomeDia(x.data) : ''].filter(Boolean).join(' · ');
  const parc = x.parcela ? ` (${x.parcela.n}/${x.parcela.total})` : '';
  return `<button class="item" type="button" data-id="${esc(x.id)}">
    <div class="t"><b>${esc(x.descricao)}${parc}</b><span>${esc(meta)}</span></div>
    <div class="v ${x.tipo === 'receita' ? 'pos' : 'neg'}">${x.tipo === 'receita' ? '+' : '−'} ${brl(x.valorCent)}</div></button>`;
}
const htmlMes = () => `<div class="mes"><button type="button" data-mes="-1" aria-label="Mês anterior">‹</button><b>${nomeMes(S.mes)}</b><button type="button" data-mes="1" aria-label="Próximo mês">›</button></div>`;

// Quadro "Devo a outras pessoas": parcelas em cartões de terceiros no mês
function htmlTerceiros(mes) {
  const soma = (l) => l.reduce((t, x) => t + x.valorCent, 0);
  const todos = S.itens.filter((x) => x.terceiro && x.tipo !== 'receita');
  const nomes = [...new Set([...S.terceiros.map((t) => t.nome), ...todos.map((x) => x.terceiro)])];
  const linhas = nomes.map((nome) => {
    const dele = todos.filter((x) => x.terceiro === nome), noMes = dele.filter((x) => mesDe(x.data) === mes);
    return { nome, total: soma(noMes), pend: soma(noMes.filter((x) => !x.pago)), resta: soma(dele.filter((x) => !x.pago)),
      venc: S.terceiros.find((t) => t.nome === nome)?.venc };
  }).filter((l) => l.total || l.resta);
  if (!linhas.length) return '';
  return `<div class="card"><h2>Devo a outras pessoas · ${nomeMes(mes)}</h2>${linhas.map((l) => `<div class="deve">
    <button type="button" class="deve-t" data-ir="terceiro" data-valor="${esc(l.nome)}"><b>${esc(l.nome)}</b>
      <span>${l.venc ? `Vence dia ${l.venc} · ` : ''}Ainda devo ${brl(l.resta)} no total</span></button>
    <div class="deve-v"><b>${brl(l.total)}</b>${!l.total ? '<span>Nada neste mês</span>'
      : l.pend ? `<button type="button" class="btn mini" data-pagar="${esc(l.nome)}" data-m="${mes}">Marcar pago</button>`
      : `<button type="button" class="btn mini sec" data-despagar="${esc(l.nome)}" data-m="${mes}">Pago ✓</button>`}</div></div>`).join('')}</div>`;
}
function marcarPago(nome, mes, pago) {
  const l = S.itens.filter((x) => x.terceiro === nome && mesDe(x.data) === mes && !!x.pago !== pago);
  if (!l.length) return;
  Dados.salvar(l.map((x) => ({ ...x, pago })));
  toast(pago ? `Parcelas de ${nome} em ${nomeMes(mes)} marcadas como pagas.` : `Parcelas de ${nome} voltaram para "a pagar".`, 'Desfazer',
    () => Dados.salvar(l.map((x) => ({ ...x, pago: !pago }))));
}

function telaInicio() {
  const mesAtual = mesDe(hojeYmd());
  const ultimos = [...S.itens].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 8);
  return `<div class="card"><h2>${nomeMes(mesAtual)}</h2>${htmlTotais(doMes(mesAtual))}</div>
    ${htmlTerceiros(mesAtual)}
    <div class="card"><h2>Últimos lançamentos</h2>${ultimos.length ? ultimos.map((x) => htmlItem(x, true)).join('') : '<div class="vazio">Nada lançado ainda. Use a caixa acima.</div>'}</div>`;
}

function telaLista() {
  const f = S.filtro;
  let l = doMes(S.mes).filter((x) => (!f.quem || x.quem === f.quem) && (!f.forma || (x.terceiro ? 'terceiro' : x.forma || 'nao') === f.forma)
    && (!f.categoria || x.categoria === f.categoria) && (!f.cartao || x.cartao === f.cartao) && (!f.terceiro || x.terceiro === f.terceiro));
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
  return `${htmlMes()}
    <div class="filtros">${sel('quem', 'Pessoa', pessoas().map((p) => [p, p]))}${sel('forma', 'Forma', [...FORMAS, ['terceiro', 'Cartão de outra pessoa'], ['nao', 'Não informada']])}${sel('categoria', 'Categoria', CATEGORIAS)}</div>
    ${f.cartao || f.terceiro ? `<div class="aviso">Mostrando só o cartão ${esc(f.cartao || 'de ' + f.terceiro)}. <button type="button" data-limpa-cartao style="background:none;border:0;text-decoration:underline;color:inherit;padding:0">Mostrar todos</button></div>` : ''}
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
  return `${htmlMes()}<div class="card">${htmlTotais(l)}</div>
    ${htmlTerceiros(S.mes)}
    ${bloco('Gastos por categoria', 'categoria', grupo(gastos, (x) => x.categoria || 'outros', (k) => rotCat[k] || k))}
    ${bloco('Por forma de pagamento', 'forma', grupo(gastos, (x) => (x.terceiro ? 'terceiro' : x.forma || 'nao'), (k) => (k === 'nao' ? 'Não informada' : k === 'terceiro' ? 'Cartão de outra pessoa' : rotForma[k])))}
    ${bloco('Por pessoa', 'quem', grupo(gastos, (x) => x.quem || '?', (k) => k))}
    ${bloco('Fatura do mês por cartão (crédito)', 'cartao', grupo(gastos.filter((x) => x.forma === 'credito' && !x.terceiro), (x) => x.cartao || 'Sem cartão', (k) => k))}`;
}

function telaAjustes() {
  const locais = guarda.ler('fin_itens', []).length;
  const sinc = S.nuvem
    ? `<p>Sincronizando na nuvem como <b>${esc(S.usuario?.email || '')}</b>. Tudo o que um lança aparece no celular do outro.</p>
       ${locais ? `<button class="btn sec bloco" type="button" id="aEnviar">Enviar para a nuvem os ${locais} lançamentos salvos só neste aparelho</button>` : ''}
       <button class="btn perigo bloco" type="button" id="aSair">Sair da conta</button>`
    : `<p>Os dados estão <b>só neste aparelho</b>. Para os dois celulares verem os mesmos lançamentos, preencha o arquivo <code>config.js</code> com os dados do Firebase (passo a passo no LEIAME).</p>`;
  return `<div class="card"><h2>Seu nome</h2><div class="campo" style="margin:0"><input id="aNome" aria-label="Seu nome" value="${esc(S.nome)}"></div></div>
    <div class="card"><h2>Cartões</h2><div class="campo" style="margin:0"><input id="aCartoes" aria-label="Cartões, separados por vírgula" value="${esc(S.cartoes.join(', '))}"></div>
      <p class="dica">Separe por vírgula. O app reconhece esses nomes nas frases.</p></div>
    <div class="card"><h2>Cartões de outras pessoas</h2><div class="campo" style="margin:0"><input id="aTerceiros" aria-label="Cartões de outras pessoas" placeholder="Pai dia 10, Mãe dia 5, Tia dia 20" value="${esc(S.terceiros.map((t) => (t.venc ? `${t.nome} dia ${t.venc}` : t.nome)).join(', '))}"></div>
      <p class="dica">Escreva o nome e o dia do vencimento, separados por vírgula. Nas frases, diga "no cartão da mãe" ou "no cartão do pai".</p></div>
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
  const tela = { inicio: telaInicio, lista: telaLista, resumo: telaResumo, ajustes: telaAjustes }[S.tab]();
  const foco = document.activeElement?.id;
  if (S.tab === 'ajustes' && ['aNome', 'aCartoes', 'aTerceiros'].includes(foco)) return; // não apaga o que está sendo digitado
  $('#tela').innerHTML = (S.erroNuvem ? `<div class="aviso">${esc(S.erroNuvem)}</div>` : '') + tela;
}

// ---------- folha de conferência / edição ----------
let emEdicao = null;
const lerValor = (txt) => {
  let s = String(txt).replace(/[^\d.,]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) ? n : 0;
};
const formaMarcada = () => document.querySelector('#fFormas input:checked')?.value || '';
function ajustarCampos() {
  const tipo = document.querySelector('input[name=tipo]:checked')?.value;
  const f = formaMarcada();
  $('#cCartao').hidden = !(f === 'credito' || f === 'debito');
  $('#cParc').hidden = !!emEdicao || tipo === 'receita';
  $('#cPago').hidden = !(f === 'credito' && $('#fCartao').value.startsWith('t:'));
  const n = Math.max(1, parseInt($('#fParc').value, 10) || 1);
  $('#cParc2').hidden = $('#cParc').hidden || n < 2;
  const v = lerValor($('#fValor').value);
  $('#fCada').textContent = v > 0 ? brl(Math.floor(v / n)) : '—';
}
function abrirFolha(l, avisos = []) {
  emEdicao = l.id ? l : null;
  $('#fTitulo').textContent = emEdicao ? 'Editar lançamento' : 'Conferir lançamento';
  $('#fAvisos').innerHTML = avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('');
  document.querySelectorAll('input[name=tipo]').forEach((r) => (r.checked = r.value === (l.tipo || 'gasto')));
  $('#fValor').value = l.valorCent ? (l.valorCent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  $('#fDesc').value = l.descricao || '';
  $('#fCat').innerHTML = CATEGORIAS.map(([v, t]) => `<option value="${v}"${v === (l.categoria || 'outros') ? ' selected' : ''}>${t}</option>`).join('');
  $('#fData').value = l.data || hojeYmd();
  $('#fFormas').innerHTML = [...FORMAS, ['', 'Não sei']].map(([v, t]) => `<label><input type="radio" name="forma" value="${v}"${v === (l.forma || '') ? ' checked' : ''}><span>${t}</span></label>`).join('');
  const cartoes = [...new Set([...S.cartoes, l.cartao].filter(Boolean))];
  const outros = [...new Set([...S.terceiros.map((t) => t.nome), l.terceiro].filter(Boolean))];
  $('#fCartao').innerHTML = '<option value="">—</option>' + cartoes.map((c) => `<option value="${esc(c)}"${!l.terceiro && c === l.cartao ? ' selected' : ''}>${esc(c)}</option>`).join('')
    + (outros.length ? `<optgroup label="De outra pessoa">${outros.map((n) => `<option value="t:${esc(n)}"${n === l.terceiro ? ' selected' : ''}>Cartão: ${esc(n)}</option>`).join('')}</optgroup>` : '');
  $('#fParcIni').value = 1;
  $('#fPago').checked = !!l.pago;
  $('#fParc').value = l.parcelas || 1;
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
  const valorCent = lerValor($('#fValor').value);
  if (valorCent <= 0) { $('#fValor').focus(); toast('Informe o valor.'); return; }
  const forma = formaMarcada() || null;
  const cv = $('#fCartao').value, terceiro = forma === 'credito' && cv.startsWith('t:') ? cv.slice(2) : null;
  const base = {
    tipo: document.querySelector('input[name=tipo]:checked')?.value || 'gasto',
    valorCent, descricao: $('#fDesc').value.trim() || rotCat[$('#fCat').value], categoria: $('#fCat').value,
    data: $('#fData').value || hojeYmd(), forma,
    cartao: (forma === 'credito' || forma === 'debito') && !cv.startsWith('t:') ? cv || null : null,
    terceiro, pago: terceiro ? $('#fPago').checked : false,
    quem: $('#fQuem').value || S.nome,
  };
  $('#folha').close();
  if (emEdicao) { Dados.salvar([{ ...emEdicao, ...base }]); toast('Alterado.'); return; }
  const n = base.tipo === 'receita' ? 1 : Math.min(72, Math.max(1, parseInt($('#fParc').value, 10) || 1));
  const grupo = n > 1 ? uid() : null, cada = Math.floor(valorCent / n), resto = valorCent - cada * n, agora = Date.now();
  // "Começar na parcela": para compras que já estão sendo pagas, cria só as parcelas que faltam
  const ini = Math.min(n, Math.max(1, parseInt($('#fParcIni').value, 10) || 1));
  const novos = Array.from({ length: n - ini + 1 }, (_, i) => ({
    ...base, id: uid(), valorCent: cada + (i === 0 && ini === 1 ? resto : 0), data: somaMesData(base.data, i),
    parcela: n > 1 ? { n: ini + i, total: n, grupo } : null, pago: base.pago && i === 0, criadoEm: agora - i,
  }));
  Dados.garantirPeriodo(mesDe(base.data));
  Dados.salvar(novos);
  $('#frase').value = '';
  const ids = novos.map((x) => x.id);
  toast(n > 1 ? `Anotado: ${novos.length} parcela${novos.length > 1 ? 's' : ''} de ${brl(cada)}${ini > 1 ? ` (da ${ini}ª à ${n}ª)` : ''}.` : `Anotado: ${brl(valorCent)}.`, 'Desfazer', () => Dados.apagar(ids));
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
  const r = interpretar(txt, { cartoes: S.cartoes, terceiros: S.terceiros.map((t) => t.nome) });
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
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma', 'Cartão', 'Cartão de outra pessoa', 'Pago', 'Parcela', 'Quem', 'Valor']];
  ordenar(S.itens).reverse().forEach((x) => linhas.push([x.data.split('-').reverse().join('/'), x.tipo === 'receita' ? 'Receita' : 'Gasto', x.descricao,
    rotCat[x.categoria] || '', rotForma[x.forma || ''], x.cartao || '', x.terceiro || '', x.terceiro ? (x.pago ? 'Sim' : 'Não') : '', x.parcela ? `${x.parcela.n}/${x.parcela.total}` : '', x.quem || '',
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
  S.tab = b.dataset.tab; render(); scrollTo(0, 0);
});
$('#modo').onclick = () => { S.tab = 'ajustes'; render(); };
$('#tela').addEventListener('click', (e) => {
  const item = e.target.closest('.item');
  if (item) { const x = S.itens.find((y) => y.id === item.dataset.id); if (x) abrirFolha(x); return; }
  const mes = e.target.closest('[data-mes]');
  if (mes) { S.mes = somaMes(S.mes, Number(mes.dataset.mes)); Dados.garantirPeriodo(S.mes); render(); return; }
  const pg = e.target.closest('[data-pagar],[data-despagar]');
  if (pg) { marcarPago(pg.dataset.pagar || pg.dataset.despagar, pg.dataset.m, !!pg.dataset.pagar); return; }
  const ir = e.target.closest('[data-ir]');
  if (ir) {
    S.filtro = { quem: '', forma: '', categoria: '', cartao: '', terceiro: '' };
    S.filtro[ir.dataset.ir] = ir.dataset.valor;
    if (ir.dataset.ir === 'cartao') { S.filtro.forma = 'credito'; if (ir.dataset.valor === 'Sem cartão') S.filtro.cartao = ''; }
    S.tab = 'lista'; render(); scrollTo(0, 0); return;
  }
  if (e.target.closest('[data-limpa-cartao]')) { S.filtro.cartao = ''; S.filtro.terceiro = ''; render(); return; }
  const id = e.target.id;
  if (id === 'aCsv') exportarCsv();
  if (id === 'aJson') baixar(`financas-backup-${hojeYmd()}.json`, JSON.stringify({ itens: S.itens, cartoes: S.cartoes, terceiros: S.terceiros }, null, 1), 'application/json');
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
  if (e.target.id === 'aNome') { S.nome = e.target.value.trim() || S.nome; guarda.por('fin_nome', S.nome); toast('Nome salvo.'); }
  if (e.target.id === 'aTerceiros') {
    const lista = e.target.value.split(',').map((p) => {
      const m = p.trim().match(/^(.*?)[\s(:-]*(?:dia\s*)?(\d{1,2})?\)?$/i);
      const nome = (m?.[1] || '').trim(), venc = Number(m?.[2]) || null;
      return nome ? { nome: nome.charAt(0).toUpperCase() + nome.slice(1), venc: venc >= 1 && venc <= 31 ? venc : null } : null;
    }).filter(Boolean);
    Dados.salvarTerceiros(lista); toast('Cartões de outras pessoas salvos.');
  }
  if (e.target.id === 'aCartoes') {
    Dados.salvarCartoes([...new Set(e.target.value.split(',').map((c) => c.trim()).filter(Boolean))]); toast('Cartões salvos.');
  }
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
