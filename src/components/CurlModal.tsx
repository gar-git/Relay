import { useEffect, useState } from 'react';
import { isProbablyCurl, parseCurl, type ParsedCurl } from '../lib/parseCurl';

interface Props {
  open: boolean;
  curl: string;
  onClose: () => void;
  onImport?: (parsed: ParsedCurl) => void;
  /** Prefill import tab (e.g. after pasting cURL into the URL field) */
  initialImportText?: string;
  initialTab?: 'copy' | 'import';
}

export function CurlModal({
  open,
  curl,
  onClose,
  onImport,
  initialImportText = '',
  initialTab = 'copy',
}: Props) {
  const [tab, setTab] = useState<'copy' | 'import'>(initialTab);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState(initialImportText);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setError('');
    setTab(initialTab);
    if (initialImportText) setPaste(initialImportText);
  }, [open, curl, initialTab, initialImportText]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = curl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function applyImport() {
    setError('');
    try {
      const parsed = parseCurl(paste);
      onImport?.(parsed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPaste(text);
        setError('');
        if (isProbablyCurl(text)) setTab('import');
      }
    } catch {
      setError('Could not read clipboard — paste manually into the box');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2>cURL</h2>
        <div className="panel-tabs" style={{ margin: '0 0 12px', padding: 0 }}>
          <button type="button" className={tab === 'copy' ? 'active' : ''} onClick={() => setTab('copy')}>
            Copy
          </button>
          <button type="button" className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
            Import
          </button>
        </div>

        {tab === 'copy' ? (
          <>
            <p className="muted">Copy this command to run the request from a terminal.</p>
            <pre className="curl-preview">{curl || 'Add a URL to generate cURL'}</pre>
            <div className="actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button type="button" className="primary" onClick={copy} disabled={!curl}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Paste a cURL command to fill method, URL, headers, auth, and body.</p>
            <textarea
              className="curl-import-area"
              rows={12}
              value={paste}
              placeholder={'curl --request POST \\\n  --url https://api.example.com/v1/items \\\n  --header \'Content-Type: application/json\' \\\n  --data \'{"name":"Relay"}\''}
              onChange={(e) => {
                setPaste(e.target.value);
                setError('');
              }}
              spellCheck={false}
            />
            {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
            <div className="actions">
              <button type="button" onClick={() => void pasteFromClipboard()}>
                Paste from clipboard
              </button>
              <span className="spacer" />
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={applyImport} disabled={!paste.trim() || !onImport}>
                Import
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
