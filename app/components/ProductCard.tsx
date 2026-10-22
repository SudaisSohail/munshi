'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '../context/CartContext';
import SellerBadge from './SellerBadge';

export interface Product {
  id: string;
  product_name: string;
  retail_price: number;
  quantity: number;
  description?: string;
  image_urls?: string[];
  category?: string;
  status?: string;
  sellers?: { store_name?: string; whatsapp_number?: string; contact_number?: string };
  created_at?: string;
}

interface ProductCardProps {
  product: Product;
  animationDelay?: number;
}

export default function ProductCard({ product, animationDelay = 0 }: ProductCardProps) {
  const { addItem } = useCart();
  const [imgError, setImgError] = useState(false);
  const [adding, setAdding] = useState(false);

  const imageUrl = !imgError && product.image_urls?.[0];
  const whatsappNum = (product.sellers?.contact_number || product.sellers?.whatsapp_number)?.replace(/\D/g, '');
  const whatsappUrl = whatsappNum
    ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi! I'm interested in "${product.product_name}" listed on E-Bazaar`)}`
    : null;

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAdding(true);
    addItem({
      id: product.id,
      product_name: product.product_name,
      retail_price: product.retail_price,
      image_urls: product.image_urls,
      quantity: product.quantity,
      sellers: product.sellers,
      cartQty: 1,
    });
    setTimeout(() => setAdding(false), 1200);
  }

  return (
    <div
      className="card animate-fadeInUp"
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'both' }}
    >
      {/* Image */}
      <Link href={`/products/${product.id}`} style={{ display: 'block', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', height: 200, background: 'var(--slate-100)', overflow: 'hidden' }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.product_name}
              onError={() => setImgError(true)}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.4s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.06)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: 'var(--slate-400)', gap: 8,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span style={{ fontSize: 11 }}>No image</span>
            </div>
          )}

          {/* Category badge overlay */}
          {product.category && (
            <span className="badge badge-primary" style={{
              position: 'absolute', top: 8, left: 8,
              backdropFilter: 'blur(8px)',
            }}>
              {product.category}
            </span>
          )}

          {/* Low stock */}
          {product.quantity <= 5 && product.quantity > 0 && (
            <span className="badge badge-warning" style={{ position: 'absolute', top: 8, right: 8 }}>
              Only {product.quantity} left
            </span>
          )}
        </div>
      </Link>

      {/* Content */}
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Link href={`/products/${product.id}`}>
          <h3 className="truncate-2" style={{
            fontSize: 14, fontWeight: 600, lineHeight: 1.4,
            color: 'var(--text)',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text)'; }}>
            {product.product_name}
          </h3>
        </Link>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
            Rs. {Number(product.retail_price).toLocaleString('en-US')}
          </span>
        </div>

        {/* Seller */}
        <SellerBadge storeName={product.sellers?.store_name} whatsappNumber={product.sellers?.whatsapp_number} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <button
            onClick={handleAddToCart}
            id={`add-to-cart-${product.id}`}
            className="btn btn-primary"
            style={{
              flex: 1, fontSize: 13, padding: '9px 14px',
              background: adding ? 'var(--success)' : 'var(--primary)',
              transition: 'background 0.3s ease, transform 0.1s ease',
            }}
          >
            {adding ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Added!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                Add to Cart
              </>
            )}
          </button>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              id={`whatsapp-${product.id}`}
              className="btn btn-whatsapp btn-icon"
              title="Chat with seller on WhatsApp"
              style={{ flexShrink: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                <path d="M16.5 14.5c-.28.78-1.4 1.43-2.28 1.62-.61.13-1.41.23-4.09-.88-2.44-1.01-4-3.49-4.12-3.65-.12-.16-.99-1.31-.99-2.5s.62-1.77.84-2.01c.22-.24.48-.3.64-.3l.46.01c.15 0 .34-.06.53.4.2.48.68 1.65.74 1.77.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.48.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.22 1.35z" fill="white"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
