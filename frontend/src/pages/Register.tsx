import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores';
import './Auth.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await authApi.register({ email, password, displayName });
      setAuth(response.data.user, response.data.accessToken, response.data.refreshToken);
      const pendingInvite = sessionStorage.getItem('pending-invite-code');
      if (pendingInvite) {
        sessionStorage.removeItem('pending-invite-code');
        navigate(`/join/${pendingInvite}`);
        return;
      }
      navigate('/');
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.message === 'Email already exists') {
        setError('Account already exists. Please sign in.');
        return;
      }

      if (err.response?.status === 403) {
        setError('Not allowed. If you are already logged in, logout and try again.');
        return;
      }

      setError(err.response?.data?.message || err.message || 'Registration failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p>Join ChatFlow today</p>
        {sessionStorage.getItem('pending-invite-code') && (
          <div className="auth-hint">Create an account to join your invited group.</div>
        )}
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Display Name</label>
            <input
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>
          
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
              placeholder="Create a password"
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary auth-btn">
            Sign Up
          </button>
        </form>
        
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
