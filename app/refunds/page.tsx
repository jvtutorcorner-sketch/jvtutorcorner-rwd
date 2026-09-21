import { requirePageSession } from '@/lib/auth/pageGuard';
import RefundsClient from './RefundsClient';

export default async function RefundsPage() {
  const session = await requirePageSession({ reason: 'refunds' });
  const isAdmin = session.role === 'admin' || session.role === 'system';
  return <RefundsClient userId={session.userId} isAdmin={isAdmin} />;
}
