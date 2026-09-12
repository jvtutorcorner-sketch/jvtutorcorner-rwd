"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/mockAuth';
import { useDateFormat } from '@/lib/hooks/useDateFormat';

interface CarouselImage {
  id: string;
  url: string;
  alt: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCarouselPage() {
  const dateFmt = useDateFormat();
  const router = useRouter();
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 獲取圖片詳細信息（尺寸和檔案大小） - 已移除以優化效能
  // const [imageDetails, setImageDetails] = useState<Record<string, { width: number; height: number; size: number }>>({});


  // 載入圖片時同時獲取詳細信息
  const loadImages = async () => {
    console.log('[Carousel Admin] ===== Starting loadImages =====');
    console.log('[Carousel Admin] Starting to load carousel images after refresh...');
    setLoading(true);
    try {
      console.log('[Carousel Admin] Fetching /api/carousel');
      const response = await fetch('/api/carousel');
      console.log('[Carousel Admin] API response status:', response.status);
      console.log('[Carousel Admin] API response ok:', response.ok);
      console.log('[Carousel Admin] API response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Carousel Admin] Raw response data:', data);
        console.log('[Carousel Admin] Data type:', typeof data);
        console.log('[Carousel Admin] Is array:', Array.isArray(data));
        console.log('[Carousel Admin] Successfully loaded', data.length, 'images from API');
        
        if (data.length > 0) {
          console.log('[Carousel Admin] Image details:', data.map((img: CarouselImage) => ({
            id: img.id,
            url: img.url.substring(0, 100) + '...',
            alt: img.alt,
            order: img.order
          })));
        } else {
          console.warn('[Carousel Admin] API returned empty array');
        }
        
        setImages(data);
        console.log('[Carousel Admin] All images loaded successfully');
      } else {
        console.error('[Carousel Admin] API returned status:', response.status);
        const text = await response.text();
        console.error('[Carousel Admin] Response body:', text);
      }
    } catch (error) {
      console.error('[Carousel Admin] Failed to load images:', error);
      console.error('[Carousel Admin] Error details:', {
        name: (error as any)?.name,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      });
      setMessage('載入圖片失敗');
    } finally {
      setLoading(false);
      console.log('[Carousel Admin] Image loading completed');
      console.log('[Carousel Admin] ===== loadImages Complete =====');
    }
  };

  useEffect(() => {
    console.log('[Carousel Admin] Page mounted/component initialized');
    // Check authentication
    const user = getStoredUser();
    console.log('[Carousel Admin] Checking authentication...');
    if (!user || !user.email) {
      console.log('[Carousel Admin] User not authenticated, redirecting to login');
      router.push('/login');
      return;
    }
    console.log('[Carousel Admin] User authenticated:', user.email);
    setAuthChecking(false);
    console.log('[Carousel Admin] Auth checking complete, calling loadImages()');
    loadImages();
  }, [router]);


  if (authChecking) {
    return <div className="p-8 text-center text-gray-500">Checking authentication...</div>;
  }

