export default function LoadingSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ overflow: 'hidden', animationDelay: `${i * 50}ms` }}>
          {/* Image */}
          <div className="skeleton" style={{ height: 200 }} />
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {/* Title */}
            <div className="skeleton" style={{ height: 14, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 4 }} />
            {/* Price */}
            <div className="skeleton" style={{ height: 20, width: '45%', borderRadius: 4, marginTop: 4 }} />
            {/* Seller */}
            <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4 }} />
            {/* Button */}
            <div className="skeleton" style={{ height: 38, borderRadius: 8, marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
