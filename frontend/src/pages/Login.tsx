import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await authApi.login({ email, password });
      setAuth(response.data.user, response.data.accessToken, response.data.refreshToken);
      const pendingInvite = sessionStorage.getItem('pending-invite-code');
      if (pendingInvite) {
        sessionStorage.removeItem('pending-invite-code');
        navigate(`/join/${pendingInvite}`);
        return;
      }
      navigate('/');
    } catch (err: any) {
      if (err.response?.status === 403) {
        localStorage.removeItem('auth-storage');
        setError('Session expired. Please try again.');
        return;
      }

      setError(err.response?.data?.message || err.message || 'Login failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Welcome Back</h1>
        <p>Sign in to continue</p>
        {sessionStorage.getItem('pending-invite-code') && (
          <div className="auth-hint">Sign in to join your invited group.</div>
        )}
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary auth-btn">
            Sign In
          </button>
        </form>
        
        <p className="auth-switch">
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
