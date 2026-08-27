'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProducts() {
            const { data, error } = await supabase
                .from('products')
                .select('*, sellers(store_name, whatsapp_number)')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch products:', error);
            } else {
                setProducts(data);
            }
            setLoading(false);
        }
        fetchProducts();
    }, []);

    if (loading) return <p style={{ padding: 24 }}>Loading products...</p>;

    return (
        <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
            <h1 style={{ marginBottom: 24 }}>Munshi Storefront</h1>
            {products.length === 0 && <p>No products listed yet — go add one via WhatsApp!</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {products.map((product: any) => (
                    <div key={product.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                        {product.image_urls?.[0] && (
                            <img
                                src={product.image_urls[0]}
                                alt={product.product_name}
                                style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 4 }}
                            />
                        )}
                        <h3 style={{ margin: '8px 0 4px' }}>{product.product_name}</h3>
                        <p style={{ margin: '2px 0', fontWeight: 'bold' }}>Rs. {product.retail_price}</p>
                        <p style={{ margin: '2px 0', fontSize: 14, color: '#666' }}>Qty: {product.quantity}</p>
                        <p style={{ margin: '4px 0', fontSize: 13 }}>{product.description}</p>
                        <p style={{ margin: '4px 0', fontSize: 12, color: '#888' }}>
                            Seller: {product.sellers?.store_name || product.sellers?.whatsapp_number}
                        </p>
                    </div>
                ))}
            </div>
        </main>
    );
}