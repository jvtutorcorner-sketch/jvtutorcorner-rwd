"use client";

import React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useT } from './IntlProvider';

type Props = {
    totalItems: number;
    pageSize: number;
    currentPage: number;
    pageSizeOptions?: number[];
};

export default function Pagination({
    totalItems,
    pageSize,
    currentPage,
    pageSizeOptions = [10, 20, 50, 100],
}: Props) {
    const t = useT();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const totalPages = Math.ceil(totalItems / pageSize);

    const createQueryString = (params: Record<string, string | number | null>) => {
        const newParams = new URLSearchParams(searchParams.toString());
        Object.entries(params).forEach(([key, value]) => {
            if (value === null) {
                newParams.delete(key);
            } else {
                newParams.set(key, String(value));
            }
        });
        return newParams.toString();
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        const scroll = window.scrollY;
        router.push(`${pathname}?${createQueryString({ page: newPage })}`, { scroll: false });
        // setTimeout to restore scroll if needed, but Next.js usually handles it.
    };

    const handleSizeChange = (newSize: number) => {
        router.push(`${pathname}?${createQueryString({ limit: newSize, page: 1 })}`, { scroll: false });
    };

    if (totalItems === 0) return null;

    return (
        <div className="pagination-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px', padding: '16px 0', borderTop: '1px solid #eee', flexWrap: 'wrap', gap: '16px' }}>
            <div className="page-size-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t('per_page')}</span>
                <select
                    value={pageSize}
                    onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                    {pageSizeOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
                <span style={{ marginLeft: '8px', color: '#666' }}>
                    共 {totalItems} 筆
                </span>
            </div>

            <div className="page-navigation" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        background: currentPage <= 1 ? '#f5f5f5' : '#fff',
                        cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                        opacity: currentPage <= 1 ? 0.6 : 1
                    }}
                >
                    {t('previous')}
                </button>

                <span style={{ fontWeight: 500 }}>
                    {currentPage} / {totalPages}
                </span>

                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        background: currentPage >= totalPages ? '#f5f5f5' : '#fff',
                        cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                        opacity: currentPage >= totalPages ? 0.6 : 1
                    }}
                >
                    {t('next')}
                </button>
            </div>
        </div>
    );
}
