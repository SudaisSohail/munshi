'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import ProductGrid from '../components/ProductGrid';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { Product } from '../components/ProductCard';

const WHATSAPP_NUMBER = '923460392313';
const WHATSAPP_SELL_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Assalam o Alaikum! Main E-Bazaar pe apna product list karna chahta hun\n\nI want to list my product on E-Bazaar.')}`;

function SellerContent() {
  const searchParams = useSearchParams();
  const sellerParam = searchParams.get('seller') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sellerParam) return;
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select('*, sellers(store_name, whatsapp_number, contact_number)')
        .eq('sellers.whatsapp_number', sellerParam)
        .order('created_at', { ascending: false });
      if (data) setProducts(data as Product[]);
      setLoading(false);
    }
    fetch();
  }, [sellerParam]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--slate-900) 0%, #1E1B4B 100%)',
        color: 'white',
        padding: 'var(--space-16) var(--space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(248,86,6,0.12)', pointerEvents: 'none',
        }} />
        <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>🏪</div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 'var(--space-3)' }}>
            Seller Dashboard
          </h1>
          <p style={{ fontSize: 16, color: 'var(--slate-400)', maxWidth: 480, margin: '0 auto var(--space-8)' }}>
            Manage your listings and reach thousands of buyers — all through WhatsApp.
          </p>
          <a
            href={WHATSAPP_SELL_URL}
            target="_blank"
            rel="noreferrer"
            id="seller-start-whatsapp-btn"
            className="btn btn-whatsapp btn-xl"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
            </svg>
            List a Product on WhatsApp
          </a>
        </div>
      </div>

      <div className="container" style={{ padding: 'var(--space-10) var(--space-4)' }}>
        {/* How to sell grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-12)',
        }}>
          {[
            {
              icon: '🎙️',
              title: 'Voice Message',
              desc: 'Send a voice note describing your product — name, price, condition. In Urdu or English.',
              step: '1',
            },
            {
              icon: '📸',
              title: 'Send Photos',
              desc: 'Share product photos on WhatsApp. Our AI extracts the details and creates the listing.',
              step: '2',
            },
            {
              icon: '✅',
              title: 'Go Live Instantly',
              desc: 'Your product appears on E-Bazaar storefront within minutes. Buyers will find and contact you.',
              step: '3',
            },
            {
              icon: '💸',
              title: 'Earn on Your Terms',
              desc: 'Buyers contact you directly on WhatsApp. You negotiate and close deals your way.',
              step: '4',
            },
          ].map(({ icon, title, desc, step }) => (
            <div key={step} style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-6)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -8, right: 12,
                fontSize: 60, fontWeight: 900, color: 'var(--primary)',
                opacity: 0.06, lineHeight: 1,
              }}>{step}</div>
              <div style={{ fontSize: 32, marginBottom: 'var(--space-3)' }}>{icon}</div>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>{title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-12)',
        }}>
          {[
            { num: '10,000+', label: 'Active Sellers', emoji: '👥' },
            { num: '50,000+', label: 'Products Listed', emoji: '📦' },
            { num: 'Free', label: 'Forever', emoji: '🎉' },
            { num: '< 30s', label: 'Time to List', emoji: '⚡' },
          ].map(({ num, label, emoji }) => (
            <div key={label} style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{emoji}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.02em' }}>{num}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Seller products section (if seller param provided) */}
        {sellerParam && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 'var(--space-6)' }}>
              Your Listings
            </h2>
            {loading ? <LoadingSkeleton count={4} /> : (
              <ProductGrid
                products={products}
                emptyMessage="No products found for this seller. Start listing via WhatsApp!"
              />
            )}
          </div>
        )}

        {/* CTA */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary-50) 0%, var(--primary-100) 100%)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-10)',
          textAlign: 'center',
          border: '1px solid var(--primary-100)',
          marginTop: 'var(--space-12)',
        }}>
          <div style={{ fontSize: 42, marginBottom: 'var(--space-4)' }}>📱</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 'var(--space-3)', letterSpacing: '-0.02em' }}>
            Start Listing in 30 Seconds
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)', maxWidth: 400, margin: '0 auto var(--space-6)' }}>
            Message Munshi on WhatsApp, describe your product, and watch it go live on the storefront instantly.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={WHATSAPP_SELL_URL} target="_blank" rel="noreferrer" id="seller-cta-whatsapp-btn" className="btn btn-whatsapp btn-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
              Open WhatsApp
            </a>
            <Link href="/products" id="seller-browse-btn" className="btn btn-outline btn-lg">
              Browse the Marketplace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SellerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>Loading dashboard...</div>}>
      <SellerContent />
    </Suspense>
  );
}
