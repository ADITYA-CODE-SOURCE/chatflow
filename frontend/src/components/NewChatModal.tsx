import { useEffect, useMemo, useState } from 'react';
import type { ChatRoom, User } from '../types';
import { chatApi, userApi } from '../services/api';
import './NewChatModal.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onRoomCreatedOrJoined: (room?: ChatRoom) => void;
  currentUserId?: string;
};

export default function NewChatModal({ open, onClose, onRoomCreatedOrJoined, currentUserId }: Props) {
  const [tab, setTab] = useState<'dm' | 'join'>('dm');
  const [query, setQuery] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  useEffect(() => {
    if (!open) return;
    setError('');
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || tab !== 'dm' || !canSearch) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await userApi.search(query.trim(), 0, 10);
        if (!cancelled) {
          setResults((res.data.content || []).filter((user) => user.id !== currentUserId));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [open, tab, query, canSearch]);

  if (!open) return null;

  const startDm = async (userId: string) => {
    if (userId === currentUserId) {
      setError('You cannot start a direct chat with yourself');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await chatApi.createDirectChat(userId);
      onRoomCreatedOrJoined(res.data);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to start chat');
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async () => {
    const raw = inviteCode.trim();
    const code = raw.includes('/join/') ? raw.split('/join/').pop() || '' : raw;
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const res = await chatApi.joinGroupByInvite(code);
      onRoomCreatedOrJoined(res.data);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="newchat-header">
          <h3>New Chat</h3>
          <button className="newchat-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="newchat-tabs">
          <button
            className={tab === 'dm' ? 'active' : ''}
            onClick={() => setTab('dm')}
            type="button"
          >
            Direct Message
          </button>
          <button
            className={tab === 'join' ? 'active' : ''}
            onClick={() => setTab('join')}
            type="button"
          >
            Join Group
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {tab === 'dm' ? (
          <div className="newchat-panel">
            <label className="newchat-label">Search users (name or email)</label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type at least 2 characters"
            />

            <div className="newchat-results">
              {!canSearch && <div className="newchat-hint">Start typing to search…</div>}
              {loading && <div className="newchat-hint">Searching…</div>}
              {!loading && canSearch && results.length === 0 && (
                <div className="newchat-hint">No users found</div>
              )}
              {results.map((u) => (
                <button
                  key={u.id}
                  className="newchat-user"
                  type="button"
                  onClick={() => startDm(u.id)}
                  disabled={loading}
                >
                  <div className="newchat-avatar">{u.displayName?.charAt(0)?.toUpperCase()}</div>
                  <div className="newchat-userinfo">
                    <div className="newchat-name">{u.displayName}</div>
                    <div className="newchat-email">{u.email}</div>
                  </div>
                  <div className="newchat-action">Chat</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="newchat-panel">
            <label className="newchat-label">Invite code</label>
            <input
              className="input"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste invite code or invite link"
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={joinGroup} disabled={loading}>
                Join
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
