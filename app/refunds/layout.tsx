import { requirePageSession } from '@/lib/auth/pageGuard';

/**
 * 伺服器端存取守衛：/refunds 是使用者自己的退款申請頁，只要登入即可。
 * 真正的授權（只能申請自己的已付款訂單、不能直接退款）由 PATCH /api/orders/[orderId] 強制；
 * 管理員核准退款請至 /admin/refunds。
 */
export default async function RefundsLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession({ reason: 'refunds' });
  return <>{children}</>;
}
