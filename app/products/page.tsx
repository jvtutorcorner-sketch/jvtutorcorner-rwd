import { redirect } from 'next/navigation';

/** Legacy compatibility route. Product commerce is not a JV Tutor Corner feature. */
export default function LegacyProductsPage() {
  redirect('/learning-content');
}