  // 圖片壓縮函數
  const compressImage = async (file: File, maxSizeMB: number = 5): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 如果圖片太大，按比例縮小
          const MAX_DIMENSION = 1920; // 最大寬度或高度
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = (height / width) * MAX_DIMENSION;
              width = MAX_DIMENSION;
            } else {
              width = (width / height) * MAX_DIMENSION;
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          // 使用較低的品質進行壓縮
          let quality = 0.9;
          const attemptCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // 如果壓縮後仍然太大，降低品質重試
                if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.5) {
                  quality -= 0.1;
                  console.log(`[Carousel Upload] Image still too large (${(blob.size / 1024 / 1024).toFixed(2)}MB), retrying with quality ${quality.toFixed(1)}`);
                  attemptCompress();
                  return;
                }

                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });

                console.log('[Carousel Upload] Image compressed:', {
                  originalSize: file.size,
                  compressedSize: compressedFile.size,
                  reduction: ((1 - compressedFile.size / file.size) * 100).toFixed(1) + '%'
                });

                resolve(compressedFile);
              },
              'image/jpeg',
              quality
            );
          };

          attemptCompress();
        };
        img.onerror = () => reject(new Error('Failed to load image'));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.log('[Carousel Upload] No file selected');
      return;
    }

    console.log('[Carousel Upload] File selected:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
      console.warn('[Carousel Upload] Invalid file type:', file.type);
      setMessage('請選擇圖片文件');
      return;
    }

    // 檢查文件大小 (20MB 限制)
    if (file.size > 20 * 1024 * 1024) {
      console.warn('[Carousel Upload] File too large:', {
        size: file.size,
        maxSize: 20 * 1024 * 1024,
        sizeInMB: (file.size / (1024 * 1024)).toFixed(2)
      });
      setMessage('圖片大小不能超過 20MB');
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // 如果檔案大於 5MB，自動壓縮
      let fileToUpload = file;
      if (file.size > 5 * 1024 * 1024) {
        console.log('[Carousel Upload] File is large, compressing...');
        setMessage('圖片較大，正在壓縮...');
        try {
          fileToUpload = await compressImage(file, 5);
          console.log('[Carousel Upload] Compression successful');
          setMessage(null);
        } catch (compressError) {
          console.error('[Carousel Upload] Compression failed:', compressError);
          setMessage('圖片壓縮失敗，嘗試上傳原檔...');
          fileToUpload = file; // 如果壓縮失敗，使用原檔案
        }
      }

      let finalUrl: string | undefined;
      let finalAlt: string | undefined;

      // In development, skip presign and go directly to server-side upload
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NEXT_PUBLIC_ENV_PRODUCTION;

      if (isDevelopment) {
        console.log('[Carousel Upload] Development mode detected, skipping presign and using server-side upload...');
        
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('alt', file.name);

        console.log('[Carousel Upload] Calling /api/carousel/upload');
        let uploadResponse;
        try {
          uploadResponse = await fetch('/api/carousel/upload', { method: 'POST', body: formData });
          console.log('[Carousel Upload] Upload response status:', uploadResponse.status);
        } catch (fetchError) {
          console.error('[Carousel Upload] Upload fetch failed:', fetchError);
          throw new Error('Upload API call failed');
        }

        if (!uploadResponse.ok) {
          const errText = await uploadResponse.text().catch(() => 'Unknown error');
          console.error('[Carousel Upload] Upload API returned error:', uploadResponse.status, errText);
          
          if (uploadResponse.status === 413) {
            throw new Error('圖片太大，請選擇較小的圖片（建議 5MB 以下）');
          }
          
          throw new Error(`Upload failed: ${errText}`);
        }

        let uploadResult;
        try {
          uploadResult = await uploadResponse.json();
          console.log('[Carousel Upload] Upload result parsed:', uploadResult);

          finalUrl = uploadResult.url;
          finalAlt = uploadResult.alt || file.name;
        } catch (parseErr) {
          console.error('[Carousel Upload] Failed to parse upload response:', parseErr);
          throw new Error('Failed to parse upload response');
        }
      } else {
        // Production: try presigned URL first
        console.log('[Carousel Upload] Production mode, attempting presigned upload...');

        const presignResp = await fetch('/api/carousel/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: fileToUpload.type, fileSize: fileToUpload.size }),
        });

        console.log('[Carousel Upload] Presign response status:', presignResp.status, 'ok:', presignResp.ok);

        if (!presignResp.ok) {
          // Fallback: use existing upload proxy endpoint
          console.warn('[Carousel Upload] Presign failed (status:', presignResp.status, '), falling back to proxy upload');

          // Try to parse presign error for logging
          let presignErrorMsg = 'Unknown presign error';
          try {
            const presignError = await presignResp.json();
            presignErrorMsg = presignError.error || presignError.message || JSON.stringify(presignError);
            console.log('[Carousel Upload] Presign error response:', presignError);
          } catch (parseErr) {
            console.log('[Carousel Upload] Could not parse presign error response');
          }

          const formData = new FormData();
          formData.append('file', fileToUpload);
          formData.append('alt', file.name);

            console.log('[Carousel Upload] Calling /api/carousel/upload with fallback');
          let uploadResponse;
          try {
            uploadResponse = await fetch('/api/carousel/upload', { method: 'POST', body: formData });
            console.log('[Carousel Upload] Upload response status:', uploadResponse.status);
          } catch (fetchError) {
            console.error('[Carousel Upload] Upload fetch failed:', fetchError);
            throw new Error('Upload API call failed');
          }

          if (!uploadResponse.ok) {
            const errText = await uploadResponse.text().catch(() => 'Unknown error');
            console.error('[Carousel Upload] Upload API returned error:', uploadResponse.status, errText);
            
            if (uploadResponse.status === 413) {
              throw new Error('圖片太大，請選擇較小的圖片（建議 5MB 以下）');
            }
            
            throw new Error(`Fallback upload failed: ${errText}`);
          }

          let uploadResult;
          try {
            uploadResult = await uploadResponse.json();
            console.log('[Carousel Upload] Fallback upload result parsed:', uploadResult);
          } catch (jsonError) {
            console.error('[Carousel Upload] Failed to parse upload response:', jsonError);
            throw new Error('Failed to parse upload response');
          }

          finalUrl = uploadResult.url;
          finalAlt = uploadResult.alt || file.name;
        } else {
          let presignData;
          try {
            presignData = await presignResp.json();
          } catch (jsonError) {
            console.error('[Carousel Upload] Failed to parse presign response JSON:', jsonError);
            throw new Error('Invalid JSON response from presign API');
          }

          console.log('[Carousel Upload] Presign response parsed');
          console.log('[Carousel Upload] Has URL:', !!presignData?.url);
          console.log('[Carousel Upload] URL type:', typeof presignData?.url);
          console.log('[Carousel Upload] URL length:', presignData?.url?.length);

          // Check if response contains an error
          if (presignData.error) {
            console.error('[Carousel Upload] Presign API returned error:', presignData.error);
            throw new Error(`Presign failed: ${presignData.error}`);
          }

          if (!presignData || !presignData.url || !presignData.key) {
            console.error('[Carousel Upload] Invalid presign response structure');
            throw new Error('Invalid presign response');
          }

          console.log('[Carousel Upload] Presign data valid, URL is string:', typeof presignData.url === 'string');

          // 2) PUT file directly to S3 using presigned URL
          console.log('[Carousel Upload] Starting PUT to S3');
          let putResp;
          try {
            console.log('[Carousel Upload] Calling fetch with method PUT');
            putResp = await fetch(presignData.url, {
              method: 'PUT',
              headers: { 'Content-Type': fileToUpload.type },
              body: fileToUpload,
            });
            console.log('[Carousel Upload] PUT completed with status:', putResp.status);
          } catch (putError) {
            console.error('[Carousel Upload] PUT failed - error name:', (putError as any)?.name);
            console.error('[Carousel Upload] PUT failed - error constructor:', (putError as any)?.constructor?.name);
            if (putError instanceof Error) {
              console.error('[Carousel Upload] PUT failed - error message:', putError.message);
            } else {
              console.error('[Carousel Upload] PUT failed - not an Error instance, type:', typeof putError);
            }
            throw new Error('Failed to upload to S3: ' + ((putError as any)?.message || 'Unknown error'));
          }

          if (!putResp.ok) {
            const text = await putResp.text().catch(() => 'No response body');
            console.error('[Carousel Upload] PUT failed:', putResp.status, text);
            throw new Error(`Direct upload to S3 failed (status: ${putResp.status})`);
          }

          // 3) Build public URL (server also returns publicUrl)
          const uploadResult = { url: presignData.publicUrl, key: presignData.key, alt: file.name };
          console.log('[Carousel Upload] Direct upload successful:', uploadResult);

          finalUrl = uploadResult.url;
          finalAlt = uploadResult.alt || file.name;
        }
      }

      // 將上傳結果保存到 carousel
      console.log('[Carousel Upload] About to save metadata to /api/carousel');
      console.log('[Carousel Upload] Payload:', { url: finalUrl, alt: finalAlt, order: images.length });
      const saveResponse = await fetch('/api/carousel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: finalUrl,
          alt: finalAlt,
          order: images.length,
        }),
      });

      console.log('[Carousel Upload] Save response:', {
        status: saveResponse.status,
        statusText: saveResponse.statusText,
        ok: saveResponse.ok
      });

      if (saveResponse.ok) {
        const newImage = await saveResponse.json();
        console.log('[Carousel Upload] Successfully saved to database:', newImage);
        setImages(prev => [...prev, newImage]);
        setMessage('圖片上傳成功！');
        // 清空文件輸入
        event.target.value = '';
      } else {
        let saveErrorMessage = '保存圖片信息失敗';
        let saveErrorDetails = '';
        try {
          const saveErrorData = await saveResponse.json();
          saveErrorMessage = saveErrorData.error || saveErrorMessage;
          saveErrorDetails = saveErrorData.details || '';
          console.error('[Carousel Upload] Database save error:', saveErrorData);
        } catch (saveParseError) {
          console.error('[Carousel Upload] Failed to parse save error response:', saveParseError);
        }

        console.error('[Carousel Upload] Save to database failed:', {
          status: saveResponse.status,
          statusText: saveResponse.statusText,
          errorMessage: saveErrorMessage,
          details: saveErrorDetails
        });

        // 如果是在生產環境且圖片已上傳到 S3，顯示部分成功訊息
        if (finalUrl && finalUrl.includes('s3.')) {
          console.warn('[Carousel Upload] Image uploaded to S3 successfully. Metadata may have been saved to fallback storage.');
          setMessage('圖片上傳成功！正在重新載入列表...');
          // 清空輸入框讓用戶可以繼續上傳
          event.target.value = '';
          // 延遲一下後重新載入圖片列表
          setTimeout(() => {
            loadImages();
          }, 1000);
        } else {
          throw new Error(saveErrorMessage);
        }
      }
    } catch (error) {
      let errorDetails: Record<string, any> = {
        type: typeof error,
        isError: error instanceof Error,
        isNull: error === null,
        isUndefined: error === undefined,
      };

      if (error instanceof Error) {
        errorDetails.message = error.message;
        errorDetails.name = error.name;
        errorDetails.stack = error.stack;
      } else if (error !== null && typeof error === 'object') {
        errorDetails.stringified = String(error);
        errorDetails.keys = Object.keys(error);
        try {
          errorDetails.jsonStringifed = JSON.stringify(error);
        } catch (stringifyError) {
          errorDetails.cannotStringify = (stringifyError as any)?.message || 'Cannot stringify';
        }
        // Try to extract message from various possible properties
        const hasMessage = (e: any) => e?.message || e?.msg || e?.error || e?.error?.message;
        errorDetails.possibleMessage = hasMessage(error);
      } else {
        errorDetails.valueAsString = String(error);
      }

      console.error('[Carousel Upload] CAUGHT EXCEPTION:', errorDetails);

      const userMessage = error instanceof Error ? error.message : '未知錯誤';
      setMessage(`上傳失敗: ${userMessage}`);
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

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            borderRadius: '6px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            border: 'none',
            transition: 'all 0.3s ease',
            opacity: uploading ? 0.6 : 1
          }}
            onMouseOver={(e) => {
              if (!uploading) {
                e.currentTarget.style.backgroundColor = '#0056b3';
              }
            }}
            onMouseOut={(e) => {
              if (!uploading) {
                e.currentTarget.style.backgroundColor = '#007bff';
              }
            }}
          >
            選擇檔案
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 0,
                height: 0,
                overflow: 'hidden'
              }}
            />
          </label>
          <div style={{
            marginTop: 8,
            padding: '8px 12px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#6c757d',
            minHeight: '20px'
          }}>
            {uploading ? '上傳中...' : '未選擇任何檔案'}
          </div>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>現有圖片 ({images.length})</h2>
          <button
            onClick={() => {
              console.log('[Carousel Admin] Manual refresh triggered');
              loadImages();
            }}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            {loading ? '載入中...' : '🔄 重新整理'}
          </button>
        </div>
        {images.length === 0 ? (
          <p>尚未上傳任何圖片</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {images.map((image, index) => {
              // const details = imageDetails[image.id] || { width: 0, height: 0, size: 0 };
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
                    <p><strong>上傳時間：</strong>{dateFmt.formatDateTime(image.createdAt)}</p>
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
