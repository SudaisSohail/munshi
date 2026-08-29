interface CategoryBarProps {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}

export default function CategoryBar({ categories, selected, onSelect }: CategoryBarProps) {
  const all = ['All', ...categories];

  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      overflowX: 'auto',
      paddingBottom: 4,
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {all.map(cat => {
        const active = cat === selected || (cat === 'All' && !selected);
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat === 'All' ? '' : cat)}
            id={`category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
            style={{
              flexShrink: 0,
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              border: '1.5px solid',
              borderColor: active ? 'var(--primary)' : 'var(--border)',
              background: active ? 'var(--primary)' : 'var(--surface)',
              color: active ? 'white' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--primary)';
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
