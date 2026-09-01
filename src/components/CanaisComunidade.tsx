import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Send, Trash2, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  apagarMensagemCanal, carregarCanaisComunidade, carregarMensagensCanal,
  enviarMensagemCanal, subscreverCanal,
  type CanalComunidade, type MensagemCanal,
} from '../lib/hub';

/**
 * O chat do Hub.
 *
 * As salas de jogo morrem com o apito final — de propósito, porque uma sala
 * de jogo sem jogo é um cemitério. Isto é o contrário: existe sempre.
 *
 * Há dois tipos de canal e a diferença importa. O geral é aberto a todos os
 * membros. Os de clã são privados — nascem com o clã, só aparecem a quem está
 * lá dentro, e é a base de dados que o garante (migração 015), não este
 * componente: a lista já chega filtrada.
 */
export function CanaisComunidade() {
  const { user, membro } = useAuth();

  const [canais, setCanais] = useState<CanalComunidade[]>([]);
  const [ativo, setAtivo] = useState<CanalComunidade | null>(null);
  const [mensagens, setMensagens] = useState<MensagemCanal[]>([]);
  const [texto, setTexto] = useState('');
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState('');
  const [aEnviar, setAEnviar] = useState(false);

  const fundo = useRef<HTMLDivElement>(null);
  const eAdmin = membro?.badges?.includes('Administrador') ?? false;
  const eVip = membro?.subscription_status === 'active';

  useEffect(() => {
    void (async () => {
      const cs = await carregarCanaisComunidade();
      setCanais(cs);
      setAtivo((a) => a ?? cs[0] ?? null);
      setCarregado(true);
    })();
  }, []);

  const abrir = useCallback(async (c: CanalComunidade) => {
    setMensagens(await carregarMensagensCanal(c.id));
  }, []);

  useEffect(() => {
    if (!ativo) return;
    setMensagens([]);
    void abrir(ativo);
    return subscreverCanal(ativo.id, (m) => {
      // Uma mensagem própria já entrou em otimista; não duplicar.
      setMensagens((atual) => (atual.some((x) => x.id === m.id) ? atual : [...atual, m]));
    });
  }, [ativo, abrir]);

  // Manter a vista no fim: num chat, o que interessa é sempre a última linha.
  useEffect(() => {
    fundo.current?.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !ativo || !texto.trim()) return;

    setErro('');
    setAEnviar(true);
    try {
      await enviarMensagemCanal({
        canalId: ativo.id,
        userId: user.id,
        username: membro?.username ?? 'membro',
        texto,
      });
      setTexto('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally {
      setAEnviar(false);
    }
  }

  async function apagar(m: MensagemCanal) {
    setMensagens((atual) => atual.filter((x) => x.id !== m.id));
    try {
      await apagarMensagemCanal(m.id);
    } catch {
      // Se o servidor recusar, a mensagem volta na próxima abertura do canal.
      if (ativo) void abrir(ativo);
    }
  }

  if (!carregado) {
    return <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>;
  }

  if (canais.length === 0) {
    return <div className='gm-vazio'>Ainda não há canais abertos.</div>;
  }

  const trancado = Boolean(ativo?.requer_vip && !eVip);

  // Separados na lista de propósito: um canal privado de clã e o chat aberto
  // do Hub não são a mesma coisa, e quem escreve tem de perceber num relance
  // quem o vai ler.
  const gerais = canais.filter((c) => !c.cla_id);
  const deCla = canais.filter((c) => c.cla_id);

  return (
    <div className='gm-card'>
      <h2>Chat</h2>
      <p className='gm-sub'>
        O geral é para toda a gente. O do teu clã só o vêem os membros dele. A
        primeira mensagem do dia conta para a missão — e conta uma vez só,
        escrevas aqui ou numa sala de jogo.
      </p>

      <div className='cc-canais'>
        {gerais.map((c) => (
          <button key={c.id}
                  className={`cc-canal ${ativo?.id === c.id ? 'ativo' : ''}`}
                  onClick={() => setAtivo(c)}>
            <span className='cc-icone'>{c.icone ?? '#'}</span>
            {c.nome}
            {c.requer_vip && <Lock size={11} />}
          </button>
        ))}
        {deCla.map((c) => (
          <button key={c.id}
                  className={`cc-canal cla ${ativo?.id === c.id ? 'ativo' : ''}`}
                  onClick={() => setAtivo(c)}>
            <span className='cc-icone'>{c.icone ?? '🛡️'}</span>
            {c.nome}
            <Users size={11} />
          </button>
        ))}
      </div>

      {deCla.length === 0 && (
        <div className='cc-dica'>
          Ainda não estás num clã — entra ou cria um no separador ao lado e
          ganhas um canal privado só para os membros.
        </div>
      )}

      {ativo?.descricao && <div className='cc-descricao'>{ativo.descricao}</div>}
      {erro && <div className='gm-erro'>{erro}</div>}

      <div className='cc-chat'>
        {trancado ? (
          <div className='gm-vazio'>Este canal é só para membros VIP.</div>
        ) : mensagens.length === 0 ? (
          <div className='gm-vazio'>Ninguém disse nada ainda. Começa tu.</div>
        ) : (
          mensagens.map((m) => (
            <div key={m.id} className={`cc-msg ${m.user_id === user?.id ? 'minha' : ''}`}>
              <div className='cc-msg-topo'>
                <strong>{m.username}</strong>
                <span>{hora(m.created_at)}</span>
                {(m.user_id === user?.id || eAdmin) && (
                  <button className='cc-apagar' onClick={() => { void apagar(m); }} title='Apagar'>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <div className='cc-msg-texto'>{m.texto}</div>
            </div>
          ))
        )}
        <div ref={fundo} />
      </div>

      {!trancado && (
        <form className='cc-escrever' onSubmit={(e) => { void enviar(e); }}>
          <input value={texto} maxLength={1000}
                 onChange={(e) => setTexto(e.target.value)}
                 placeholder={`Escrever em ${ativo?.nome ?? 'canal'}…`} />
          <button className='gm-btn' type='submit' disabled={aEnviar || !texto.trim()}>
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  );
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}
