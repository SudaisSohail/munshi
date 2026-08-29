import ProductCard, { Product } from './ProductCard';
import Link from 'next/link';

interface ProductGridProps {
  products: Product[];
  emptyMessage?: string;
  showViewAll?: boolean;
}

export default function ProductGrid({ products, emptyMessage, showViewAll }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'var(--space-20) var(--space-4)',
        gap: 'var(--space-4)',
        animation: 'fadeIn 0.4s ease',
      }}>
        <div style={{
          width: 80, height: 80,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--primary-50)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>No products found</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 300 }}>
          {emptyMessage || 'Try a different search or category filter.'}
        </p>
        <Link href="/products" className="btn btn-outline">Browse All Products</Link>
      </div>
    );
  }

  return (
    <>
      <div className="product-grid">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} animationDelay={i * 40} />
        ))}
      </div>

      {showViewAll && (
        <div style={{ textAlign: 'center', marginTop: 'var(--space-10)' }}>
          <Link href="/products" className="btn btn-outline btn-lg">
            View All Products
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
      )}
    </>
  );
}
