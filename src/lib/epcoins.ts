import { supabase } from './supabase';

// A carteira de EPCoins, as missões, a roda diária e a loja.
//
// Nada aqui escreve saldos. Todas as funções que mexem em moedas são RPCs
// `security definer` do lado do Postgres (migrações 007, 009 e 011) — o
// cliente pede, o servidor decide. Se um dia alguém precisar de creditar
// alguém a partir daqui, é sinal de que falta uma RPC.
//
// Todas falham em silêncio (console.warn + valor neutro) quando as migrações
// ainda não correram: o Hub tem de continuar a funcionar sem a gamificação.

// ─── TIPOS ────────────────────────────────────────────────────

export interface MovimentoEPC {
  id: number;
  valor: number;
  motivo: string;
  descricao: string | null;
  created_at: string;
}

export interface Missao {
  id: string;
  titulo: string;
  descricao: string | null;
  periodo: 'diaria' | 'semanal' | 'mensal' | 'sempre';
  alvo: number;
  recompensa: number;
  progresso: number;
  concluida: boolean;
  resgatada: boolean;
}

export interface ItemLoja {
  id: string;
  chave: string;
  tipo: 'badge' | 'avatar' | 'moldura' | 'merch' | 'desconto' | 'experiencia' | 'conteudo';
  nome: string;
  descricao: string | null;
  preco: number;
  imagem_url: string | null;
  stock: number | null;
  requer_vip: boolean;
  entrega_manual: boolean;
  ja_tenho: boolean;
}

export interface ResultadoSpin {
  rotulo: string;
  tipo: 'epcoins' | 'badge' | 'nada';
  valor: number;
  saldo: number;
}

export interface EstadoSpin {
  disponivel: boolean;
  ultimo_rotulo: string | null;
}

/** Erros que as RPCs levantam de propósito, traduzidos para o ecrã. */
const MENSAGENS: Record<string, string> = {
  SALDO_INSUFICIENTE: 'Não tens EPCoins suficientes.',
  ITEM_INDISPONIVEL: 'Este item já não está disponível.',
  ITEM_SO_VIP: 'Este item é exclusivo para VIP.',
  ITEM_SEM_STOCK: 'Esgotado.',
  ITEM_JA_COMPRADO: 'Já tens este item.',
  MISSAO_POR_CONCLUIR: 'Ainda não concluíste esta missão.',
  MISSAO_JA_RESGATADA: 'Já resgataste esta missão.',
  SPIN_JA_USADO_HOJE: 'Já giraste hoje. Volta amanhã.',
  SPIN_SEM_PREMIOS: 'A roda está a ser preparada. Tenta mais tarde.',
  DROP_FORA_DA_JANELA: 'Chegaste tarde — o drop já fechou.',
  CODIGO_INVALIDO: 'Código de convite inválido.',
  CODIGO_PROPRIO: 'Não podes usar o teu próprio código.',
  CONVITE_JA_USADO: 'Já usaste um convite.',
  CONVITE_FORA_DE_PRAZO: 'Os convites só se aplicam na primeira semana.',
  JA_TENS_CLA: 'Já pertences a um clã.',
  CLA_CHEIO: 'Este clã está cheio.',
  CLA_FECHADO: 'Este clã não está a aceitar membros.',
  PERGUNTA_FECHADA: 'Esta pergunta já fechou.',
  PERGUNTA_POR_ABRIR: 'Esta pergunta ainda não abriu.',
  ESCOLHA_INVALIDA: 'Escolha inválida.',
  SEM_PERMISSAO: 'Não tens permissão para isto.',
};

/**
 * O Postgres devolve a mensagem do `raise exception` num campo de texto livre.
 * Traduzir aqui evita ter o mesmo `switch` espalhado por cinco páginas.
 */
export function traduzErro(mensagem: string | undefined): string {
  if (!mensagem) return 'Algo correu mal. Tenta outra vez.';
  for (const chave of Object.keys(MENSAGENS)) {
    if (mensagem.includes(chave)) return MENSAGENS[chave];
  }
  return 'Algo correu mal. Tenta outra vez.';
}

// ─── CARTEIRA ─────────────────────────────────────────────────

/**
 * Regista a entrada do dia e devolve o saldo depois do bónus de streak.
 * Substitui o cálculo que o AuthContext fazia no cliente: a data e o streak
 * passam a ser decididos pelo relógio do servidor, em Europe/Lisbon.
 */
export async function registarLogin(): Promise<{ saldo: number; streak: number } | null> {
  const { data, error } = await supabase.rpc('epc_registar_login');
  if (error) {
    console.warn('Login diário não registado:', error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  return { saldo: Number(linha.saldo ?? 0), streak: Number(linha.streak ?? 0) };
}

export async function carregarExtrato(limite = 50): Promise<MovimentoEPC[]> {
  const { data, error } = await supabase.rpc('epc_extrato', { p_limite: limite });
  if (error) {
    console.warn('Extrato indisponível:', error.message);
    return [];
  }
  return (data ?? []) as MovimentoEPC[];
}

// ─── MISSÕES ──────────────────────────────────────────────────

export async function carregarMissoes(): Promise<Missao[]> {
  const { data, error } = await supabase.rpc('missoes_do_membro');
  if (error) {
    console.warn('Missões indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as Missao[];
}

/** Devolve o novo saldo, ou lança com a mensagem já traduzida. */
export async function resgatarMissao(missaoId: string): Promise<number> {
  const { data, error } = await supabase.rpc('missao_resgatar', { p_missao_id: missaoId });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}

// ─── RODA DIÁRIA ──────────────────────────────────────────────

export async function estadoSpin(): Promise<EstadoSpin> {
  const { data, error } = await supabase.rpc('spin_estado');
  if (error) {
    console.warn('Roda indisponível:', error.message);
    return { disponivel: false, ultimo_rotulo: null };
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return {
    disponivel: Boolean(linha?.disponivel),
    ultimo_rotulo: linha?.ultimo_rotulo ?? null,
  };
}

/**
 * O prémio é sorteado no servidor e só depois animado. A animação da roda no
 * ecrã é decoração por cima de um resultado que já está decidido.
 */
export async function girarRoda(): Promise<ResultadoSpin> {
  const { data, error } = await supabase.rpc('spin_girar');
  if (error) throw new Error(traduzErro(error.message));
  const linha = Array.isArray(data) ? data[0] : data;
  return {
    rotulo: linha?.rotulo ?? 'Nada',
    tipo: linha?.tipo ?? 'nada',
    valor: Number(linha?.valor ?? 0),
    saldo: Number(linha?.saldo ?? 0),
  };
}

/** Os segmentos da roda, só para desenhar. Os pesos não vêm para o cliente. */
export async function carregarSegmentosRoda(): Promise<{ rotulo: string; cor: string | null }[]> {
  const { data, error } = await supabase
    .from('spin_premios')
    .select('rotulo, cor, ordem')
    .eq('ativo', true)
    .order('ordem');
  if (error) {
    console.warn('Segmentos da roda indisponíveis:', error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ rotulo: s.rotulo as string, cor: (s.cor as string) ?? null }));
}

// ─── LOJA ─────────────────────────────────────────────────────

export async function carregarCatalogo(): Promise<ItemLoja[]> {
  const { data, error } = await supabase.rpc('loja_catalogo');
  if (error) {
    console.warn('Loja indisponível:', error.message);
    return [];
  }
  return (data ?? []) as ItemLoja[];
}

/** Devolve o saldo depois da compra. */
export async function comprarItem(itemId: string): Promise<number> {
  const { data, error } = await supabase.rpc('loja_comprar', { p_item_id: itemId });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}
