import { useState } from 'react';
import { BrandLogo } from './BrandLogo';

interface Props {
  onAuth: (token: string) => void;
}

export function LoginScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!window.relay?.auth) {
        throw new Error(
          'Relay desktop bridge is not available. Run `npm run dev` and use the Electron window (not the browser tab at localhost:5173).',
        );
      }
      const result =
        mode === 'login'
          ? await window.relay.auth.login(username, password)
          : await window.relay.auth.register(username, password, displayName || undefined);
      localStorage.setItem('relay_token', result.token);
      onAuth(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-titlebar titlebar" aria-hidden="true">
        <div className="titlebar-left no-drag">
          <BrandLogo size={16} showWordmark={false} />
        </div>
        <div className="titlebar-center">Relay</div>
        <div className="titlebar-right no-drag" />
      </div>
      <div className="login-grid" aria-hidden={false}>
        <section className="login-brand-pane">
          <div className="login-signal" aria-hidden="true">
            <span className="login-signal-ring r1" />
            <span className="login-signal-ring r2" />
            <span className="login-signal-ring r3" />
            <span className="login-signal-core" />
          </div>
          <div className="login-brand-copy">
            <BrandLogo size={48} />
            <p className="login-tagline">Ship requests. Share packs. Stay local.</p>
            <ul className="login-points">
              <li>API testing without the cloud tax</li>
              <li>Workspaces for up to 15 teammates</li>
              <li>OpenAPI docs + export that travels</li>
            </ul>
          </div>
        </section>

        <section className="login-form-pane">
          <div className="login-form-shell">
            <p className="login-kicker">{mode === 'login' ? 'Welcome back' : 'Join this machine'}</p>
            <h1 className="login-title">{mode === 'login' ? 'Open your workspace' : 'Create a local account'}</h1>
            <p className="login-sub">Accounts stay on this device. No cloud login required.</p>

            <form className="login-form" onSubmit={submit}>
              {mode === 'register' && (
                <label className="form-label">
                  Display name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              )}
              <label className="form-label">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </label>
              <label className="form-label">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </label>
              {error && <div className="error-text">{error}</div>}
              <button className="primary login-submit" type="submit" disabled={loading}>
                {loading ? 'Working…' : mode === 'login' ? 'Enter Relay' : 'Create account'}
              </button>
            </form>

            <p className="login-switch">
              {mode === 'login' ? (
                <>
                  New here?{' '}
                  <button type="button" className="ghost login-link" onClick={() => setMode('register')}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already set up?{' '}
                  <button type="button" className="ghost login-link" onClick={() => setMode('login')}>
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
