import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface MembroData {
  id: string;
  email: string;
  nome: string;
  username: string;
  epcoins: number;
  streak_login: number;
  last_login_date: string;
  chat_messages: number;
  prizes_claimed: number;
  badges: string[];
}

interface AuthContextType {
  user: User | null;
  membro: MembroData | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshMembro: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  membro: null,
  loading: true,
  signOut: async () => {},
  refreshMembro: async () => {},
});

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const normalizeStoredDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const matchedDate = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (matchedDate) {
    return matchedDate[0];
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return formatLocalDate(parsedDate);
};

const normalizeMembroData = (data: MembroData) => ({
  ...data,
  last_login_date: normalizeStoredDate(data.last_login_date) ?? '',
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [membro, setMembro] = useState<MembroData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMembroData = async (currentUser: User) => {
    try {
      console.log('fetchMembroData: Iniciando para user:', currentUser.id);
      const { data, error } = await supabase
        .from('membros')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      
      console.log('fetchMembroData: Resposta recebida', { data, error });
      
      if (error) {
        console.warn('Erro ao procurar dados do membro:', error.code, error.message);
        // Se a tabela não existe ou o utilizador não tem registo, apenas retorna
        return;
      }
      
      if (data) {
        console.log('Dados do membro encontrados:', data);
        // LÓGICA DE STREAK DE LOGIN
        const today = formatLocalDate(new Date());
        const lastLogin = normalizeStoredDate(data.last_login_date);
        
        let newStreak = data.streak_login ?? 0;
        let requiresUpdate = false;

        if (lastLogin !== today) {
          newStreak += 1;
          requiresUpdate = true;
        }

        if (requiresUpdate) {
          console.log('Atualizando streak de login para:', newStreak);
          const isVip = (data.badges ?? []).includes('VIP') || (data.badges ?? []).includes('Administrador');
          const epcBonus = isVip ? 50 : 10;
          const { data: updatedData, error: updateError } = await supabase
            .from('membros')
            .update({
              streak_login: newStreak,
              last_login_date: today,
              epcoins: (data.epcoins ?? 0) + epcBonus,
            })
            .eq('id', currentUser.id)
            .select()
            .single();

          if (!updateError && updatedData) {
            console.log('Dados atualizados com sucesso');
            setMembro(normalizeMembroData(updatedData as MembroData));
            return;
          }
        }
        
        setMembro(normalizeMembroData(data as MembroData));
      }
    } catch (err) {
      console.error('fetchMembroData Error:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const initSession = async () => {
      try {
        console.log('AuthContext: Starting session init...');
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error fetching session:", error);
        }
        const currentUser = session?.user ?? null;
        console.log('AuthContext: Current user:', currentUser?.id ?? 'None');
        if (mounted) setUser(currentUser);
        
        if (currentUser) {
          // Não espera pela fetchMembroData - deixa correr em background
          console.log('AuthContext: Iniciando fetchMembroData em background');
          fetchMembroData(currentUser).catch(err => console.error('Background fetch error:', err));
        }
      } catch (err) {
        console.error("Init Session Error:", err);
      } finally {
        // FORÇA loading a false aqui, independentemente do resultado
        if (mounted) {
          console.log('AuthContext: Antecipadamente marcando loading como false');
          setLoading(false);
        }
      }
    };

    initSession();

    // SAFETY FALLBACK: garante que loading sai de true após 2 segundos
    timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('AuthContext: Timeout (2s) - forcando loading to false');
        setLoading(false);
      }
    }, 2000);

    // Escutar mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('AuthContext: Auth state changed:', _event);
      const currentUser = session?.user ?? null;
      if (mounted) setUser(currentUser);
      
      if (currentUser && _event === 'SIGNED_IN') {
        fetchMembroData(currentUser).catch(err => console.error('Background fetch error:', err));
      } else if (currentUser && _event === 'USER_UPDATED') {
        // Sincronizar email atualizado na tabela membros
        if (currentUser.email) {
          supabase
            .from('membros')
            .update({ email: currentUser.email })
            .eq('id', currentUser.id)
            .then(({ error }) => {
              if (error) console.error('Erro ao sincronizar email na tabela membros:', error);
            });
        }
        fetchMembroData(currentUser).catch(err => console.error('Background fetch error:', err));
      } else if (!currentUser) {
        if (mounted) {
          setMembro(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const refreshMembro = async () => {
    if (user) await fetchMembroData(user);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, membro, loading, signOut, refreshMembro }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
