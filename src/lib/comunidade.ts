import { supabase } from './supabase';
import { traduzErro } from './epcoins';

// Convites, clãs e perfil público.
//
// Sobre os convites: são internos. Recompensam quem traz alguém para o Hub
// com EPCoins, e nada mais. Não conhecem casas de apostas nem registos
// externos — associar recompensas a registos ou primeiros depósitos numa
// casa parceira cai nas regras de afiliados, publicidade e jogo responsável
// aplicáveis em Portugal, e teria de ser desenhado à parte.

// ─── TIPOS ────────────────────────────────────────────────────

export interface ResumoConvites {
  codigo: string;
  convidados: number;
}

export interface LinhaRankingClas {
  cla_id: string;
  nome: string;
  tag: string;
  membros: number;
  pontos: number;
  cor: string | null;
}

export interface MembroCla {
  username: string;
  papel: 'dono' | 'membro';
  epcoins: number;
}

export interface Cla {
  id: string;
  nome: string;
  tag: string;
  descricao: string | null;
  aberto: boolean;
  cor: string | null;
  max_membros: number;
  sou_dono: boolean;
  membros: MembroCla[];
}

/** Uma linha da lista de todos os clãs (separador "Clãs"). */
export interface ClaListado {
  cla_id: string;
  nome: string;
  tag: string;
  descricao: string | null;
  aberto: boolean;
  membros: number;
  max_membros: number;
  lider: string;
  cor: string | null;
}

/** Um pedido de entrada à espera de resposta do dono. */
export interface PedidoCla {
  user_id: string;
  username: string;
  epcoins: number;
  pedido_em: string;
}

/** O pedido pendente do próprio utilizador, se houver. */
export interface MeuPedidoCla {
  cla_id: string;
  nome: string;
  tag: string;
  /** true = é um convite do dono (o próprio responde); false = pedido meu. */
  convite: boolean;
}

/** Um convite que o dono enviou e ainda não teve resposta. */
export interface ConviteEnviado {
  user_id: string;
  username: string;
  convidado_em: string;
}

/** Uma sugestão do dropdown de procura ao convidar. */
export interface MembroSugerido {
  user_id: string;
  username: string;
  nome: string | null;
  avatar_url: string;
}

export interface PerfilPublico {
  username: string;
  badges: string[];
  membro_desde: string | null;
  previsoes: number;
  certas: number;
  taxa: number;
  streak: number;
  cla_nome: string | null;
  cla_tag: string | null;
  cla_cor: string | null;
}

// ─── CONVITES ─────────────────────────────────────────────────

/** O código do próprio, criado na primeira chamada. */
export async function carregarResumoConvites(): Promise<ResumoConvites | null> {
  const { data, error } = await supabase.rpc('referral_resumo');
  if (error) {
    console.warn('Convites indisponíveis:', error.message);
    return null;
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l?.codigo) return null;
  return { codigo: l.codigo as string, convidados: Number(l.convidados ?? 0) };
}

