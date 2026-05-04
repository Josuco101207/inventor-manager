import React, { useState } from 'react';
import { Package, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import './LoginView.css';

const LoginView = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsAuthLoading(true);
    try {
      await login(email, password);
      toast.success("Acceso concedido");
    } catch (error) {
      console.error(error);
      let message = "Credenciales incorrectas o cuenta no autorizada";
      
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        message = "El correo o la contraseña son incorrectos.";
      } else if (error.code === 'auth/too-many-requests') {
        message = "Demasiados intentos fallidos. Intenta más tarde.";
      } else if (error.code === 'auth/user-disabled') {
        message = "Esta cuenta ha sido desactivada.";
      }
      
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    if (errorMsg) setErrorMsg('');
  };



  return (
    <div className="login-container">
      <div className="login-card animate-slide-up">
        <header className="login-header flex flex-col items-center text-center mb-10">
          <div className="logo-icon-large">
            <Package size={36} color="#fff" strokeWidth={2.5} />
          </div>
          <h2>Identificación</h2>
          <p>Control de Acceso Industriales</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="f-group">
            <label>Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email" 
                placeholder="tu@correo.com" 
                required 
                value={email}
                onChange={handleInputChange(setEmail)}
              />
            </div>
          </div>

          <div className="f-group">
            <label>Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                required 
                value={password}
                onChange={handleInputChange(setPassword)}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="animate-shake" style={{ background: '#fff1f1', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
              <p style={{ color: '#dc2626', fontSize: '13px', fontWeight: '700', textAlign: 'center', margin: 0 }}>
                ⚠️ {errorMsg}
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={isAuthLoading}>
            {isAuthLoading ? <Loader2 className="animate-spin" size={20} /> : (
              <>
                Entrar al Sistema <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>



        <footer className="login-footer mt-10 text-center">
          <p>
            Si no tienes cuenta, solicita tu acceso al <br />
            <strong>Administrador del Almacén</strong>.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default LoginView;
