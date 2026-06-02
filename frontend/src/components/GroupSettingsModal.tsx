import { useEffect, useMemo, useState } from 'react';
import { chatApi, userApi } from '../services/api';
import type { ChatRoom, GroupInvite, User } from '../types';
import './GroupSettingsModal.css';

type Member = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
};

type Props = {
  open: boolean;
  room: ChatRoom;
  onClose: () => void;
  onUpdated: (room?: ChatRoom) => void;
  onDeleted: (roomId: string) => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
  currentUser: User;
};

export default function GroupSettingsModal({
  open,
  room,
  onClose,
  onUpdated,
  onDeleted,
  onToast,
  currentUser,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<GroupInvite | null>(null);

  const [name, setName] = useState(room.name || '');
  const [description, setDescription] = useState(room.description || '');
  const [avatarUrl, setAvatarUrl] = useState(room.avatarUrl || '');

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);

  const myRole = useMemo(() => {
    const me = members.find((member) => member.userId === currentUser.id);
    return me?.role;
  }, [members, currentUser.id]);

  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const isOwner = myRole === 'OWNER';

  useEffect(() => {
    if (!open) return;
    setName(room.name || '');
    setDescription(room.description || '');
    setAvatarUrl(room.avatarUrl || '');
    setSearch('');
    setSearchResults([]);
    void Promise.all([loadMembers(), loadInvite()]);
  }, [open, room.id]);

  const loadMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await chatApi.getGroupMembers(room.id);
      setMembers(res.data as Member[]);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const loadInvite = async () => {
    try {
      const res = await chatApi.getGroupInvite(room.id);
      setInvite(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load invite');
    }
  };

  const saveGroup = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await chatApi.updateGroup(room.id, {
        name,
        description,
        avatarUrl: avatarUrl || undefined,
      });
      onUpdated(res.data);
      onToast('Group updated', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const doSearch = async () => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await userApi.search(q, 0, 10);
      const memberIds = new Set(members.map((member) => member.userId));
      setSearchResults((res.data.content || []).filter((user) => !memberIds.has(user.id)));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const addMember = async (userId: string) => {
    setSaving(true);
    setError('');
    try {
      await chatApi.addMember(room.id, userId);
      await loadMembers();
      onUpdated();
      onToast('Member added', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!window.confirm('Remove this member from the group?')) return;
    setSaving(true);
    setError('');
    try {
      await chatApi.removeMember(room.id, userId);
      await loadMembers();
      onUpdated();
      onToast('Member removed', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to remove member');
    } finally {
      setSaving(false);
    }
  };

  const promote = async (userId: string) => {
    setSaving(true);
    setError('');
    try {
      await chatApi.promoteAdmin(room.id, userId);
      await loadMembers();
      onToast('Member promoted to admin', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to promote');
    } finally {
      setSaving(false);
    }
  };

  const demote = async (userId: string) => {
    setSaving(true);
    setError('');
    try {
      await chatApi.demoteAdmin(room.id, userId);
      await loadMembers();
      onToast('Admin demoted to member', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to demote');
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (!window.confirm('Leave this group?')) return;
    setSaving(true);
    setError('');
    try {
      await chatApi.leaveGroup(room.id);
      onUpdated();
      onClose();
      onDeleted(room.id);
      onToast('You left the group', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to leave group');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async () => {
    if (!window.confirm(`Delete ${room.name || 'this group'} permanently?`)) return;
    setSaving(true);
    setError('');
    try {
      await chatApi.deleteGroup(room.id);
      onClose();
      onDeleted(room.id);
      onToast('Group deleted', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete group');
    } finally {
      setSaving(false);
    }
  };

  const regenerateInvite = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await chatApi.regenerateInvite(room.id);
      setInvite(res.data);
      onUpdated();
      onToast('Invite code regenerated', 'success');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to regenerate invite');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(`${label} copied`, 'success');
    } catch {
      onToast(`Could not copy ${label.toLowerCase()}`, 'error');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-modal" onClick={(e) => e.stopPropagation()}>
        <div className="groupmodal-header">
          <div>
            <h3>Group Settings</h3>
            <div className="groupmodal-sub">
              Created by: <span>{room.createdByName}</span>
            </div>
          </div>
          <button className="newchat-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="groupmodal-section groupmodal-profile">
          <div className="groupmodal-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={name || room.name} /> : <span>{(name || room.name || 'G').charAt(0).toUpperCase()}</span>}
          </div>
          <div className="groupmodal-profilecopy">
            <div className="groupmodal-name">{name || room.name}</div>
            <div className="groupmodal-meta">{room.memberCount} members</div>
          </div>
        </div>

        <div className="groupmodal-section">
          <div className="groupmodal-row groupmodal-invitebox">
            <div>
              <div className="invite-code" title="Invite code">
                Code: <span>{invite?.inviteCode || room.inviteCode || '-'}</span>
              </div>
              {invite?.expiresAt && (
                <div className="groupmodal-hint">
                  Expires {new Date(invite.expiresAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="groupmodal-actions-inline">
              {invite?.inviteCode && (
                <button type="button" className="invite-copy" onClick={() => copyText(invite.inviteCode, 'Invite code')}>
                  Copy Code
                </button>
              )}
              {invite?.inviteLink && (
                <button type="button" className="invite-copy" onClick={() => copyText(invite.inviteLink, 'Invite link')}>
                  Copy Link
                </button>
              )}
              {isAdmin && (
                <button type="button" className="invite-copy" onClick={regenerateInvite} disabled={saving}>
                  Regenerate
                </button>
              )}
            </div>
          </div>

          <label className="newchat-label">Group name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin || saving} />

          <label className="newchat-label">Description</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isAdmin || saving} />

          <label className="newchat-label">Group avatar URL</label>
          <input className="input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} disabled={!isAdmin || saving} placeholder="https://..." />

          {isAdmin && (
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={saveGroup} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="groupmodal-section">
          <div className="groupmodal-title">Members</div>
          {loading && <div className="newchat-hint">Loading...</div>}
          <div className="member-list">
            {members.map((member) => (
              <div key={member.userId} className="member-item">
                <div className="member-avatar">
                  {member.avatarUrl ? <img src={member.avatarUrl} alt={member.displayName} /> : member.displayName?.charAt(0)?.toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">
                    {member.displayName}
                    <span className="member-badge">{member.role}</span>
                  </div>
                  <div className="member-email">{member.email}</div>
                </div>

                {isOwner && member.role === 'MEMBER' && (
                  <button className="member-action" onClick={() => promote(member.userId)} disabled={saving}>
                    Promote
                  </button>
                )}
                {isOwner && member.role === 'ADMIN' && member.userId !== currentUser.id && (
                  <button className="member-action" onClick={() => demote(member.userId)} disabled={saving}>
                    Demote
                  </button>
                )}
                {isAdmin && member.role !== 'OWNER' && member.userId !== currentUser.id && (
                  <button className="member-action danger" onClick={() => removeMember(member.userId)} disabled={saving}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="groupmodal-section">
            <div className="groupmodal-title">Add member</div>
            <div className="groupmodal-row">
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" />
              <button className="btn btn-primary" type="button" onClick={doSearch} disabled={loading || saving}>
                Search
              </button>
            </div>
            <div className="member-list">
              {searchResults.map((user) => (
                <button key={user.id} className="member-item member-pick" type="button" onClick={() => addMember(user.id)} disabled={saving}>
                  <div className="member-avatar">{user.displayName?.charAt(0)?.toUpperCase()}</div>
                  <div className="member-info">
                    <div className="member-name">{user.displayName}</div>
                    <div className="member-email">{user.email}</div>
                  </div>
                  <div className="member-plus">Add</div>
                </button>
              ))}
              {!loading && search.trim().length >= 2 && searchResults.length === 0 && (
                <div className="newchat-hint">No available users found</div>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions groupmodal-footer-actions">
          <button type="button" className="btn" onClick={leave} disabled={saving}>
            Leave group
          </button>
          {isOwner && (
            <button type="button" className="btn btn-danger" onClick={deleteGroup} disabled={saving}>
              Delete group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
