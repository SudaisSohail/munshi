'use client';

import { useCart } from '../context/CartContext';
import Link from 'next/link';

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQty, totalPrice, totalItems } = useCart();

  function buildWhatsAppMessage() {
    const lines = items.map(
      item => `• ${item.product_name} × ${item.cartQty} = Rs. ${(Number(item.retail_price) * item.cartQty).toLocaleString('en-US')}`
    );
    const total = `\n*Total: Rs. ${Number(totalPrice).toLocaleString('en-US')}*`;
    return encodeURIComponent(
      `Hi! I'd like to order from Munshi:\n\n${lines.join('\n')}${total}\n\nPlease confirm availability.`
    );
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="backdrop" style={{ zIndex: 55 }} onClick={closeCart} />

      {/* Drawer */}
      <aside
        className="animate-slideInRight"
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          zIndex: 56,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
        }}
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>Your Cart</h2>
            {totalItems > 0 && (
              <span className="badge badge-primary">{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
            )}
          </div>
          <button
            onClick={closeCart}
            id="cart-close-btn"
            style={{
              width: 36, height: 36, borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--slate-100)', color: 'var(--slate-600)',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--slate-200)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--slate-100)'; }}
            aria-label="Close cart"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
          {items.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 'var(--space-4)', padding: 'var(--space-8)',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 'var(--radius-xl)',
                background: 'var(--primary-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Your cart is empty</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add products to start shopping</p>
              </div>
              <Link href="/products" onClick={closeCart} className="btn btn-primary">
                Browse Products
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingTop: 'var(--space-2)' }}>
              {items.map(item => (
                <div key={item.id} style={{
                  display: 'flex', gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--slate-50)',
                  animation: 'fadeInUp 0.3s ease',
                }}>
                  {/* Image */}
                  <div style={{
                    width: 64, height: 64, borderRadius: 'var(--radius-sm)',
                    background: 'var(--slate-200)', overflow: 'hidden', flexShrink: 0,
                  }}>
                    {item.image_urls?.[0] ? (
                      <img src={item.image_urls[0]} alt={item.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }} className="truncate-2">
                      {item.product_name}
                    </p>
                    <p style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                      Rs. {(Number(item.retail_price) * item.cartQty).toLocaleString('en-US')}
                    </p>

                    {/* Qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <button
                        onClick={() => updateQty(item.id, item.cartQty - 1)}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          border: '1.5px solid var(--border)', background: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, color: 'var(--slate-600)',
                          transition: 'all var(--transition-fast)',
                        }}
                        aria-label="Decrease quantity"
                      >−</button>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>
                        {item.cartQty}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, item.cartQty + 1)}
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          border: '1.5px solid var(--border)', background: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, color: 'var(--slate-600)',
                          transition: 'all var(--transition-fast)',
                        }}
                        aria-label="Increase quantity"
                      >+</button>

                      <button
                        onClick={() => removeItem(item.id)}
                        style={{ marginLeft: 'auto', color: 'var(--error)', padding: 4 }}
                        aria-label="Remove item"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: 'var(--space-5) var(--space-6)',
            background: 'var(--surface)',
          }}>
            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--primary)' }}>
                Rs. {Number(totalPrice).toLocaleString('en-US')}
              </span>
            </div>

            {/* Checkout via WhatsApp */}
            <a
              href={`https://wa.me/923460392313?text=${buildWhatsAppMessage()}`}
              target="_blank"
              rel="noreferrer"
              id="checkout-whatsapp-btn"
              className="btn btn-whatsapp"
              style={{ width: '100%', fontSize: 15, padding: 14, borderRadius: 'var(--radius-md)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l5.09-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
              Order via WhatsApp
            </a>

            <Link href="/cart" onClick={closeCart} style={{
              display: 'block', textAlign: 'center',
              fontSize: 13, color: 'var(--text-muted)',
              marginTop: 'var(--space-3)',
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}>
              View full cart →
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
