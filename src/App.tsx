import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Profile from './pages/Profile';
import Plans from './pages/Plans';
import Mundial2026 from './pages/Mundial2026';
import BancaManagement from './pages/BancaManagement';
import Casino from './pages/Casino';
import Livestream from './pages/Livestream';
import Premios from './pages/Premios';
import Admin from './pages/Admin';
import Support from './pages/Support';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/chat' element={<Chat />} />
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
        <Route path='/profile' element={<Profile />} />
        <Route path='/plans' element={<Plans />} />
        <Route path='/mundial' element={<Mundial2026 />} />
        <Route path='/banca' element={<BancaManagement />} />
        <Route path='/casino' element={<Casino />} />
        <Route path='/live' element={<Livestream />} />
        <Route path='/premios' element={<Premios />} />
        <Route path='/admin' element={<Admin />} />
        <Route path='/suporte' element={<Support />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
