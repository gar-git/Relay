import { useEffect, useState } from 'react';
import type { Environment, KeyValue, Role, WorkspaceMember } from '../lib/types';
import { MAX_TEAM_SIZE } from '../lib/types';
import { newKv } from '../lib/utils';
import { KeyValueEditor } from './KeyValueEditor';
import { PromptModal } from './PromptModal';

interface TeamProps {
  token: string;
  workspaceId: string;
  myRole: Role | null;
  onClose: () => void;
}

export function TeamPanel({ token, workspaceId, myRole, onClose }: TeamProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<{ username: string }[]>([]);

  async function refresh() {
    const [m, u] = await Promise.all([
      window.relay.workspaces.members(token, workspaceId),
      window.relay.users.list(),
    ]);
    setMembers(m);
    setUsers(u);
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [token, workspaceId]);

  async function invite() {
    setError('');
    try {
      const m = await window.relay.workspaces.invite(token, workspaceId, username, role);
      setMembers(m);
      setUsername('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(560px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2>Team</h2>
        <p className="muted">
          {members.length} / {MAX_TEAM_SIZE} members — local accounts only. Teammates must register on this machine,
          or share via Export workspace.
        </p>
        {error && <div className="error-text">{error}</div>}
        <table className="team-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.displayName} <span className="muted">@{m.username}</span>
                </td>
                <td>
                  {myRole === 'owner' && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={async (e) => {
                        const next = e.target.value as 'editor' | 'viewer';
                        const updated = await window.relay.workspaces.updateRole(token, workspaceId, m.userId, next);
                        setMembers(updated);
                      }}
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                  ) : (
                    <span className="chip">{m.role}</span>
                  )}
                </td>
                <td>
                  {(myRole === 'owner' || myRole === 'editor') && m.role !== 'owner' && (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={async () => {
                        const updated = await window.relay.workspaces.removeMember(token, workspaceId, m.userId);
                        setMembers(updated);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(myRole === 'owner' || myRole === 'editor') && members.length < MAX_TEAM_SIZE && (
          <div className="row" style={{ marginTop: 14 }}>
            <input
              list="local-users"
              placeholder="Username to invite"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ flex: 1 }}
            />
            <datalist id="local-users">
              {users.map((u) => (
                <option key={u.username} value={u.username} />
              ))}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="button" className="primary" onClick={invite}>
              Invite
            </button>
          </div>
        )}

        <div className="actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface EnvProps {
  token: string;
  workspaceId: string;
  environments: Environment[];
  activeEnvId: string | null;
  canEdit: boolean;
  onChange: () => void | Promise<void>;
  onClose: () => void;
}

export function EnvironmentModal({
  token,
  workspaceId,
  environments,
  activeEnvId,
  canEdit,
  onChange,
  onClose,
}: EnvProps) {
  const [selectedId, setSelectedId] = useState(activeEnvId || environments[0]?.id || '');
  const selected = environments.find((e) => e.id === selectedId) || null;
  const [name, setName] = useState(selected?.name || '');
  const [variables, setVariables] = useState<KeyValue[]>(() => {
    const vars = selected?.variables || [];
    return vars.length ? vars : [newKv()];
  });
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // Only re-load from props when switching environments — not after every workspace refresh,
  // otherwise local edits (and a just-saved form) get wiped mid-interaction.
  useEffect(() => {
    const env = environments.find((e) => e.id === selectedId);
    setName(env?.name || '');
    const vars = env?.variables || [];
    setVariables(vars.length ? vars : [newKv()]);
    setError('');
    setSavedOk(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional

  async function save() {
    if (!selected) {
      setError('No environment selected');
      return;
    }
    setSaving(true);
    setError('');
    setSavedOk(false);
    try {
      const cleaned = variables.filter((v) => v.key.trim() || v.value.trim());
      const updated = await window.relay.environments.update(token, selected.id, {
        name: name.trim() || selected.name,
        variables: cleaned,
      });
      setName(updated.name);
      setVariables(updated.variables.length ? updated.variables : [newKv()]);
      await onChange();
      setSavedOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2>Environments</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ flex: 1 }}>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {canEdit && (
            <button type="button" onClick={() => setShowCreate(true)}>
              New
            </button>
          )}
        </div>
        {selected && (
          <>
            <label className="form-label">
              Name
              <input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
            </label>
            <div style={{ marginTop: 10 }}>
              <KeyValueEditor
                rows={variables}
                onChange={(rows) => {
                  setVariables(rows);
                  setSavedOk(false);
                }}
                showSecret
                readOnly={!canEdit}
              />
            </div>
          </>
        )}
        {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
        {savedOk && !error && <p className="muted" style={{ marginTop: 10, color: 'var(--ok)' }}>Saved</p>}
        <div className="actions">
          {canEdit && selected && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                try {
                  await window.relay.environments.delete(token, selected.id);
                  await onChange();
                  const remaining = environments.filter((e) => e.id !== selected.id);
                  setSelectedId(remaining[0]?.id || '');
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {canEdit && (
            <button type="button" className="primary" onClick={() => void save()} disabled={saving || !selected}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
      <PromptModal
        open={showCreate}
        title="New environment"
        confirmLabel="Create"
        onCancel={() => setShowCreate(false)}
        onConfirm={async (n) => {
          setShowCreate(false);
          try {
            const env = await window.relay.environments.create(token, workspaceId, n);
            await onChange();
            setSelectedId(env.id);
            setName(env.name);
            setVariables([newKv()]);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </div>
  );
}
