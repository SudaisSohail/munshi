'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '../context/CartContext';
import SearchBar from './SearchBar';

export default function Navbar() {
  const { totalItems, toggleCart } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: scrolled ? 'rgba(255,255,255,0.95)' : 'white',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: '1px solid var(--border)',
          boxShadow: scrolled ? 'var(--shadow)' : 'none',
          transition: 'all var(--transition)',
        }}
      >
        <div className="container" style={{ display: 'flex', alignItems: 'center', height: 64, gap: 'var(--space-4)' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, textDecoration: 'none' }}>
            <div style={{
              width: 36, height: 36,
              background: 'var(--primary)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(248,86,6,0.30)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="white" opacity="0.9"/>
                <path d="M16.5 14.5c-.28.78-1.4 1.43-2.28 1.62-.61.13-1.41.23-4.09-.88-2.44-1.01-4-3.49-4.12-3.65-.12-.16-.99-1.31-.99-2.5s.62-1.77.84-2.01c.22-.24.48-.3.64-.3l.46.01c.15 0 .34-.06.53.4.2.48.68 1.65.74 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.48.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.22 1.35z" fill="white"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--slate-900)', letterSpacing: '-0.02em' }}>
              munshi
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-4)', flexShrink: 0 }} className="desktop-nav">
            <Link href="/" className="nav-link">Home</Link>
            <Link href="/products" className="nav-link">Browse</Link>
            <Link href="/seller" className="nav-link">Sell</Link>
          </nav>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: 420 }} className="desktop-search">
            <SearchBar />
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
            {/* Sell CTA */}
            <Link href="/seller" className="btn btn-outline btn-sm desktop-sell-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Sell Now
            </Link>

            {/* Cart button */}
            <button
              onClick={toggleCart}
              id="cart-toggle-btn"
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42,
                borderRadius: 'var(--radius)',
                background: totalItems > 0 ? 'var(--primary-50)' : 'var(--slate-50)',
                border: '1.5px solid',
                borderColor: totalItems > 0 ? 'var(--primary-100)' : 'var(--border)',
                transition: 'all var(--transition-fast)',
              }}
              aria-label={`Cart — ${totalItems} items`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={totalItems > 0 ? 'var(--primary)' : 'var(--slate-600)'} strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              {totalItems > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -6, right: -6,
                  minWidth: 18, height: 18,
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                  border: '2px solid white',
                  animation: 'bounceIn 0.3s ease',
                }}>
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="mobile-menu-btn"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42,
                borderRadius: 'var(--radius)',
                background: 'var(--slate-50)',
                border: '1.5px solid var(--border)',
              }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <>
          <div className="backdrop" style={{ zIndex: 45 }} onClick={() => setMobileOpen(false)} />
          <div className="mobile-menu animate-fadeInDown">
            <div style={{ padding: 'var(--space-4)' }}>
              <SearchBar onSearch={() => setMobileOpen(false)} />
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', padding: '0 var(--space-4) var(--space-4)' }}>
              <Link href="/" onClick={() => setMobileOpen(false)} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 16 }}>Home</Link>
              <Link href="/products" onClick={() => setMobileOpen(false)} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 16 }}>Browse Products</Link>
              <Link href="/seller" onClick={() => setMobileOpen(false)} style={{ padding: '12px 0', fontWeight: 600, fontSize: 16 }}>Sell on Munshi</Link>
            </nav>
          </div>
        </>
      )}

      <style>{`
        .nav-link {
          padding: 7px 12px;
          border-radius: var(--radius-sm);
          font-size: 14px;
          font-weight: 500;
          color: var(--slate-700);
          transition: all var(--transition-fast);
        }
        .nav-link:hover {
          color: var(--primary);
          background: var(--primary-50);
        }
        .desktop-nav { display: flex; }
        .desktop-search { display: flex; }
        .desktop-sell-btn { display: inline-flex; }
        .mobile-menu-btn { display: none; }
        .mobile-menu {
          position: fixed;
          top: 64px;
          left: 0; right: 0;
          background: white;
          border-bottom: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
          z-index: 48;
        }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .desktop-search { display: none !important; }
          .desktop-sell-btn { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
