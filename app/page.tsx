'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import ProductGrid from './components/ProductGrid';
import LoadingSkeleton from './components/LoadingSkeleton';
import { Product } from './components/ProductCard';


const CATEGORIES = [
  { label: 'Fashion', emoji: '👗' },
  { label: 'Electronics', emoji: '📱' },
  { label: 'Home & Living', emoji: '🏠' },
  { label: 'Groceries', emoji: '🛒' },
  { label: 'Beauty', emoji: '💄' },
  { label: 'Toys', emoji: '🧸' },
  { label: 'Sports', emoji: '⚽' },
  { label: 'Books', emoji: '📚' },
];

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*, sellers(store_name, whatsapp_number, contact_number)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(8);
      if (!error && data) setProducts(data as Product[]);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  return (
    <>
      {/* ── HERO ── */}
      <section style={{
        background: 'linear-gradient(135deg, #FF6B1A 0%, #F85606 30%, #E04400 60%, #FF8C00 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradientShift 8s ease infinite',
        color: 'white',
        padding: 'var(--space-20) var(--space-4)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Decorative blobs */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 400, height: 400, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, left: -60,
          width: 350, height: 350, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          pointerEvents: 'none',
        }} />

        <div className="container" style={{ position: 'relative' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'var(--space-8)',
            alignItems: 'center',
          }} className="hero-grid">
            {/* Text */}
            <div style={{ maxWidth: 640 }}>
              <div className="badge" style={{
                background: 'rgba(255,255,255,0.18)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(10px)',
                marginBottom: 'var(--space-5)',
                fontSize: 13,
              }}>
                🇵🇰 Made for Pakistan — Sell in Urdu or English
              </div>

              <h1 style={{
                fontSize: 'clamp(32px, 5vw, 60px)',
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                marginBottom: 'var(--space-5)',
              }}>
                Sell Anything on<br />
                <span style={{
                  background: 'rgba(255,255,255,0.25)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'brightness(1.3)',
                }}>WhatsApp</span>
                {' '}in Minutes
              </h1>

              <p style={{ fontSize: 18, lineHeight: 1.7, opacity: 0.9, marginBottom: 'var(--space-8)' }}>
                Just send a voice message — Munshi&apos;s AI automatically lists your products on a beautiful storefront. No tech skills needed.
              </p>

              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <a
                  href="https://wa.me/923460392313?text=Assalam%20o%20Alaikum!%20I%20want%20to%20list%20my%20products%20on%20E-Bazaar"
                  target="_blank"
                  rel="noreferrer"
                  id="hero-sell-btn"
                  className="btn btn-xl"
                  style={{
                    background: 'white',
                    color: 'var(--primary)',
                    fontWeight: 800,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.20)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--whatsapp)">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                  </svg>
                  Start Selling Now
                </a>
                <Link href="/products" id="hero-browse-btn" className="btn btn-xl" style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  border: '2px solid rgba(255,255,255,0.35)',
                  backdropFilter: 'blur(8px)',
                }}>
                  Browse Products →
                </Link>
              </div>

              {/* Social proof */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-8)', flexWrap: 'wrap' }}>
                {[
                  { num: '10K+', label: 'Happy Sellers' },
                  { num: '50K+', label: 'Products Listed' },
                  { num: '100%', label: 'Free to Use' },
                ].map(({ num, label }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{num}</div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero visual */}
            <div className="hero-visual animate-float" style={{
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6)',
              width: 280,
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 'var(--space-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Live on E-Bazaar
              </div>
              {/* Fake product preview */}
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 'var(--space-3)' }}>
                <div style={{ height: 140, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                  👗
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Embroidered Kameez</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'rgba(255,200,50,1)' }}>Rs. 2,500</div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>by Fatima&apos;s Boutique</div>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, textAlign: 'center' }}>
                ✨ Listed via voice message in 30 seconds
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .hero-grid { grid-template-columns: 1fr !important; }
            .hero-visual { display: none !important; }
          }
        `}</style>
      </section>

      {/* ── CATEGORIES STRIP ── */}
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ padding: 'var(--space-5) var(--space-4)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 'max-content' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>Shop by:</span>
            {CATEGORIES.map(({ label, emoji }) => (
              <Link
                key={label}
                href={`/products?category=${encodeURIComponent(label)}`}
                id={`category-link-${label.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--slate-50)',
                  border: '1.5px solid var(--border)',
                  fontSize: 13, fontWeight: 500, color: 'var(--text)',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.color = 'var(--primary)';
                  e.currentTarget.style.background = 'var(--primary-50)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text)';
                  e.currentTarget.style.background = 'var(--slate-50)';
                }}
              >
                <span>{emoji}</span>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>


      {/* ── FEATURED PRODUCTS ── */}
      <section className="section">
        <div className="container">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 'var(--space-8)', flexWrap: 'wrap', gap: 'var(--space-3)',
          }}>
            <div>
              <div className="badge badge-primary" style={{ marginBottom: 'var(--space-2)' }}>Fresh Listings</div>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                Latest Products
              </h2>
            </div>
            <Link href="/products" className="btn btn-outline">
              View All
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          {loading ? (
            <LoadingSkeleton count={8} />
          ) : (
            <ProductGrid
              products={products}
              emptyMessage="No products yet — be the first to list one via WhatsApp!"
              showViewAll={products.length >= 8}
            />
          )}
        </div>
      </section>

      {/* ── SELLER CTA BANNER ── */}
      <section style={{
        background: 'linear-gradient(135deg, var(--slate-900) 0%, var(--slate-800) 100%)',
        color: 'white',
        padding: 'var(--space-16) var(--space-4)',
      }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-5)' }}>🚀</div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 'var(--space-4)' }}>
            Ready to Start Selling?
          </h2>
          <p style={{ fontSize: 17, color: 'var(--slate-400)', marginBottom: 'var(--space-8)', maxWidth: 480, margin: '0 auto var(--space-8)' }}>
            Join thousands of Pakistani sellers already earning on E-Bazaar. It&apos;s 100% free.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="https://wa.me/923460392313?text=Assalam%20o%20Alaikum!%20I%20want%20to%20list%20my%20products%20on%20E-Bazaar"
              target="_blank"
              rel="noreferrer"
              id="cta-sell-btn"
              className="btn btn-whatsapp btn-xl"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
              </svg>
              Start on WhatsApp — Free
            </a>
            <Link href="/seller" id="cta-dashboard-btn" className="btn btn-xl" style={{
              background: 'rgba(255,255,255,0.10)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.2)',
            }}>
              View Seller Dashboard
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}