import logoUrl from '../assets/logo.png';

interface Props {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function BrandLogo({ size = 22, showWordmark = true, className = '' }: Props) {
  return (
    <div className={`brand ${className}`.trim()}>
      <img src={logoUrl} alt="Relay" width={size} height={size} className="brand-logo" draggable={false} />
      {showWordmark && <span className="brand-wordmark">RELAY</span>}
    </div>
  );
}
