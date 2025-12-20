"use client";

import { useEffect, useState } from 'react';

interface CarouselImage {
  id: string;
  url: string;
  alt: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCarouselPage() {
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageDetails, setImageDetails] = useState<Record<string, { width: number; height: number; size: number }>>({});

  useEffect(() => {
    loadImages();
  }, []);

  // 當圖片列表變化時，重新獲取詳細信息
  useEffect(() => {
    if (images.length > 0) {
      const loadDetails = async () => {
        const details: Record<string, { width: number; height: number; size: number }> = { ...imageDetails };
        let hasNewDetails = false;

        for (const image of images) {
          if (!details[image.id]) { // 只獲取還沒有詳細信息的圖片
            details[image.id] = await getImageDetails(image.url);
            hasNewDetails = true;
          }
        }

        if (hasNewDetails) {
          setImageDetails(details);
        }
      };
      loadDetails();
    }
  }, [images]);

  // 獲取圖片詳細信息（尺寸和檔案大小）
  const getImageDetails = (url: string): Promise<{ width: number; height: number; size: number }> => {
    return new Promise((resolve) => {
      const img = new Image();

      // 確保圖片 URL 正確
      let imageUrl = url;
      if (url.startsWith('data:')) {
        imageUrl = url; // base64 URL
      }

      img.onload = () => {
        // 估算檔案大小（base64 編碼約比原始檔案大 33%）
        let size = 0;
        if (url.startsWith('data:')) {
          // base64 編碼的估算大小
          const base64Data = url.split(',')[1];
          if (base64Data) {
            size = Math.round((base64Data.length * 0.75) / 1024); // KB
          }
        }

        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: size
        });
      };

      img.onerror = () => {
        console.warn('Failed to load image for details:', url.substring(0, 50) + '...');
        resolve({ width: 0, height: 0, size: 0 });
      };

      img.src = imageUrl;
    });
  };

  // 載入圖片時同時獲取詳細信息
  const loadImages = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/carousel');
      if (response.ok) {
        const data = await response.json();
        setImages(data);

        // 獲取每張圖片的詳細信息
        const details: Record<string, { width: number; height: number; size: number }> = {};
        for (const image of data) {
          details[image.id] = await getImageDetails(image.url);
        }
        setImageDetails(details);
      } else {
        console.error('Failed to load carousel images');
        setImages([]);
      }
    } catch (error) {
      console.error('Error loading carousel images:', error);
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
      setMessage('請選擇圖片文件');
      return;
    }

    // 檢查文件大小 (20MB 限制)
    if (file.size > 20 * 1024 * 1024) {
      setMessage('圖片大小不能超過 20MB');
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // 使用 FormData 上傳到 S3
      const formData = new FormData();
      formData.append('file', file);
      formData.append('alt', file.name);

      const uploadResponse = await fetch('/api/carousel/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || '上傳失敗');
      }

      const uploadResult = await uploadResponse.json();

      // 將上傳結果保存到 carousel
      const response = await fetch('/api/carousel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: uploadResult.url,
          alt: uploadResult.alt,
          order: images.length,
        }),
      });

      if (response.ok) {
        const newImage = await response.json();
        setImages(prev => [...prev, newImage]);
        setMessage('圖片上傳成功！');
        // 清空文件輸入
        event.target.value = '';
      } else {
        throw new Error('保存圖片信息失敗');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`上傳失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這張圖片嗎？')) return;

    try {
      const response = await fetch(`/api/carousel?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setImages(images.filter(img => img.id !== id));
        setMessage('圖片刪除成功');
      } else {
        setMessage('刪除失敗，請重試');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setMessage('刪除失敗，請重試');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return; // 已經在最上面

    const newImages = [...images];
    [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];

    // 更新順序
    newImages.forEach((img, i) => {
      img.order = i;
    });

    await updateImageOrder(newImages);
  };

  const handleMoveDown = async (index: number) => {
    if (index === images.length - 1) return; // 已經在最下面

    const newImages = [...images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];

    // 更新順序
    newImages.forEach((img, i) => {
      img.order = i;
    });

    await updateImageOrder(newImages);
  };

  const updateImageOrder = async (updatedImages: CarouselImage[]) => {
    try {
      // 批量更新所有圖片的順序
      const updatePromises = updatedImages.map(image =>
        fetch('/api/carousel', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: image.id,
            order: image.order,
          }),
        })
      );

      const results = await Promise.all(updatePromises);
      const allSuccessful = results.every(result => result.ok);

      if (allSuccessful) {
        setImages(updatedImages);
        setMessage('排序更新成功');
      } else {
        setMessage('排序更新失敗，請重試');
        // 重新載入圖片以恢復原始順序
        loadImages();
      }
    } catch (error) {
      console.error('Update order error:', error);
      setMessage('排序更新失敗，請重試');
      loadImages();
    }
  };

  if (loading) {
    return <div style={{ padding: 24 }}>載入中...</div>;
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>輪播圖管理</h1>

      <div style={{ marginBottom: 24 }}>
        <h2>上傳新圖片</h2>
        <div style={{ marginBottom: 16 }}>
          <p><strong>圖片上傳說明：</strong></p>
          <ul>
            <li>建議尺寸：1200px x 628px (顯示時會自動適應此比例)</li>
            <li>格式：JPG、PNG</li>
            <li>大小：不超過 20MB</li>
          </ul>
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          disabled={uploading}
          style={{ marginBottom: 8 }}
        />
        {uploading && <p>上傳中...</p>}
      </div>

      {message && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          backgroundColor: message.includes('成功') ? '#d4edda' : '#f8d7da',
          color: message.includes('成功') ? '#155724' : '#721c24',
          borderRadius: 4
        }}>
          {message}
        </div>
      )}

      <div>
        <h2>現有圖片 ({images.length})</h2>
        {images.length === 0 ? (
          <p>尚未上傳任何圖片</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {images.map((image, index) => {
              const details = imageDetails[image.id] || { width: 0, height: 0, size: 0 };
              return (
                <div key={image.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 12,
                  border: '1px solid #ddd',
                  borderRadius: 8
                }}>
                  <img
                    src={image.url}
                    alt={image.alt}
                    style={{
                      width: 200,
                      height: 100,
                      objectFit: 'cover',
                      marginRight: 16,
                      borderRadius: 4
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <p><strong>文件名：</strong>{image.alt}</p>
                    <p><strong>順序：</strong>{image.order}</p>
                    <p><strong>尺寸：</strong>{details.width} × {details.height} px</p>
                    <p><strong>檔案大小：</strong>{details.size} KB</p>
                    <p><strong>上傳時間：</strong>{new Date(image.createdAt).toLocaleString('zh-TW')}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginRight: 16 }}>
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: index === 0 ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: index === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ↑ 上移
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === images.length - 1}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: index === images.length - 1 ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: index === images.length - 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ↓ 下移
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(image.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    刪除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}