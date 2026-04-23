"use client";

import React, { useState } from 'react';
import styles from './page.module.css';

interface ProductImage {
  id: string;
  url: string;
  alt: string;
}

interface ProductSpec {
  name: string;
  value: string;
}

export default function MedicineProductPage() {
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState('navy');
  const [selectedImage, setSelectedImage] = useState('main');
  const [quantity, setQuantity] = useState(1);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<{id: string, name: string, price: number, quantity: number, image: string}[]>([]);

  const product = {
    id: '1',
    name: '高效止咳化痰藥水',
    price: 285,
    originalPrice: 380,
    rating: 4.8,
    reviews: 2458,
    inStock: true,
    description: '採用天然草本配方，快速緩解咳嗽症狀。適合成人和兒童使用，無副作用，安全有效。',
    category: '止咳藥',
    SKU: 'MED-001-2026'
  };

  const productImages: ProductImage[] = [
    {
      id: 'main',
      url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80',
      alt: '產品主圖'
    },
    {
      id: 'schematic',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Respiratory_system_complete_en.svg/800px-Respiratory_system_complete_en.svg.png',
      alt: '藥品作用原理示意圖'
    },
    {
      id: 'usage',
      url: 'https://images.unsplash.com/photo-1576091160550-217359f42f8c?auto=format&fit=crop&w=800&q=80',
      alt: '使用方法示意圖'
    }
  ];

  const sizes = [
    { value: 'S', label: 'S', available: true },
    { value: 'M', label: 'M', available: true },
    { value: 'L', label: 'L', available: true }
  ];

  const colors = [
    { value: 'navy', label: '海軍藍', hex: '#001e4d' },
    { value: 'gray', label: '深灰', hex: '#3a3a3a' },
    { value: 'wine', label: '酒紅色', hex: '#8b2c2c' }
  ];

  const specifications: ProductSpec[] = [
    { name: '主要成分', value: '甘草、蜂蜜、魚腥草、罗汉果' },
    { name: '含量', value: '300ml / 瓶' },
    { name: '用法用量', value: '成人每次15ml，兒童按體重酌減，每日3次' },
    { name: '保存方式', value: '密閉、陰涼乾燥處，避免陽光直射' },
    { name: '有效期', value: '36個月' },
    { name: '生產批號', value: '可在瓶身底部查看' },
    { name: '適用人群', value: '成人及6歲以上兒童' },
    { name: '禁忌事項', value: '對本品任何成分過敏者禁用；孕婦應在醫生指導下使用'
    }
  ];

  const relatedProducts = [
    { id: '2', name: '寶寶防護濕疹膏', price: 185, image: 'https://images.unsplash.com/photo-1626716493137-b67fe9501e76?auto=format&fit=crop&w=400&q=80' },
    { id: '3', name: '強效消炎止痛噴霧', price: 125, image: 'https://images.unsplash.com/photo-1607619056574-7b891ee58ac3?auto=format&fit=crop&w=400&q=80' },
    { id: '4', name: '維生素C補充液', price: 95, image: 'https://images.unsplash.com/photo-1579722820308-d74e5719bc5a?auto=format&fit=crop&w=400&q=80' },
    { id: '5', name: '蜂蜜潤喉糖', price: 45, image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?auto=format&fit=crop&w=400&q=80' }
  ];

  const addToCart = (item: any) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i);
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  };

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: quantity,
      image: productImages[0].url
    });
  };

  const handleBuyNow = () => {
    handleAddToCart();
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <a href="/">首頁</a>
        <span>/</span>
        <a href="/products">商品</a>
        <span>/</span>
        <span className={styles.current}>{product.category}</span>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Image Gallery */}
        <div className={styles.imageSection}>
          <div className={styles.mainImage}>
            <img 
              src={productImages.find(img => img.id === selectedImage)?.url} 
              alt={product.name}
            />
          </div>
          <div className={styles.thumbnails}>
            {productImages.map((img) => (
              <button
                key={img.id}
                className={`${styles.thumbnail} ${selectedImage === img.id ? styles.selected : ''}`}
                onClick={() => setSelectedImage(img.id)}
                title={img.alt}
              >
                <img src={img.url} alt={img.alt} />
              </button>
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className={styles.detailsSection}>
          {/* Header */}
          <div className={styles.productHeader}>
            <div className={styles.categoryBadge}>{product.category}</div>
            <h1>{product.name}</h1>
            <div className={styles.headerMeta}>
              <div className={styles.ratingInline}>
                <span className={styles.stars}>★★★★☆</span>
                <span className={styles.ratingValue}>{product.rating}</span>
                <span className={styles.reviewCount}>({product.reviews.toLocaleString()} 評論)</span>
              </div>
              <div className={styles.mobilePrice}>
                <span className={styles.mobileCurrentPrice}>NT${product.price}</span>
                <span className={styles.mobileOriginalPrice}>NT${product.originalPrice}</span>
              </div>
              <div className={styles.skuInline}>SKU: {product.SKU}</div>
            </div>
          </div>

          {/* Price */}
          <div className={`${styles.priceSection} ${styles.desktopOnly}`}>
            <div className={styles.priceTag}>
              <span className={styles.currentPrice}>NT${product.price}</span>
              <span className={styles.originalPrice}>NT${product.originalPrice}</span>
              <span className={styles.discount}>
                -{Math.round((1 - product.price / product.originalPrice) * 100)}%
              </span>
            </div>
            <div className={styles.stockStatus}>
              {product.inStock ? (
                <span className={styles.inStock}>✓ 現貨供應</span>
              ) : (
                <span className={styles.outOfStock}>缺貨中</span>
              )}
            </div>
          </div>

          {/* Size Selection */}
          <div className={styles.optionGroup}>
            <label className={styles.optionLabel}>容量尺寸：</label>
            <div className={styles.optionButtons}>
              {sizes.map((size) => (
                <button
                  key={size.value}
                  className={`${styles.optionButton} ${selectedSize === size.value ? styles.selected : ''} ${!size.available ? styles.disabled : ''}`}
                  onClick={() => size.available && setSelectedSize(size.value)}
                  disabled={!size.available}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className={styles.optionGroup}>
            <label className={styles.optionLabel}>瓶身顏色：</label>
            <div className={styles.colorButtons}>
              {colors.map((color) => (
                <button
                  key={color.value}
                  className={`${styles.colorButton} ${selectedColor === color.value ? styles.selected : ''}`}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.label}
                >
                  <span 
                    className={styles.colorSwatch}
                    style={{ backgroundColor: color.hex }}
                  ></span>
                  <span>{color.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className={styles.optionGroup}>
            <label className={styles.optionLabel}>數量：</label>
            <div className={styles.quantityControl}>
              <button 
                className={styles.quantityBtn}
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                -
              </button>
              <input 
                type="number" 
                min="1" 
                max="999"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.quantityInput}
              />
              <button 
                className={styles.quantityBtn}
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Action Buttons - Desktop */}
          <div className={`${styles.actionButtons} ${styles.desktopOnly}`}>
            <button 
              className={styles.addToCartBtn}
              onClick={handleAddToCart}
            >
              加入購物車
            </button>
            <button 
              className={styles.buyNowBtn}
              onClick={handleBuyNow}
            >
              立即購買
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <button 
              style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1.5px solid #059669', 
                background: '#fff', 
                color: '#059669', 
                fontWeight: 600, 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onClick={() => window.location.href = '/medicine-product/questionnaire'}
            >
              📋 填寫諮詢問卷 (獲取專業用藥建議)
            </button>
          </div>

          {/* Additional Info */}
          <div className={styles.additionalInfo}>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon}>🚚</span>
              <span>免運費（滿NT$1000）</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon}>↩️</span>
              <span>7天無條件退貨</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon}>✓</span>
              <span>正品保證</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Description Tabs */}
      <div className={styles.descriptionSection}>
        <div className={styles.tabNav}>
          <button className={`${styles.tab} ${styles.active}`}>產品介紹</button>
          <button className={styles.tab}>規格說明</button>
          <button className={styles.tab}>使用心得</button>
        </div>

        <div className={styles.tabContent}>
          <div className={styles.tabPane}>
            <h2>產品介紹</h2>
            <p>{product.description}</p>
            <h3>產品特點：</h3>
            <ul>
              <li>天然草本配方，不含西藥成分</li>
              <li>快速緩解咳嗽、化痰效果明顯</li>
              <li>適合全家使用，安全無副作用</li>
              <li>經過多項臨床試驗驗證</li>
              <li>國家藥監部門認證</li>
            </ul>

            <div className={styles.schematicWrapper}>
              <h3>藥品作用原理示意圖</h3>
              <p>我們的配方通過多重機制作用於呼吸道，有效舒緩喉嚨不適並稀釋痰液。</p>
              <div className={styles.schematicImage}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Respiratory_system_complete_en.svg/800px-Respiratory_system_complete_en.svg.png" alt="作用原理示意圖" />
              </div>
              <p className={styles.imageCaption}>圖：草本成分在肺部與氣管的舒緩示意圖</p>
            </div>

            <div className={styles.usageGuide}>
              <h3>正確使用方式</h3>
              <div className={styles.usageFlex}>
                <div className={styles.usageText}>
                  <p>1. 使用前請先搖勻藥液。</p>
                  <p>2. 使用內附精準量杯量取建議劑量。</p>
                  <p>3. 慢速吞服，讓藥液在喉嚨處停留片刻效果更佳。</p>
                </div>
                <div className={styles.usageThumb}>
                  <img src="https://images.unsplash.com/photo-1576091160550-217359f42f8c?auto=format&fit=crop&w=800&q=80" alt="使用方法" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Specifications */}
      <div className={styles.specificationsSection}>
        <h2>規格詳情</h2>
        <div className={styles.specGrid}>
          {specifications.map((spec, index) => (
            <div key={index} className={styles.specRow}>
              <div className={styles.specName}>{spec.name}</div>
              <div className={styles.specValue}>{spec.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Related Products */}
      <div className={styles.relatedSection}>
        <h2>你可能也要買</h2>
        <div className={styles.relatedGrid}>
          {relatedProducts.map((relProduct) => (
            <div key={relProduct.id} className={styles.relatedCard}>
              <div className={styles.relatedImage}>
                <img 
                  src={relProduct.image}
                  alt={relProduct.name}
                />
              </div>
              <h4>{relProduct.name}</h4>
              <p className={styles.relatedPrice}>NT${relProduct.price}</p>
              <button 
                className={styles.relatedBtn}
                onClick={() => addToCart({ ...relProduct, quantity: 1 })}
              >
                加入購物車
              </button>
            </div>
          ))}
        </div>
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

      {/* Mobile Sticky Action Bar */}
      <div className={styles.mobileActionsBar}>
        <div className={styles.mobileActionsContainer}>
          <div className={styles.mobileShortcuts}>
            <button className={styles.shortcutBtn} onClick={() => setIsCartOpen(true)}>
              <span className={styles.icon}>🛒</span>
              <span>購物車</span>
              {cartItems.length > 0 && <span className={styles.badge}>{cartItems.length}</span>}
            </button>
            <button className={styles.shortcutBtn} onClick={() => window.location.href = '/medicine-product/questionnaire'}>
              <span className={styles.icon}>📋</span>
              <span>諮詢</span>
            </button>
          </div>
          <div className={styles.mobileMainButtons}>
            <button 
              className={styles.mobileAddToCartBtn}
              onClick={handleAddToCart}
            >
              加入購物車
            </button>
            <button 
              className={styles.mobileBuyNowBtn}
              onClick={handleBuyNow}
            >
              立即購買
            </button>
          </div>
        </div>
      </div>

      {/* Floating Cart Button (Desktop only or fallback) */}
      {!isCartOpen && cartItems.length > 0 && (
        <button className={`${styles.floatingCart} ${styles.desktopOnly}`} onClick={() => setIsCartOpen(true)}>
          <span className={styles.cartCount}>{cartItems.length}</span>
          🛒
        </button>
      )}
    </div>
  );
}
