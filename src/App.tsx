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

        {/* Rotas antigas / retiradas — redirecionam para a Home para não
            partir links já partilhados. */}
        {['/raio-x', '/passaporte', '/mundial', '/sala', '/canais', '/live',
          '/chat', '/ranking', '/simulador', '/premios'].map(p => (
          <Route key={p} path={p} element={<Navigate to='/' replace />} />
        ))}
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
