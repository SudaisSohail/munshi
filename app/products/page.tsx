import { Suspense } from 'react';
import ProductsContent from './ProductsContent';
import LoadingSkeleton from '../components/LoadingSkeleton';

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: 'var(--space-8) var(--space-4)' }}>
          <div className="container">
            <div className="skeleton" style={{ height: 30, width: 240, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 20 }} />
            <div className="skeleton" style={{ height: 40, width: 480, maxWidth: '100%', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({length: 5}).map((_,i) => (
                <div key={i} className="skeleton" style={{ height: 36, width: 100, borderRadius: 999 }} />
              ))}
            </div>
          </div>
        </div>
        <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <LoadingSkeleton count={8} />
        </div>
      </div>
    }>
      <ProductsContent />
    </Suspense>
  );
}
