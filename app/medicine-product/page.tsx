import { redirect } from 'next/navigation';

/** Legacy compatibility route. Teaching content analysis now lives at /learning-content. */
export default function LegacyMedicineProductPage() {
  redirect('/learning-content');
}
