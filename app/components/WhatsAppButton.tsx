'use client';

interface WhatsAppButtonProps {
  phoneNumber: string;
  message?: string;
}

export default function WhatsAppButton({ phoneNumber, message = "Hi! I found your store on E-Bazaar" }: WhatsAppButtonProps) {
  const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat on WhatsApp"
      title="Chat on WhatsApp"
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 60,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--whatsapp)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-whatsapp)',
        transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
        animation: 'float 3s ease-in-out infinite',
        textDecoration: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.12)';
        e.currentTarget.style.animation = 'none';
        e.currentTarget.style.boxShadow = '0 12px 32px rgba(37,211,102,0.45)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.animation = 'float 3s ease-in-out infinite';
        e.currentTarget.style.boxShadow = 'var(--shadow-whatsapp)';
      }}
    >
      {/* Ping ring */}
      <span style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '2px solid var(--whatsapp)',
        animation: 'pulse-ring 2s ease-out infinite',
      }} />
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M16.5 14.5c-.28.78-1.4 1.43-2.28 1.62-.61.13-1.41.23-4.09-.88-2.44-1.01-4-3.49-4.12-3.65-.12-.16-.99-1.31-.99-2.5s.62-1.77.84-2.01c.22-.24.48-.3.64-.3l.46.01c.15 0 .34-.06.53.4.2.48.68 1.65.74 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.48.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.22 1.35z" fill="white" />
      </svg>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.6; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </a>
  );
}
