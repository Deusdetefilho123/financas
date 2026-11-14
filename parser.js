// Interpretador de frases em português (sem IA, roda no próprio celular).
// Entrada: "gastei trezentos conto no tênis em três vezes no nubank"
// Saída: { tipo, valorCent, descricao, categoria, forma, cartao, parcelas, data, avisos }

export const CATEGORIAS = [
  ['mercado', 'Mercado'], ['restaurante', 'Restaurante'], ['delivery', 'Delivery'],
  ['transporte', 'Transporte'], ['combustivel', 'Combustível'], ['saude', 'Saúde'],
  ['farmacia', 'Farmácia'], ['casa', 'Casa'], ['contas', 'Contas'], ['lazer', 'Lazer'],
  ['assinaturas', 'Assinaturas'], ['roupas', 'Roupas'], ['educacao', 'Educação'],
  ['presente', 'Presente'], ['pets', 'Pets'], ['salario', 'Salário'], ['outros', 'Outros'],
];

export const FORMAS = [
  ['credito', 'Crédito'], ['debito', 'Débito'], ['pix', 'Pix'],
  ['especie', 'Dinheiro'], ['outro', 'Outro'],
];

const PALAVRAS_CATEGORIA = {
  delivery: ['ifood', 'delivery', 'rappi', 'aiqfome', 'ze delivery', 'tele entrega'],
  mercado: ['mercado', 'supermercado', 'mercadinho', 'mercantil', 'feira', 'atacadao', 'atacarejo', 'assai',
    'hortifruti', 'acougue', 'padaria', 'sacolao', 'verdura', 'verduras', 'frutas', 'carne', 'pao'],
  restaurante: ['restaurante', 'almoco', 'jantar', 'janta', 'lanche', 'lanchonete', 'pizzaria', 'pizza',
    'hamburguer', 'churrascaria', 'churrasco', 'bar', 'cafe', 'cafeteria', 'sorvete', 'sorveteria', 'acai',
    'pastel', 'rodizio', 'sushi', 'espetinho', 'cerveja', 'marmita', 'salgado', 'tapioca'],
  transporte: ['uber', 'taxi', 'onibus', 'passagem', 'metro', 'estacionamento', 'pedagio', 'mototaxi',
    'corrida', 'topique', 'oficina', 'mecanico', 'pneu', 'lavagem'],
  combustivel: ['gasolina', 'combustivel', 'etanol', 'alcool', 'diesel', 'posto', 'abasteci', 'abastecer',
    'abastecimento', 'gnv'],
  farmacia: ['farmacia', 'remedio', 'remedios', 'drogaria', 'drogasil', 'pague menos', 'medicamento', 'medicamentos'],
  saude: ['medico', 'medica', 'consulta', 'exame', 'exames', 'dentista', 'hospital', 'plano de saude', 'psicologo',
    'psicologa', 'terapia', 'clinica', 'unimed', 'hapvida', 'oculos', 'otica', 'academia', 'fisioterapia'],
  assinaturas: ['netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'hbo', 'youtube', 'assinatura',
    'globoplay', 'icloud', 'google one', 'deezer', 'mensalidade do app'],
  contas: ['luz', 'energia', 'enel', 'agua', 'cagece', 'internet', 'telefone', 'celular', 'boleto', 'conta',
    'iptu', 'ipva', 'seguro', 'imposto', 'taxa', 'recarga', 'licenciamento', 'emprestimo', 'financiamento'],
  casa: ['aluguel', 'condominio', 'moveis', 'movel', 'reforma', 'faxina', 'diarista', 'eletrodomestico',
    'material de construcao', 'sofa', 'geladeira', 'fogao', 'gas', 'botijao', 'colchao', 'panela', 'pedreiro',
    'eletricista', 'encanador', 'tinta'],
  lazer: ['cinema', 'show', 'viagem', 'passeio', 'praia', 'hotel', 'pousada', 'ingresso', 'jogo', 'festa',
    'parque', 'clube', 'brinquedo'],
  roupas: ['roupa', 'roupas', 'tenis', 'sapato', 'sapatos', 'camisa', 'camiseta', 'calca', 'vestido', 'blusa',
    'short', 'bermuda', 'sandalia', 'chinelo', 'bolsa', 'cueca', 'calcinha', 'sapatilha', 'jaqueta', 'bone'],
  educacao: ['escola', 'faculdade', 'curso', 'livro', 'livros', 'mensalidade', 'material escolar', 'apostila',
    'colegio', 'aula', 'aulas', 'creche'],
  presente: ['presente', 'presentes', 'lembrancinha', 'aniversario'],
  pets: ['racao', 'veterinario', 'veterinaria', 'pet', 'petshop', 'pet shop', 'banho e tosa', 'cachorro', 'gato'],
  salario: ['salario', 'adiantamento', 'decimo', 'ferias', 'bonus', 'freela', 'freelance', 'comissao', 'holerite'],
};

