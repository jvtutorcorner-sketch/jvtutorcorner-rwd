import { redirect } from 'next/navigation';

/** Legacy compatibility route. The old points-for-product flow is retired. */
export default function LegacyProductScanPage() {
  redirect('/learning-content');
}
