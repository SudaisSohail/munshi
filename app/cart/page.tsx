'use client';

import Link from 'next/link';
import { useCart } from '../context/CartContext';

export default function CartPage() {
  const { items, removeItem, updateQty, totalPrice, totalItems, clearCart } = useCart();

  function buildWhatsAppMessage() {
    const lines = items.map(
      item => `• ${item.product_name} × ${item.cartQty} = Rs. ${(Number(item.retail_price) * item.cartQty).toLocaleString('en-US')}`
    );
    const total = `\n*Total: Rs. ${Number(totalPrice).toLocaleString('en-US')}*`;
    return encodeURIComponent(
      `Hi! I'd like to place an order from Munshi:\n\n${lines.join('\n')}${total}\n\nKindly confirm availability and payment details.`
    );
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 'var(--space-8) var(--space-4)' }}>
      <div className="container" style={{ maxWidth: 900 }}>
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <Link href="/products" style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, transition: 'color var(--transition-fast)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Continue Shopping
            </Link>
          </div>
          <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Your Cart
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </p>
        </div>

        {items.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: 'var(--space-20)', gap: 'var(--space-4)', textAlign: 'center',
          }}>
            <div style={{
              width: 88, height: 88, borderRadius: 'var(--radius-xl)',
              background: 'var(--primary-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 'var(--space-2)',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            </div>
            <h2 style={{ fontWeight: 800, fontSize: 22 }}>Your cart is empty</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 300 }}>Discover amazing products from Pakistani sellers</p>
            <Link href="/products" id="empty-cart-browse-btn" className="btn btn-primary btn-lg" style={{ marginTop: 'var(--space-2)' }}>
              Browse Products
            </Link>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 'var(--space-8)',
            alignItems: 'start',
          }} className="cart-grid">
            {/* Items column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Clear cart */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={clearCart}
                  id="clear-cart-btn"
                  style={{ fontSize: 13, color: 'var(--error)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', transition: 'background var(--transition-fast)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  Clear cart
                </button>
              </div>

              {items.map(item => {
                const whatsappNum = item.sellers?.whatsapp_number?.replace(/\D/g, '');
                const whatsappUrl = whatsappNum
                  ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Hi! I'm interested in "${item.product_name}" from Munshi. Is it still available?`)}`
                  : null;

                return (
                  <div key={item.id} className="card" style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
                    {/* Image */}
                    <Link href={`/products/${item.id}`} style={{ flexShrink: 0 }}>
                      <div style={{
                        width: 100, height: 100, borderRadius: 'var(--radius)',
                        overflow: 'hidden', background: 'var(--slate-100)',
                      }}>
                        {item.image_urls?.[0] ? (
                          <img src={item.image_urls[0]} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                        <Link href={`/products/${item.id}`} style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', lineHeight: 1.3 }} className="truncate-2">
                          {item.product_name}
                        </Link>
                        <button
                          onClick={() => removeItem(item.id)}
                          style={{ color: 'var(--slate-400)', flexShrink: 0, padding: 4, transition: 'color var(--transition-fast)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--slate-400)'; }}
                          aria-label="Remove"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>

                      {item.sellers?.store_name && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>by {item.sellers.store_name}</p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                        {/* Qty controls */}
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden', background: 'white',
                        }}>
                          <button onClick={() => updateQty(item.id, item.cartQty - 1)}
                            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--slate-600)' }}>−</button>
                          <span style={{ width: 36, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{item.cartQty}</span>
                          <button onClick={() => updateQty(item.id, item.cartQty + 1)}
                            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--slate-600)' }}>+</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>
                            Rs. {(Number(item.retail_price) * item.cartQty).toLocaleString('en-US')}
                          </span>
                          {item.cartQty > 1 && (
                            <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
                              Rs. {Number(item.retail_price).toLocaleString('en-US')} each
                            </span>
                          )}
                        </div>
                      </div>

                      {whatsappUrl && (
                        <a href={whatsappUrl} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--whatsapp-dark)', marginTop: 'var(--space-2)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
                          Ask seller
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary */}
            <div style={{ position: 'sticky', top: 80 }}>
              <div className="card" style={{ padding: 'var(--space-6)' }}>
                <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 'var(--space-5)' }}>Order Summary</h2>

                {/* Line items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
                  {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                      <span className="truncate-2" style={{ maxWidth: 180 }}>
                        {item.product_name} × {item.cartQty}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                        Rs. {(Number(item.retail_price) * item.cartQty).toLocaleString('en-US')}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="divider" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
                  <span style={{ fontWeight: 900, fontSize: 24, color: 'var(--primary)', letterSpacing: '-0.02em' }}>
                    Rs. {Number(totalPrice).toLocaleString('en-US')}
                  </span>
                </div>

                <a
                  href={`https://wa.me/923460392313?text=${buildWhatsAppMessage()}`}
                  target="_blank"
                  rel="noreferrer"
                  id="cart-page-checkout-btn"
                  className="btn btn-whatsapp"
                  style={{ width: '100%', fontSize: 15, padding: 14, borderRadius: 'var(--radius-md)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                  </svg>
                  Complete Order via WhatsApp
                </a>

                <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
                  Your order will be sent as a WhatsApp message. Sellers will confirm availability.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .cart-grid {
          grid-template-columns: 1fr 340px;
        }
        @media (max-width: 768px) {
          .cart-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
