import OrdersManager from '@/components/OrdersManager';

export const metadata = {
  title: 'Admin - Orders',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>訂單管理（Admin）</h1>
      <p>列出所有訂單並提供分頁與操作（示範）。</p>
      <OrdersManager />
    </main>
  );
}
