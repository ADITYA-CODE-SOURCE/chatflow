import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatApi } from '../services/api';
import { useAuthStore } from '../stores';

export default function JoinGroupPage() {
  const { inviteCode = '' } = useParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const navigate = useNavigate();
  const [message, setMessage] = useState('Joining group...');

  useEffect(() => {
    const code = inviteCode.trim();
    if (!code) {
      navigate('/app', { replace: true });
      return;
    }

    if (!accessToken) {
      sessionStorage.setItem('pending-invite-code', code);
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await chatApi.joinGroupByInvite(code);
        if (!cancelled) {
          setMessage('Joined successfully. Redirecting...');
          window.setTimeout(() => navigate('/app', { replace: true }), 500);
        }
      } catch (error: any) {
        if (!cancelled) {
          setMessage(error?.response?.data?.message || 'Failed to join group');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, inviteCode, navigate]);

  return <div className="app-loading">{message}</div>;
}
