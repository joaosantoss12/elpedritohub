import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Salas from './pages/Salas';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Profile from './pages/Profile';
import Plans from './pages/Plans';
import Casino from './pages/Casino';
import BancaManagement from './pages/BancaManagement';
import Admin from './pages/Admin';
import Support from './pages/Support';
import Arena from './pages/Arena';
import Recompensas from './pages/Recompensas';
import Clas from './pages/Clas';
import PerfilPublico from './pages/PerfilPublico';
import { DropWidget } from './components/DropWidget';
import { LeitorMusica } from './components/LeitorMusica';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/salas' element={<Salas />} />
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
        <Route path='/profile' element={<Profile />} />
        <Route path='/plans' element={<Plans />} />
        <Route path='/casino' element={<Casino />} />
        <Route path='/banca' element={<BancaManagement />} />
        <Route path='/admin' element={<Admin />} />
        <Route path='/suporte' element={<Support />} />
        <Route path='/arena' element={<Arena />} />
        <Route path='/recompensas' element={<Recompensas />} />
        <Route path='/clas' element={<Clas />} />
        <Route path='/u/:username' element={<PerfilPublico />} />

        {/* Rotas antigas / retiradas — redirecionam para a Home para não
            partir links já partilhados. */}
        {['/raio-x', '/passaporte', '/mundial', '/sala', '/canais', '/live',
          '/chat', '/ranking', '/simulador', '/premios'].map(p => (
          <Route key={p} path={p} element={<Navigate to='/' replace />} />
        ))}
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>

      {/* Os EPC DROPs aparecem em qualquer página com sessão iniciada — o
          objectivo é apanhar quem está no Hub, não quem está numa página
          concreta. Dentro da sala, o widget filtra pelo jogo. */}
      <DropWidget />

      {/* Barra de música estilo Spotify — vive aqui, fora do <Routes>, para a
          reprodução não parar ao mudar de página. */}
      <LeitorMusica />
    </AuthProvider>
  );
}

export default App;
