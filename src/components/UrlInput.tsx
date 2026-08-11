import type { ClipboardEvent, KeyboardEvent } from 'react';
import { isProbablyCurl } from '../lib/parseCurl';
import { VarAwareInput } from './VarAwareInput';

interface Props {
  value: string;
  variables: Record<string, string>;
  envName?: string | null;
  onUpdateVariable?: (name: string, value: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPasteCurl?: (text: string) => void;
}

export function UrlInput({
  value,
  variables,
  envName,
  onUpdateVariable,
  disabled,
  placeholder = 'https://api.example.com/v1/resource, {{baseUrl}}/users, or paste a cURL',
  onChange,
  onSend,
  onPasteCurl,
}: Props) {
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (text && isProbablyCurl(text) && onPasteCurl) {
      e.preventDefault();
      onPasteCurl(text);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') onSend();
  }

  return (
    <VarAwareInput
      value={value}
      onChange={onChange}
      variables={variables}
      envName={envName}
      onUpdateVariable={onUpdateVariable}
      disabled={disabled}
      placeholder={placeholder}
      wrapClassName="url-input-wrap"
      inputClassName="url-input"
      onPaste={onPaste}
      onKeyDown={onKeyDown}
    />
  );
}
