'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

interface SearchBarProps {
  onSearch?: () => void;
  initialValue?: string;
}

export default function SearchBar({ onSearch, initialValue = '' }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      router.push(`/products?search=${encodeURIComponent(value.trim())}`);
      onSearch?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', width: '100%' }}>
      <svg
        width="16" height="16"
        viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" strokeWidth="2.5"
        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search products, sellers..."
        className="input"
        id="product-search-input"
        style={{
          paddingLeft: 38,
          paddingRight: value ? 40 : 14,
          height: 40,
          fontSize: 14,
          background: 'var(--slate-50)',
          borderColor: 'var(--border)',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); inputRef.current?.focus(); }}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--slate-400)', transition: 'color var(--transition-fast)',
          }}
          aria-label="Clear search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </form>
  );
}
