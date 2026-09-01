'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useCart } from '../../context/CartContext';
import SellerBadge from '../../components/SellerBadge';
import ProductGrid from '../../components/ProductGrid';
import { Product } from '../../components/ProductCard';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { addItem, openCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [adding, setAdding] = useState(false);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('products')
        .select('*, sellers(store_name, whatsapp_number)')
        .eq('id', id)
        .single();

      if (!data) { setLoading(false); return; }
      setProduct(data as Product);

      // Fetch related products (same seller)
      if (data.sellers) {
        const { data: rel } = await supabase
          .from('products')
          .select('*, sellers(store_name, whatsapp_number)')
          .neq('id', id)
          .limit(4);
        if (rel) setRelated(rel as Product[]);
      }
      setLoading(false);
    }
    fetch();
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-16)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        Loading product...
      </div>
    );
  }

  if (!product) return notFound();

  const images = product.image_urls?.length ? product.image_urls : [];
  const whatsappNum = product.sellers?.whatsapp_number?.replace(/\D/g, '');
  const whatsappUrl = whatsappNum
    ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi! I'm interested in "${product.product_name}" listed on E-Bazaar. Is it available? 🛒`)}`
    : null;

  function handleAddToCart() {
    setAdding(true);
    for (let i = 0; i < qty; i++) {
      addItem({
        id: product!.id,
        product_name: product!.product_name,
        retail_price: product!.retail_price,
        image_urls: product!.image_urls,
        quantity: product!.quantity,
        sellers: product!.sellers,
        cartQty: 1,
      });
    }
    setTimeout(() => { setAdding(false); openCart(); }, 800);
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Breadcrumb */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ padding: '12px var(--space-4)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', transition: 'color var(--transition-fast)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}>
            Home
          </Link>
          <span>›</span>
          <Link href="/products" style={{ color: 'var(--text-muted)', transition: 'color var(--transition-fast)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}>
            Products
          </Link>
          <span>›</span>
          <span style={{ color: 'var(--text)', fontWeight: 500 }} className="truncate-2">{product.product_name}</span>
        </div>
      </div>

      <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-10)',
          alignItems: 'start',
        }} className="product-detail-grid">

          {/* ── IMAGE GALLERY ── */}
          <div style={{ position: 'sticky', top: 80 }}>
            {/* Main image */}
            <div style={{
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: 'white',
              border: '1px solid var(--border)',
              aspectRatio: '1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 'var(--space-3)',
            }}>
              {images[activeImg] ? (
                <img
                  src={images[activeImg]}
                  alt={product.product_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.3s ease' }}
                  key={activeImg}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--slate-400)' }}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span style={{ fontSize: 14 }}>No image available</span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    style={{
                      width: 72, height: 72, flexShrink: 0,
                      borderRadius: 'var(--radius)',
                      overflow: 'hidden',
                      border: `2px solid ${i === activeImg ? 'var(--primary)' : 'var(--border)'}`,
                      transition: 'border-color var(--transition-fast)',
                    }}
                    aria-label={`View image ${i + 1}`}
                  >
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── PRODUCT INFO ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Category */}
            {product.category && (
              <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="badge badge-primary" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
                {product.category}
              </Link>
            )}

            <div>
              <h1 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 'var(--space-3)' }}>
                {product.product_name}
              </h1>
              <SellerBadge size="md" storeName={product.sellers?.store_name} whatsappNumber={product.sellers?.whatsapp_number} />
            </div>

            {/* Price & stock */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
              padding: 'var(--space-5)',
              background: 'var(--primary-50)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--primary-100)',
            }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Price</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.03em' }}>
                  Rs. {Number(product.retail_price).toLocaleString('en-US')}
                </div>
              </div>
              {product.quantity > 0 ? (
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>In Stock</div>
                  <div className={`badge ${product.quantity <= 5 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: 13 }}>
                    {product.quantity <= 5 ? `Only ${product.quantity} left!` : `${product.quantity} available`}
                  </div>
                </div>
              ) : (
                <div className="badge" style={{ marginLeft: 'auto', background: '#FEF2F2', color: 'var(--error)' }}>
                  Out of Stock
                </div>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 'var(--space-2)' }}>About this product</h2>
                <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                  {product.description}
                </p>
              </div>
            )}

            {/* Quantity picker */}
            {product.quantity > 0 && (
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 'var(--space-2)' }}>Quantity</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    background: 'white',
                  }}>
                    <button
                      onClick={() => setQty(q => Math.max(1, q - 1))}
                      style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--slate-600)', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--slate-50)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                      aria-label="Decrease"
                    >−</button>
                    <span style={{ width: 44, textAlign: 'center', fontWeight: 700, fontSize: 16 }}>{qty}</span>
                    <button
                      onClick={() => setQty(q => Math.min(product.quantity, q + 1))}
                      style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--slate-600)', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--slate-50)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                      aria-label="Increase"
                    >+</button>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Total: <strong style={{ color: 'var(--primary)' }}>Rs. {(Number(product.retail_price) * qty).toLocaleString('en-US')}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* CTA Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button
                onClick={handleAddToCart}
                disabled={product.quantity === 0}
                id={`detail-add-cart-${product.id}`}
                className="btn btn-primary btn-xl"
                style={{
                  width: '100%',
                  background: adding ? 'var(--success)' : product.quantity === 0 ? 'var(--slate-300)' : 'var(--primary)',
                  cursor: product.quantity === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                }}
              >
                {adding ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Added to Cart!
                  </>
                ) : product.quantity === 0 ? 'Out of Stock' : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
                    </svg>
                    Add to Cart — Rs. {(Number(product.retail_price) * qty).toLocaleString('en-US')}
                  </>
                )}
              </button>

              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  id={`detail-whatsapp-${product.id}`}
                  className="btn btn-whatsapp btn-xl"
                  style={{ width: '100%' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                    <path d="M16.5 14.5c-.28.78-1.4 1.43-2.28 1.62-.61.13-1.41.23-4.09-.88-2.44-1.01-4-3.49-4.12-3.65-.12-.16-.99-1.31-.99-2.5s.62-1.77.84-2.01c.22-.24.48-.3.64-.3l.46.01c.15 0 .34-.06.53.4.2.48.68 1.65.74 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.48.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.22 1.35z" fill="white"/>
                  </svg>
                  Chat with Seller on WhatsApp
                </a>
              )}
            </div>

            {/* Trust signals */}
            <div style={{
              display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap',
              padding: 'var(--space-4)',
              background: 'var(--slate-50)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}>
              {[
                { icon: '🔒', text: 'Secure Shopping' },
                { icon: '💬', text: 'WhatsApp Support' },
                { icon: '🇵🇰', text: 'Local Sellers' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RELATED PRODUCTS ── */}
        {related.length > 0 && (
          <div style={{ marginTop: 'var(--space-16)' }}>
            <div className="divider" />
            <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 'var(--space-6)' }}>
              More Products
            </h2>
            <ProductGrid products={related} />
          </div>
        )}
      </div>

      <style>{`
        .product-detail-grid {
          grid-template-columns: 1fr 1fr;
        }
        @media (max-width: 768px) {
          .product-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