/** Usado uma vez, pelo convidado, na primeira semana depois do registo. */
export async function usarConvite(codigo: string): Promise<void> {
  const { error } = await supabase.rpc('referral_usar', { p_codigo: codigo });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * O que a RPC devolve. Só `OK` credita; o resto diz porque não.
 *
 * A distinção que interessa é entre um "ainda não" e um "nunca":
 * `EMAIL_POR_CONFIRMAR` e `SEM_PERFIL` resolvem-se sozinhos quando a pessoa
 * confirmar a conta, e por isso o código tem de ficar guardado para a próxima.
 */
type ResultadoConvite =
  | 'OK' | 'JA_USADO' | 'SEM_CODIGO' | 'SEM_SESSAO'
  | 'EMAIL_POR_CONFIRMAR' | 'SEM_PERFIL'
  | 'CODIGO_INVALIDO' | 'CODIGO_PROPRIO' | 'FORA_DE_PRAZO';

const A_REPETIR: ResultadoConvite[] = ['EMAIL_POR_CONFIRMAR', 'SEM_PERFIL', 'SEM_SESSAO'];

export function linkDeConvite(codigo: string): string {
  return `${window.location.origin}/register?convite=${encodeURIComponent(codigo)}`;
}

const CHAVE_CONVITE = 'epc_convite_pendente';

/**
 * O código fica guardado no registo e só se resgata na primeira sessão.
 *
 * Não se pode resgatar logo: com confirmação de email ligada, o `signUp` não
 * devolve sessão nenhuma, e a RPC precisa de um `auth.uid()`. Guardar e
 * resgatar depois é o que faz o convite sobreviver a esse intervalo.
 */
export function guardarConvitePendente(codigo: string): void {
  try {
    localStorage.setItem(CHAVE_CONVITE, codigo.trim().toUpperCase());
  } catch {
    // Sessão privada ou storage cheio: perde-se o convite, não o registo.
  }
}

/**
 * Resgata o convite na primeira sessão em que ele possa mesmo contar.
 *
 * Corre a cada arranque, de propósito. O crédito exige email confirmado e
 * perfil criado, e nenhuma dessas coisas está garantida no primeiro login —
 * por isso o código só sai da gaveta quando o servidor der uma resposta
 * definitiva. Nunca lança: um convite que falha não pode estragar o arranque.
 *
 * Se o browser não tiver o código (registo noutro dispositivo), a RPC vai
 * buscá-lo aos metadados da conta sozinha.
 */
export async function resgatarConvitePendente(): Promise<void> {
  let codigo: string | null = null;
  try {
    codigo = localStorage.getItem(CHAVE_CONVITE);
  } catch {
    // Storage inacessível: a RPC ainda tem os metadados da conta.
  }

  const { data, error } = await supabase.rpc('referral_resgatar', {
    p_codigo: codigo ?? null,
  });

  if (error) {
    console.warn('Convite não aplicado:', error.message);
    return;
  }

  const r = data as ResultadoConvite;
  if (A_REPETIR.includes(r)) return;

  // Definitivo — bom ou mau. Um código inválido ou fora de prazo não melhora
  // com tentativas, e ficaria a bater no servidor em cada arranque.
  try { localStorage.removeItem(CHAVE_CONVITE); } catch { /* ignorado */ }
}

// ─── CLÃS ─────────────────────────────────────────────────────

export async function carregarRankingClas(limite = 30): Promise<LinhaRankingClas[]> {
  const { data, error } = await supabase.rpc('cla_ranking', { p_limite: limite });
  if (error) {
    console.warn('Ranking de clãs indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as LinhaRankingClas[]).map((l) => ({
    ...l,
    membros: Number(l.membros),
    pontos: Number(l.pontos),
    cor: l.cor ?? null,
  }));
}

/** Lista de todos os clãs, para quem ainda não tem um escolher. */
export async function listarClas(): Promise<ClaListado[]> {
  const { data, error } = await supabase.rpc('cla_listar');
  if (error) {
    console.warn('Lista de clãs indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    cla_id: l.cla_id as string,
    nome: l.nome as string,
    tag: l.tag as string,
    descricao: (l.descricao as string) ?? null,
    aberto: Boolean(l.aberto),
    membros: Number(l.membros ?? 0),
    max_membros: Number(l.max_membros ?? 20),
    lider: (l.lider as string) ?? 'membro',
    cor: (l.cor as string) ?? null,
  }));
}

/** Pedir para entrar num clã (o dono decide depois). */
export async function pedirParaEntrar(claId: string): Promise<void> {
  const { error } = await supabase.rpc('cla_pedir', { p_cla_id: claId });
  if (error) throw new Error(traduzErro(error.message));
}

export async function cancelarPedidoCla(): Promise<void> {
  const { error } = await supabase.rpc('cla_pedir_cancelar');
  if (error) throw new Error(traduzErro(error.message));
}

export async function carregarMeuPedidoCla(): Promise<MeuPedidoCla | null> {
  const { data, error } = await supabase.rpc('cla_meu_pedido');
  if (error) return null;
  const l = Array.isArray(data) ? data[0] : data;
  if (!l?.cla_id) return null;
  return {
    cla_id: l.cla_id as string,
    nome: l.nome as string,
    tag: l.tag as string,
    convite: Boolean(l.convite),
  };
}

/** Sugestões para o dropdown de convite (procura por username ou nome). */
export async function procurarMembrosCla(q: string): Promise<MembroSugerido[]> {
  const termo = q.trim();
  if (termo.length < 2) return [];
  const { data, error } = await supabase.rpc('cla_procurar_membros', { p_q: termo });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((l) => {
    const id = l.user_id as string;
    const { data: { publicUrl } } = supabase.storage.from('profile_images').getPublicUrl(id);
    return {
      user_id: id,
      username: (l.username as string) ?? 'membro',
      nome: (l.nome as string) ?? null,
      avatar_url: publicUrl,
    };
  });
}

/** O dono convida alguém pelo nome de utilizador. */
export async function convidarParaCla(username: string): Promise<void> {
  const { error } = await supabase.rpc('cla_convidar', { p_username: username.trim() });
  if (error) throw new Error(traduzErro(error.message));
}

/** O convidado aceita ou recusa o convite que recebeu. */
export async function responderConviteCla(aceitar: boolean): Promise<void> {
  const { error } = await supabase.rpc('cla_convite_responder', { p_aceitar: aceitar });
  if (error) throw new Error(traduzErro(error.message));
}

