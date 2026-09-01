import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Flame, Loader2, Shield } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { carregarPerfilPublico, type PerfilPublico as Perfil } from '../lib/comunidade';
import '../styles/Gamificacao.css';

/**
 * O cartão público de um membro: nome, badges, taxa de acerto, clã.
 *
 * Não mostra email, plano nem saldo — o que é público é o que faz sentido
 * partilhar. E quem tiver o ranking oculto (a opção que já existe no perfil)
 * simplesmente não tem página: essa escolha vale aqui como vale no ranking.
 */
export default function PerfilPublico() {
  const { username = '' } = useParams();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregado(false);
    void carregarPerfilPublico(username).then((p) => {
      if (!vivo) return;
      setPerfil(p);
      setCarregado(true);
    });
    return () => { vivo = false; };
  }, [username]);

  return (
    <div className='gm-page'>
      <Navbar />
      <div className='gm-wrap'>
        {!carregado && <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>}

        {carregado && !perfil && (
          <div className='gm-card'>
            <div className='gm-vazio'>
              Não há perfil público para <strong>{username}</strong>.
            </div>
          </div>
        )}

        {carregado && perfil && (
          <div className='gm-card'>
            <div className='gm-perfil-topo'>
              <div className='gm-avatar'>{perfil.username.charAt(0).toUpperCase()}</div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
                  {perfil.username}
                </h1>
                <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {perfil.cla_nome && (
                    <>
                      <Shield size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                      {perfil.cla_nome} [{perfil.cla_tag}] ·{' '}
                    </>
                  )}
                  {perfil.membro_desde
                    ? `no Hub desde ${new Date(perfil.membro_desde).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`
                    : 'membro do Hub'}
                </p>

                {perfil.badges.length > 0 && (
                  <div className='gm-badges'>
                    {perfil.badges.map((b) => (
                      <span key={b} className='gm-badge'>{b}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className='gm-metricas'>
              <div className='gm-metrica'>
                <strong>{perfil.taxa}%</strong>
                <span>Taxa de acerto</span>
              </div>
              <div className='gm-metrica'>
                <strong>{perfil.certas}</strong>
                <span>Previsões certas</span>
              </div>
              <div className='gm-metrica'>
                <strong>{perfil.previsoes}</strong>
                <span>Previsões feitas</span>
              </div>
              <div className='gm-metrica'>
                <strong>
                  <Flame size={22} style={{ verticalAlign: '-3px', marginRight: 3 }} />
                  {perfil.streak}
                </strong>
                <span>Streak de dias</span>
              </div>
            </div>

            <p style={{ marginTop: 20, marginBottom: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              A taxa de acerto conta apenas previsões gratuitas já resolvidas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
