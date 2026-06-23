import React, { useState } from 'react';
import { Package, Mail, Lock, ArrowRight, Loader2, Shield, AlertCircle } from 'lucide-react';
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
      {/* Animated Background */}
      <div className="login-bg-gradient" />
      <div className="login-orb-accent" />

      {/* Branding */}
      <div className="login-branding login-animate-brand">
        <div className="login-logo-ring">
          <Package size={38} color="#fff" strokeWidth={2} />
        </div>
        <h1>
          Inventor <span>Manager</span>
        </h1>
        <p className="login-branding-subtitle">
          Sistema de Control Industrial
        </p>
      </div>

      {/* Login Card */}
      <div className="login-card login-animate-in">
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="login-field">
            <label className="login-field-label">Correo Electrónico</label>
            <div className="login-input-wrapper">
              <Mail className="login-input-icon" size={18} />
              <input
                type="email"
                className="login-input"
                placeholder="tu@correo.com"
                required
                value={email}
                onChange={handleInputChange(setEmail)}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field">
            <label className="login-field-label">Contraseña</label>
            <div className="login-input-wrapper">
              <Lock className="login-input-icon" size={18} />
              <input
                type="password"
                className="login-input"
                placeholder="••••••••"
                required
                value={password}
                onChange={handleInputChange(setPassword)}
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="login-error">
              <AlertCircle className="login-error-icon" size={16} />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* Submit */}
          <button type="submit" className="login-submit-btn" disabled={isAuthLoading}>
            {isAuthLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Iniciar Sesión
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {/* Secure Badge */}
          <div className="login-secure-badge">
            <Shield size={12} />
            <span>Conexión segura y encriptada</span>
          </div>
        </form>
      </div>

      {/* Footer */}
      <footer className="login-footer">
        <p>
          ¿Sin cuenta? Solicítala al <strong>Administrador</strong>
        </p>
        <div className="login-bottom-line" />
      </footer>
    </div>
  );
};

export default LoginView;
