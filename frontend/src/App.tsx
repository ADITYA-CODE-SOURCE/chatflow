import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores';
import Login from './pages/Login';
import Register from './pages/Register';
import JoinGroupPage from './pages/JoinGroupPage';
import './styles/index.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  return accessToken ? <>{children}</> : <Navigate to="/login" replace />;
}

function RootRedirect() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return accessToken ? <Navigate to="/app" replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/join/:inviteCode" element={<JoinGroupPage />} />
      <Route
        path="/app/*"
        element={
          <PrivateRoute>
            <Suspense fallback={<div className="app-loading">Loading…</div>}>
              <Dashboard />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
