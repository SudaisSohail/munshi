interface SellerBadgeProps {
  storeName?: string;
  whatsappNumber?: string;
  size?: 'sm' | 'md';
}

export default function SellerBadge({ storeName, whatsappNumber, size = 'sm' }: SellerBadgeProps) {
  const label = storeName || 'Unknown Seller';

  return (
    <span
      className="badge badge-neutral"
      style={{
        fontSize: size === 'sm' ? 11 : 13,
        gap: 4,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
      }}
      title={label}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      {label}
    </span>
  );
}
