"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  image: string;
  category: string;
  rating: number;
}

const ALL_PRODUCTS: Product[] = [
  {
    id: '1',
    name: '高效止咳化痰藥水',
    price: 285,
    originalPrice: 380,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    category: '止咳藥',
    rating: 4.8
  },
  {
    id: '2',
    name: '寶寶防護濕疹膏',
    price: 185,
    originalPrice: 250,
    image: 'https://images.unsplash.com/photo-1626716493137-b67fe9501e76?auto=format&fit=crop&w=400&q=80',
    category: '外用藥',
    rating: 4.7
  },
  {
    id: '3',
    name: '強效消炎止痛噴霧',
    price: 125,
    originalPrice: 160,
    image: 'https://images.unsplash.com/photo-1607619056574-7b891ee58ac3?auto=format&fit=crop&w=400&q=80',
    category: '止痛藥',
    rating: 4.9
  },
  {
    id: '4',
    name: '維生素C補充液',
    price: 95,
    originalPrice: 120,
    image: 'https://images.unsplash.com/photo-1579722820308-d74e5719bc5a?auto=format&fit=crop&w=400&q=80',
    category: '保健品',
    rating: 4.6
  },
  {
    id: '5',
    name: '蜂蜜潤喉糖',
    price: 45,
    originalPrice: 60,
    image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80',
    category: '止咳藥',
    rating: 4.5
  },
  {
    id: '6',
    name: '成人綜合維他命',
    price: 450,
    originalPrice: 580,
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80',
    category: '保健品',
    rating: 4.8
  }
];

export default function ProductsPage() {
  const [filter, setFilter] = useState('全部');
  const [cartItems, setCartItems] = useState<{id: string, name: string, price: number, quantity: number, image: string}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  const categories = ['全部', '止咳藥', '外用藥', '止痛藥', '保健品'];

  const filteredProducts = filter === '全部' 
    ? ALL_PRODUCTS 
    : ALL_PRODUCTS.filter(p => p.category === filter);

  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitle}>
            <h1>藥品商城</h1>
            <p className={styles.desktopOnly}>優質醫藥，守護健康</p>
          </div>
          <Link href="/products/add" className={`${styles.addButton} ${styles.desktopOnly}`}>
            + 新增商品
          </Link>
        </div>
        <div className={styles.searchBar}>
          <input type="text" placeholder="搜尋藥品、症狀或關鍵字..." className={styles.searchInput} />
          <button className={styles.searchBtn}>🔍</button>
        </div>
      </header>

      <section className={styles.filterSection}>
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`${styles.filterBtn} ${filter === cat ? styles.active : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </section>

      <div className={styles.productGrid}>
        {filteredProducts.map(product => (
          <div key={product.id} className={styles.productCard}>
            <Link href={`/medicine-product`} className={styles.imageLink}>
              <div className={styles.productImage}>
                <img src={product.image} alt={product.name} />
                <span className={styles.categoryTag}>{product.category}</span>
              </div>
            </Link>
            <div className={styles.productInfo}>
              <Link href={`/medicine-product`}>
                <h3>{product.name}</h3>
              </Link>
              <div className={styles.rating}>
                <span className={styles.stars}>{"★".repeat(Math.floor(product.rating))}</span>
                <span className={styles.ratingValue}>{product.rating}</span>
              </div>
              <div className={styles.priceRow}>
                <div className={styles.priceValues}>
                  <span className={styles.currentPrice}>NT${product.price}</span>
                  <span className={styles.originalPrice}>NT${product.originalPrice}</span>
                </div>
                <button 
                  className={styles.quickAddBtn}
                  onClick={(e) => {
                    e.preventDefault();
                    addToCart(product);
                  }}
                  title="加入購物車"
                >
                  +
                </button>
              </div>
              <button 
                className={`${styles.addToCartBtn} ${styles.desktopOnly}`}
                onClick={() => addToCart(product)}
              >
                加入購物車
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Shopping Cart Drawer */}
      {isCartOpen && (
        <div className={styles.cartOverlay}>
          <div className={styles.cartDrawer}>
            <div className={styles.cartHeader}>
              <h2>購物車 ({cartItems.length})</h2>
              <button className={styles.closeCart} onClick={() => setIsCartOpen(false)}>×</button>
            </div>
            <div className={styles.cartContent}>
              {cartItems.length === 0 ? (
                <p className={styles.emptyCart}>您的購物車是空的</p>
              ) : (
                <div className={styles.cartItemsList}>
                  {cartItems.map((item) => (
                    <div key={item.id} className={styles.cartItem}>
                      <img src={item.image} alt={item.name} className={styles.cartItemImg} />
                      <div className={styles.cartItemInfo}>
                        <h4>{item.name}</h4>
                        <p>NT${item.price} x {item.quantity}</p>
                      </div>
                      <button className={styles.removeItem} onClick={() => removeFromCart(item.id)}>移除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.cartFooter}>
              <div className={styles.totalPrice}>
                <span>總計：</span>
                <span>NT${cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0)}</span>
              </div>
              <button className={styles.checkoutBtn} disabled={cartItems.length === 0}>
                結帳
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart Button */}
      {!isCartOpen && cartItems.length > 0 && (
        <button className={styles.floatingCart} onClick={() => setIsCartOpen(true)}>
          <span className={styles.cartCount}>{cartItems.length}</span>
          🛒
        </button>
      )}
    </div>
  );
}
