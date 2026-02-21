"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function PayPalMockContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const token = searchParams.get('token');
    const mockOrderId = searchParams.get('MockOrderId');
    const amount = searchParams.get('amount') || '0';
    const itemName = searchParams.get('itemName') || 'Course Purchase';

    const handleConfirm = () => {
        if (!token || !mockOrderId) {
            alert('Missing token or orderId');
            return;
        }
        // Redirect to the return API to finish order
        window.location.href = `/api/paypal/return?token=${token}&MockOrderId=${mockOrderId}`;
    };

    const handleCancel = () => {
        router.push('/courses');
    };

    return (
        <div style={{
            fontFamily: 'sans-serif',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#f0f2f5'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%'
            }}>
                <div style={{ marginBottom: '20px' }}>
                    <img
                        src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg"
                        alt="PayPal Logo"
                        style={{ height: '50px' }}
                    />
                </div>
                <h2 style={{ color: '#003087', marginBottom: '10px' }}>PayPal 模擬結帳</h2>
                <p style={{ color: '#666', marginBottom: '20px' }}>正在使用模擬模式進行測試</p>

                <div style={{
                    textAlign: 'left',
                    backgroundColor: '#f8f9fa',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                }}>
                    <p style={{ margin: '5px 0' }}><strong>商品:</strong> {itemName}</p>
                    <p style={{ margin: '5px 0' }}><strong>金額:</strong> {amount} TWD</p>
                    <p style={{ margin: '5px 0', fontSize: '12px', color: '#888' }}><strong>訂單編號:</strong> {mockOrderId}</p>
                </div>

                <button
                    onClick={handleConfirm}
                    style={{
                        backgroundColor: '#0070ba',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '25px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        width: '100%',
                        marginBottom: '10px',
                        transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#005ea6')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0070ba')}
                >
                    確認付款 (Mock)
                </button>

                <button
                    onClick={handleCancel}
                    style={{
                        backgroundColor: 'transparent',
                        color: '#666',
                        border: 'none',
                        fontSize: '14px',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                    }}
                >
                    取消並返回
                </button>
            </div>
        </div>
    );
}

export default function PayPalMockPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PayPalMockContent />
        </Suspense>
    );
}
