'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import ProductGrid from '../components/ProductGrid';
import LoadingSkeleton from '../components/LoadingSkeleton';
import CategoryBar from '../components/CategoryBar';
import SearchBar from '../components/SearchBar';
import { Product } from '../components/ProductCard';

const KNOWN_CATEGORIES = [
  'Fashion', 'Electronics', 'Home & Living', 'Groceries',
  'Beauty', 'Toys', 'Sports', 'Books',
];

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'created_at:desc' },
  { label: 'Price: Low to High', value: 'retail_price:asc' },
  { label: 'Price: High to Low', value: 'retail_price:desc' },
];

export default function ProductsContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const categoryParam = searchParams.get('category') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(categoryParam);
  const [sort, setSort] = useState('created_at:desc');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select('*, sellers(store_name, whatsapp_number)');

    if (searchQuery) {
      query = query.ilike('product_name', `%${searchQuery}%`);
    }
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    const [col, dir] = sort.split(':');
    query = query.order(col, { ascending: dir === 'asc' });

    const { data, error } = await query;
    if (!error && data) setProducts(data as Product[]);
    setLoading(false);
  }, [searchQuery, category, sort]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { setCategory(categoryParam); }, [categoryParam]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: 'var(--space-8) var(--space-4) var(--space-5)',
      }}>
        <div className="container">
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
              {searchQuery ? `Results for "${searchQuery}"` : category ? `${category} Products` : 'All Products'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              {loading ? 'Loading...' : `${products.length} product${products.length !== 1 ? 's' : ''} found`}
            </p>
          </div>

          {/* Search */}
          <div style={{ maxWidth: 480, marginBottom: 'var(--space-5)' }}>
            <SearchBar initialValue={searchQuery} />
          </div>

          {/* Category filter */}
          <CategoryBar
            categories={KNOWN_CATEGORIES}
            selected={category}
            onSelect={setCategory}
          />
        </div>
      </div>

      {/* Content */}
      <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
        {/* Sort + count bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)',
        }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {!loading && `Showing ${products.length} products`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Sort:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              id="products-sort-select"
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--radius)',
                border: '1.5px solid var(--border)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
                background: 'white',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? <LoadingSkeleton count={8} /> : (
          <ProductGrid
            products={products}
            emptyMessage={
              searchQuery
                ? `No products matching "${searchQuery}". Try a different keyword.`
                : category
                ? `No products in "${category}" yet — add yours via WhatsApp!`
                : 'No products listed yet — be the first!'
            }
          />
        )}
      </div>
    </div>
  );
}