const PALAVRAS_RECEITA = ['recebi', 'recebemos', 'recebido', 'recebida', 'ganhei', 'ganhamos', 'entrou', 'caiu',
  'salario', 'depositaram', 'depositou', 'vendi', 'vendemos', 'reembolso', 'reembolsaram', 'rendimento',
  'rendeu', 'devolveram', 'estorno', 'estornaram', 'adiantamento', 'receita'];

const FORMA_PALAVRAS = {
  credito: ['credito', 'cred', 'credto', 'creditu'],
  debito: ['debito', 'deb', 'debto', 'debitu'],
  pix: ['pix', 'pics', 'piks', 'picks', 'pixx', 'piquis'],
  especie: ['dinheiro', 'especie', 'cash', 'dinhero'],
};

const MOEDA = new Set(['reais', 'real', 'conto', 'contos', 'pila', 'pilas', 'mango', 'mangos', 'prata', 'pratas',
  'pau', 'paus', 'rs', 'r$', 'dinheiros']);

const VERBO_VALOR = new Set(['por', 'deu', 'custou', 'paguei', 'pagamos', 'gastei', 'gastamos', 'recebi',
  'recebemos', 'foi', 'foram', 'ganhei', 'valor', 'total', 'saiu']);

const IGNORAR = new Set(['gastei', 'gastamos', 'gasto', 'paguei', 'pagamos', 'pago', 'comprei', 'compramos',
  'foi', 'foram', 'deu', 'custou', 'saiu', 'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das', 'em', 'com',
  'por', 'pra', 'pro', 'para', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'que', 'eu', 'la', 'ali',
  'recebi', 'recebemos', 'ganhei', 'ganhamos', 'entrou', 'caiu', 'hoje', 'ontem', 'anteontem', 'agora', 'ai',
  'so', 'mais', 'tambem', 'ao', 'aos', 'pelo', 'pela', 'meu', 'minha', 'nosso', 'nossa', 'anota', 'anotar',
  'registra', 'registrar', 'lanca', 'lancar', 'coloca', 'bota', 'valor', 'total', 'vista', 'gente', 'fiz', 'fizemos',
  'passei', 'usei', 'cartao', 'conta', 'via', 'tudo']);

const UNID = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const DEZ_A_19 = { dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const DEZENAS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cincoenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90 };
const CENTENAS = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9,
  outubro: 10, novembro: 11, dezembro: 12 };
const DIAS_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

export const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = cur;
  }
  return ant[b.length];
}

// Aceita erro de digitação: 1 letra em palavras de 6+, 2 letras em palavras de 9+.
function parecido(tok, chave) {
  if (tok === chave) return true;
  if (/\d/.test(tok)) return false;
  if (chave.length >= 9) return lev(tok, chave) <= 2;
  if (chave.length >= 6) return lev(tok, chave) <= 1;
  return false;
}

