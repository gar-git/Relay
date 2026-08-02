import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  curl: string;
  onClose: () => void;
}

export function CurlModal({ open, curl, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open, curl]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2>cURL</h2>
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
      </div>
    </div>
  );
}
