import { redirect } from 'next/navigation';

/** Legacy compatibility route for the retired product catalog. */
export default function LegacyProductCreatePage() {
  redirect('/learning-content');
}