/** Convites enviados pelo dono e à espera de resposta. */
export async function carregarConvitesEnviados(): Promise<ConviteEnviado[]> {
  const { data, error } = await supabase.rpc('cla_convites_enviados');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    user_id: l.user_id as string,
    username: (l.username as string) ?? 'membro',
    convidado_em: (l.convidado_em as string) ?? '',
  }));
}

export async function cancelarConviteCla(userId: string): Promise<void> {
  const { error } = await supabase.rpc('cla_convite_cancelar', { p_user_id: userId });
  if (error) throw new Error(traduzErro(error.message));
}

/** Pedidos à espera de resposta — só devolve linhas ao dono do clã. */
export async function carregarPedidosCla(): Promise<PedidoCla[]> {
  const { data, error } = await supabase.rpc('cla_pedidos_recebidos');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    user_id: l.user_id as string,
    username: (l.username as string) ?? 'membro',
    epcoins: Number(l.epcoins ?? 0),
    pedido_em: (l.pedido_em as string) ?? '',
  }));
}

export async function responderPedidoCla(userId: string, aceitar: boolean): Promise<void> {
  const { error } = await supabase.rpc('cla_pedido_responder', {
    p_user_id: userId,
    p_aceitar: aceitar,
  });
  if (error) throw new Error(traduzErro(error.message));
}

/** O dono edita a descrição, se está aberto a pedidos, e a cor do nome. */
export async function editarCla(campos: {
  descricao?: string;
  aberto?: boolean;
  cor?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('cla_editar', {
    p_descricao: campos.descricao ?? null,
    p_aberto: campos.aberto ?? null,
    p_cor: campos.cor === undefined ? null : (campos.cor ?? ''),
  });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * O detalhe vem do servidor como uma linha por membro; aqui volta a ser um
 * clã com uma lista, que é a forma como o ecrã o quer.
 */
export async function carregarCla(claId?: string): Promise<Cla | null> {
  const { data, error } = await supabase.rpc('cla_detalhe', { p_cla_id: claId ?? null });
  if (error) {
    console.warn('Clã indisponível:', error.message);
    return null;
  }
  const linhas = (data ?? []) as Record<string, unknown>[];
  if (linhas.length === 0) return null;
  const c = linhas[0];
  return {
    id: c.cla_id as string,
    nome: c.nome as string,
    tag: c.tag as string,
    descricao: (c.descricao as string) ?? null,
    aberto: Boolean(c.aberto),
    cor: (c.cor as string) ?? null,
    max_membros: Number(c.max_membros),
    sou_dono: Boolean(c.sou_dono),
    membros: linhas.map((l) => ({
      username: (l.username as string) ?? 'membro',
      papel: (l.papel as 'dono' | 'membro') ?? 'membro',
      epcoins: Number(l.epcoins ?? 0),
    })),
  };
}

export async function criarCla(
  nome: string,
  tag: string,
  descricao?: string,
  cor?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('cla_criar', {
    p_nome: nome,
    p_tag: tag.toUpperCase(),
    p_descricao: descricao ?? null,
    p_cor: cor ?? null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return data as string;
}

export async function entrarNoCla(claId: string): Promise<void> {
  const { error } = await supabase.rpc('cla_entrar', { p_cla_id: claId });
  if (error) throw new Error(traduzErro(error.message));
}

/** Sair. Se for o dono, o clã dissolve-se — não há passagem de posse. */
export async function sairDoCla(): Promise<void> {
  const { error } = await supabase.rpc('cla_sair');
  if (error) throw new Error(traduzErro(error.message));
}

// ─── PERFIL PÚBLICO ───────────────────────────────────────────

/**
 * Devolve nulo para quem tiver o ranking oculto — a opção que já existe no
 * perfil vale também aqui, senão não valia nada.
 */
export async function carregarPerfilPublico(username: string): Promise<PerfilPublico | null> {
  const { data, error } = await supabase.rpc('perfil_publico', { p_username: username });
  if (error) {
    console.warn('Perfil público indisponível:', error.message);
    return null;
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l) return null;
  return {
    username: l.username as string,
    badges: (l.badges as string[]) ?? [],
    membro_desde: (l.membro_desde as string) ?? null,
    previsoes: Number(l.previsoes ?? 0),
    certas: Number(l.certas ?? 0),
    taxa: Number(l.taxa ?? 0),
    streak: Number(l.streak ?? 0),
    cla_nome: (l.cla_nome as string) ?? null,
    cla_tag: (l.cla_tag as string) ?? null,
    cla_cor: (l.cla_cor as string) ?? null,
  };
}
