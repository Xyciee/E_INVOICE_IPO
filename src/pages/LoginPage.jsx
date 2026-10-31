import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Check
} from 'lucide-react';
import './login.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Authentication failed. Please check credentials.');
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-bg-glow" />
      <div className="login-bg-glow-2" />

      <div className="login-card">
        {/* Brand Header */}
        <div className="login-header">
          <h1 className="login-title">ISC E-Invoice System</h1>
          <p className="login-subtitle">Sign in to your administration dashboard</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-error-alert" style={{ marginBottom: '18px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <div className="input-with-icon">
              <Mail size={16} className="input-icon-left" />
              <input
                type="text"
                required
                className="login-input"
                placeholder="Username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <Lock size={16} className="input-icon-left" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="remember-checkbox">
              <input type="checkbox" defaultChecked />
              <span>Remember this device</span>
            </label>
            <a href="#forgot" onClick={(e) => { e.preventDefault(); alert('Please contact IT to reset your password.'); }} className="forgot-link">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-submit-btn"
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
