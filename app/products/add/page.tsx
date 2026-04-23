"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function AddProductPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    originalPrice: '',
    category: '止咳藥',
    description: '',
    image: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`商品「${formData.name}」已成功新增！(此為串接展示)`);
    router.push('/products');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className={styles.container}>
      <Link href="/products" className={styles.backLink}>
        ← 返回商品列表
      </Link>
      
      <div className={styles.formCard}>
        <h1>新增商品</h1>
        <p className={styles.subtitle}>請填寫以下資訊以建立新的藥品清單</p>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="name">商品名稱</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              value={formData.name}
              onChange={handleChange}
              placeholder="例如：高效止咳化痰藥水"
              required 
            />
          </div>
          
          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label htmlFor="price">優惠售價 (NT$)</label>
              <input 
                type="number" 
                id="price" 
                name="price" 
                value={formData.price}
                onChange={handleChange}
                placeholder="285"
                required 
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="originalPrice">原價 (NT$)</label>
              <input 
                type="number" 
                id="originalPrice" 
                name="originalPrice" 
                value={formData.originalPrice}
                onChange={handleChange}
                placeholder="380"
              />
            </div>
          </div>
          
          <div className={styles.inputGroup}>
            <label htmlFor="category">商品分類</label>
            <select 
              id="category" 
              name="category" 
              value={formData.category}
              onChange={handleChange}
            >
              <option value="止咳藥">止咳藥</option>
              <option value="外用藥">外用藥</option>
              <option value="止痛藥">止痛藥</option>
              <option value="保健品">保健品</option>
              <option value="其他">其他</option>
            </select>
          </div>
          
          <div className={styles.inputGroup}>
            <label htmlFor="image">商品圖片</label>
            <div className={styles.fileUploadWrapper}>
              <input 
                type="file" 
                id="image" 
                name="image" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData(prev => ({ ...prev, image: reader.result as string }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className={styles.fileInput}
              />
              <div className={styles.fileDummy}>
                <span className={styles.uploadIcon}>📷</span>
                <span>{formData.image ? '更換圖片' : '選擇圖片檔案'}</span>
              </div>
            </div>
            {formData.image && (
              <div className={styles.imagePreview}>
                <p>產品預覽：</p>
                <img src={formData.image} alt="Preview" />
              </div>
            )}
          </div>
          
          <div className={styles.inputGroup}>
            <label htmlFor="description">商品描述</label>
            <textarea 
              id="description" 
              name="description" 
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="請輸入商品詳細介紹、用法及注意事項..."
              required
            ></textarea>
          </div>
          
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>
              取消
            </button>
            <button type="submit" className={styles.submitBtn}>
              儲存商品
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
