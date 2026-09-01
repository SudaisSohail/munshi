'use client';

import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{
      background: 'var(--slate-900)',
      color: 'var(--slate-300)',
      marginTop: 'auto',
    }}>
      {/* Top section */}
      <div className="container" style={{ padding: 'var(--space-12) var(--space-4)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-8)',
        }}>
          {/* Brand column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
              <div style={{
                width: 36, height: 36,
                background: 'var(--primary)',
                borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="white" opacity="0.9"/>
                  <path d="M16.5 14.5c-.28.78-1.4 1.43-2.28 1.62-.61.13-1.41.23-4.09-.88-2.44-1.01-4-3.49-4.12-3.65-.12-.16-.99-1.31-.99-2.5s.62-1.77.84-2.01c.22-.24.48-.3.64-.3l.46.01c.15 0 .34-.06.53.4.2.48.68 1.65.74 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.48.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.22 1.35z" fill="white"/>
                </svg>
              </div>
              <span style={{ fontWeight: 800, fontSize: 22, color: 'white', letterSpacing: '-0.02em' }}>E-Bazaar</span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--slate-400)', maxWidth: 240 }}>
              Pakistan's first WhatsApp-powered marketplace. List products by voice, reach millions of buyers.
            </p>
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--whatsapp)',
                color: 'white',
                padding: '7px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: 13, fontWeight: 600,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                </svg>
                +92 346 0392313
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-4)' }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[
                { label: 'Browse Products', href: '/products' },
                { label: 'Sell on E-Bazaar', href: '/seller' },

                { label: 'My Cart', href: '/cart' },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} style={{
                    fontSize: 14, color: 'var(--slate-400)',
                    transition: 'color var(--transition-fast)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--slate-400)')}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* How It Works */}
          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-4)' }}>
              For Sellers
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[
                '📱 Send a voice message on WhatsApp',
                '🤖 AI lists your product automatically',
                '🛒 Buyers find and contact you',
                '💸 Earn — no tech skills needed!',
              ].map((text) => (
                <li key={text} style={{ fontSize: 13, color: 'var(--slate-400)', lineHeight: 1.5 }}>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-4)' }}>
              Contact
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <a href="https://wa.me/923460392313" target="_blank" rel="noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 14, color: 'var(--whatsapp)',
                fontWeight: 600,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                </svg>
                Chat on WhatsApp
              </a>
              <p style={{ fontSize: 13, color: 'var(--slate-500)' }}>
                Available 9am – 11pm PKT
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid var(--slate-800)' }}>
        <div className="container" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 'var(--space-3)',
          padding: 'var(--space-5) var(--space-4)',
        }}>
          <p style={{ fontSize: 13, color: 'var(--slate-500)' }}>
            © {year} E-Bazaar. All rights reserved.
          </p>
          <p style={{ fontSize: 13, color: 'var(--slate-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Made with ❤️ in Pakistan 🇵🇰
          </p>
        </div>
      </div>
    </footer>
  );
}