function literal(t) {
  if (!/^\d/.test(t)) return null;
  let s = t;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Lê um número a partir do token i (algarismos, por extenso ou misturado).
// Devolve { v, len, extenso } ou null.
function lerNumero(tk, i) {
  const t = (k) => (tk[k] && !tk[k].usado ? tk[k].t : null);
  let j = i, total = 0, achou = false, soExtenso = true;

  const grupo = () => {
    // número até 999 por extenso, respeitando a ordem centena > dezena > unidade
    let v = 0, k = j, ok = false;
    const pulaE = () => (t(k) === 'e' ? k + 1 : k);
    if (t(k) in CENTENAS) { v += CENTENAS[t(k)]; k++; ok = true; }
    let k2 = ok ? pulaE() : k;
    if (t(k2) in DEZ_A_19) { v += DEZ_A_19[t(k2)]; k = k2 + 1; ok = true; }
    else {
      if (t(k2) in DEZENAS) { v += DEZENAS[t(k2)]; k = k2 + 1; ok = true; k2 = pulaE(); }
      if (t(k2) in UNID && (k2 === k || t(k2 - 1) === 'e')) { v += UNID[t(k2)]; k = k2 + 1; ok = true; }
    }
    if (!ok) return null;
    j = k;
    return v;
  };

  // parte antes de "mil"
  let parte = null;
  const lit = t(j) !== null ? literal(t(j)) : null;
  if (lit !== null) { parte = lit; j++; soExtenso = false; achou = true; }
  else { const g = grupo(); if (g !== null) { parte = g; achou = true; } }

  if (t(j) === 'mil' || (t(j) === 'k' && parte !== null)) {
    total = (parte === null ? 1 : parte) * 1000;
    j++; achou = true;
    // resto: "mil e duzentos", "2 mil e 500", "mil duzentos e cinquenta"
    const volta = j;
    if (t(j) === 'e') j++;
    const lit2 = t(j) !== null ? literal(t(j)) : null;
    if (lit2 !== null && Number.isInteger(lit2) && lit2 < 1000) { total += lit2; j++; soExtenso = false; }
    else { const g = grupo(); if (g !== null) total += g; else j = volta; }
  } else if (parte !== null) total = parte;

  if (!achou) return null;
  return { v: total, len: j - i, extenso: soExtenso };
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataDe(dia, mes, ano, hoje) {
  let y = ano ?? hoje.getFullYear();
  if (y < 100) y += 2000;
  let m = mes ?? hoje.getMonth() + 1;
  if (dia < 1 || dia > 31 || m < 1 || m > 12) return null;
  let d = new Date(y, m - 1, dia);
  if (d.getDate() !== dia) return null;
  // "dia 28" dito no dia 12 quer dizer o mês passado
  if (mes == null && d > hoje) {
    d = new Date(y, m - 2, dia);
    if (d.getDate() !== dia) return null;
  } else if (ano == null && mes != null && d - hoje > 31 * 864e5) d = new Date(y - 1, m - 1, dia);
  return ymd(d);
}

export function interpretar(texto, opcoes = {}) {
  const hoje = opcoes.hoje ? new Date(opcoes.hoje) : new Date();
  hoje.setHours(0, 0, 0, 0);
  const cartoes = (opcoes.cartoes || []).map((c) => ({ nome: c, chave: semAcento(c).trim() })).filter((c) => c.chave);
  const original = String(texto || '').normalize('NFC');
  let s = semAcento(original);
  const avisos = [];
  const r = { tipo: 'gasto', valorCent: null, descricao: '', categoria: 'outros', forma: null, cartao: null, terceiro: null,
    parcelas: 1, data: ymd(hoje), avisos };

  // tokens com a posição no texto original
  const tk = [];
  const re = /r\$|[a-z]+\d+|\d+(?:[.,]\d+)*|[a-z]+|\//g;
  let m;
  while ((m = re.exec(s))) tk.push({ t: m[0], i: m.index, f: m.index + m[0].length, usado: false });
  const T = (k) => (tk[k] ? tk[k].t : null);
  const usa = (a, b) => { for (let k = a; k < b; k++) if (tk[k]) tk[k].usado = true; };

  // ---- datas ----
  for (let k = 0; k < tk.length; k++) {
    if (tk[k].usado) continue;
    const t = T(k);
    // 05/11 ou 05/11/2026
    if (/^\d{1,2}$/.test(t) && T(k + 1) === '/' && /^\d{1,2}$/.test(T(k + 2) || '')) {
      let fim = k + 3, ano;
      if (T(k + 3) === '/' && /^\d{2,4}$/.test(T(k + 4) || '')) { ano = Number(T(k + 4)); fim = k + 5; }
      const d = dataDe(Number(t), Number(T(k + 2)), ano, hoje);
      if (d) { r.data = d; usa(T(k - 1) === 'dia' ? k - 1 : k, fim); k = fim - 1; continue; }
    }
    if (t === 'hoje') { usa(k, k + 1); continue; }
    if (t === 'ontem') {
      const antes = T(k - 1) === 'de' && T(k - 2) === 'antes';
      const d = new Date(hoje); d.setDate(d.getDate() - (antes ? 2 : 1)); r.data = ymd(d);
      usa(antes ? k - 2 : k, k + 1); continue;
    }
    if (t === 'anteontem') { const d = new Date(hoje); d.setDate(d.getDate() - 2); r.data = ymd(d); usa(k, k + 1); continue; }
    if (t === 'dia') {
      const n = lerNumero(tk, k + 1);
      if (n && Number.isInteger(n.v) && n.v >= 1 && n.v <= 31) {
        let fim = k + 1 + n.len, mes;
        if (T(fim) === 'de' && T(fim + 1) in MESES) { mes = MESES[T(fim + 1)]; fim += 2; }
        const d = dataDe(n.v, mes, undefined, hoje);
        if (d) { r.data = d; usa(k, fim); k = fim - 1; continue; }
      }
    }
    if (t in DIAS_SEMANA && (['na', 'no', 'nessa', 'nesse', 'essa', 'esse', 'ultima', 'ultimo'].includes(T(k - 1)) || T(k + 1) === 'feira' || T(k + 1) === 'passada')) {
      const d = new Date(hoje);
      let dif = (d.getDay() - DIAS_SEMANA[t] + 7) % 7; if (dif === 0) dif = 7;
      d.setDate(d.getDate() - dif); r.data = ymd(d);
      let fim = k + 1; if (T(fim) === 'feira') fim++; if (T(fim) === 'passada' || T(fim) === 'passado') fim++;
      usa(k, fim); continue;
    }
  }

  // ---- parcelas ----
  let porParcela = false;
  for (let k = 0; k < tk.length; k++) {
    if (tk[k].usado) continue;
    const n = lerNumero(tk, k);
    if (!n) continue;
    const depois = T(k + n.len);
    if (Number.isInteger(n.v) && n.v >= 1 && n.v <= 72 && ['x', 'vezes', 'vez', 'parcelas', 'parcela', 'prestacoes'].includes(depois)) {
      r.parcelas = n.v;
      let ini = k, fim = k + n.len + 1;
      if (['em', 'de'].includes(T(ini - 1))) ini--;
      if (['parcelado', 'parcelada', 'parcelei', 'dividido', 'dividida', 'dividi'].includes(T(ini - 1))) ini--;
      if (T(fim) === 'de' && lerNumero(tk, fim + 1)) { porParcela = true; fim++; }
      usa(ini, fim);
      break;
    }
    k += n.len - 1;
  }
  for (let k = 0; k < tk.length; k++) {
    if (!tk[k].usado && ['parcelado', 'parcelada', 'parcelei'].includes(T(k))) tk[k].usado = true;
    if (!tk[k].usado && T(k) === 'vista' && ['a', 'ha'].includes(T(k - 1))) usa(k - 1, k + 1);
  }

  // ---- valor ----
  const cand = [];
  for (let k = 0; k < tk.length; k++) {
    if (tk[k].usado) continue;
    const n = lerNumero(tk, k);
    if (!n) continue;
    let fim = k + n.len, v = n.v, pontos = 0, ini = k;
    if (T(k - 1) === 'r$') { pontos += 3; ini = k - 1; }
    if (MOEDA.has(T(fim))) { pontos += 3; fim++; }
    // centavos: "45 reais e 90", "quarenta e cinco e noventa", "... e noventa centavos"
    if (Number.isInteger(v) && T(fim) === 'e') {
      const c = lerNumero(tk, fim + 1);
      if (c && Number.isInteger(c.v) && c.v < 100) {
        const temCent = ['centavos', 'centavo'].includes(T(fim + 1 + c.len));
        if (temCent || (c.v >= 10 && (pontos > 0 || n.extenso))) {
          v += c.v / 100; fim = fim + 1 + c.len + (temCent ? 1 : 0); pontos += 1;
        }
      }
    }
    if (['centavos', 'centavo'].includes(T(fim)) && v < 100 && Number.isInteger(v)) { v = v / 100; fim++; pontos += 3; }
    if (!Number.isInteger(n.v)) pontos += 2;
    if (VERBO_VALOR.has(T(ini - 1))) pontos += 1;
    const soArtigo = n.len === 1 && ['um', 'uma'].includes(T(k)) && pontos < 3;
    if (!soArtigo && v > 0) cand.push({ v, ini, fim, pontos });
    k = fim - 1;
  }
  if (cand.length) {
    cand.sort((a, b) => b.pontos - a.pontos || b.v - a.v);
    const c = cand[0];
    let v = c.v;
    if (porParcela && r.parcelas > 1) v *= r.parcelas;
    r.valorCent = Math.round(v * 100);
    usa(c.ini, c.fim);
    if (cand.length > 1) avisos.push('Havia mais de um número na frase. Confira o valor.');
  } else avisos.push('Não encontrei o valor. Preencha abaixo.');

  // ---- cartão de outra pessoa: "no cartão da mãe", "cartão do meu pai" ----
  const terceiros = (opcoes.terceiros || []).map((n) => ({ nome: n, chave: semAcento(n).trim() })).filter((c) => c.chave);
  for (const c of terceiros) {
    const partes = c.chave.split(/\s+/);
    for (let k = 0; k + partes.length <= tk.length && !r.terceiro; k++) {
      if (!partes.every((p, x) => !tk[k + x].usado && parecido(tk[k + x].t, p))) continue;
      let ini = k;
      while (ini > 0 && ['do', 'da', 'de', 'meu', 'minha', 'nosso', 'nossa'].includes(T(ini - 1))) ini--;
      if (!['cartao', 'credito'].includes(T(ini - 1))) continue; // precisa dizer "cartão da/do ..."
      r.terceiro = c.nome; r.forma = 'credito'; usa(ini - 1, k + partes.length);
    }
    if (r.terceiro) break;
  }

  // ---- cartão ----
  for (const c of cartoes) {
    const partes = c.chave.split(/\s+/);
    for (let k = 0; k + partes.length <= tk.length; k++) {
      if (partes.every((p, x) => !tk[k + x].usado && parecido(tk[k + x].t, p))) {
        r.cartao = c.nome; usa(k, k + partes.length); break;
      }
    }
    // a voz às vezes separa o nome ("pic pay", "nu bank"): tenta juntar 2 ou 3 palavras
    const junto = c.chave.replace(/\s+/g, '');
    for (let n = 2; n <= 3 && !r.cartao; n++) {
      for (let k = 0; k + n <= tk.length; k++) {
        const grupo = tk.slice(k, k + n);
        if (grupo.every((x) => !x.usado) && parecido(grupo.map((x) => x.t).join(''), junto)) {
          r.cartao = c.nome; usa(k, k + n); break;
        }
      }
    }
    if (r.cartao) break;
  }

  // ---- forma de pagamento ----
  for (let k = 0; k < tk.length; k++) {
    if (tk[k].usado) continue;
    for (const [forma, lista] of Object.entries(FORMA_PALAVRAS)) {
      if (lista.some((p) => parecido(tk[k].t, p))) { if (!r.forma) r.forma = forma; tk[k].usado = true; break; }
    }
  }
  const temCartao = tk.some((x) => !x.usado && x.t === 'cartao');
  if (!r.forma && (temCartao || r.parcelas > 1)) r.forma = 'credito';
  if (r.forma === 'credito' || r.forma === 'debito') {
    for (const x of tk) if (!x.usado && ['cartao', 'funcao'].includes(x.t)) x.usado = true;
  }

  // ---- receita ou gasto ----
  if (tk.some((x) => PALAVRAS_RECEITA.some((p) => parecido(x.t, p)))) r.tipo = 'receita';
  if (/\bme (pagou|pagaram|devolveu|passou|mandou)\b/.test(s)) r.tipo = 'receita';

  // ---- categoria (a palavra que aparece primeiro na frase ganha) ----
  let melhor = null;
  for (const [cat, lista] of Object.entries(PALAVRAS_CATEGORIA)) {
    for (const p of lista) {
      const partes = p.split(' ');
      for (let k = 0; k + partes.length <= tk.length; k++) {
        if (partes.every((q, x) => !tk[k + x].usado && parecido(tk[k + x].t, q))) {
          const exato = partes.every((q, x) => tk[k + x].t === q);
          const nota = k - (exato ? 0.5 : 0) - partes.length * 0.01;
          if (!melhor || nota < melhor.nota) melhor = { cat, nota };
          break;
        }
      }
    }
  }
  if (melhor) r.categoria = melhor.cat;
  if (r.tipo === 'receita' && r.categoria !== 'salario') r.categoria = 'outros';
  if (r.tipo === 'gasto' && r.categoria === 'salario') r.categoria = 'outros';

  // ---- descrição: o que sobrou da frase ----
  const sobra = tk.filter((x) => !x.usado && !IGNORAR.has(x.t) && !MOEDA.has(x.t) && x.t !== '/' && !/^\d/.test(x.t));
  let desc = sobra.map((x) => original.slice(x.i, x.f)).join(' ').trim();
  if (!desc) desc = r.tipo === 'receita' && r.categoria === 'outros' ? 'Receita' : CATEGORIAS.find((c) => c[0] === r.categoria)[1];
  r.descricao = desc.charAt(0).toUpperCase() + desc.slice(1);

  if (!r.forma) avisos.push('Forma de pagamento não informada.');
  return r;
}
