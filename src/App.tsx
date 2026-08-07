import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import SalaComando from './pages/SalaComando';
import Salas from './pages/Salas';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Passaporte from './pages/Passaporte';
import Profile from './pages/Profile';
import Plans from './pages/Plans';
import BancaManagement from './pages/BancaManagement';
import Ranking from './pages/Ranking';
import Simulador from './pages/Simulador';
import Premios from './pages/Premios';
import Admin from './pages/Admin';
import Support from './pages/Support';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/sala' element={<SalaComando />} />
        <Route path='/salas' element={<Salas />} />
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
        <Route path='/passaporte' element={<Passaporte />} />
        <Route path='/profile' element={<Profile />} />
        <Route path='/plans' element={<Plans />} />
        <Route path='/banca' element={<BancaManagement />} />
        <Route path='/ranking' element={<Ranking />} />
        <Route path='/simulador' element={<Simulador />} />
        <Route path='/premios' element={<Premios />} />
        <Route path='/admin' element={<Admin />} />
        <Route path='/suporte' element={<Support />} />

        {/* Rotas antigas — mantidas para não partir links já partilhados.
            Mundial 2026 e Casino foram retirados (roadmap 2 e 8). Raio-X
            e Canais deixaram de ter página própria: vivem dentro do
            Passaporte e da Sala de Comando, respetivamente. */}
        <Route path='/raio-x' element={<Navigate to='/passaporte' replace />} />
        <Route path='/canais' element={<Navigate to='/sala' replace />} />
        <Route path='/live' element={<Navigate to='/sala' replace />} />
        <Route path='/chat' element={<Navigate to='/sala' replace />} />
        <Route path='/casino' element={<Navigate to='/simulador' replace />} />
        <Route path='/mundial' element={<Navigate to='/passaporte' replace />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
