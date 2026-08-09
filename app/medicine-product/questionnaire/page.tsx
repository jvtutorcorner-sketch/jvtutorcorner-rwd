import { redirect } from 'next/navigation';

/** Legacy compatibility route for the retired medicine questionnaire. */
export default function LegacyMedicineQuestionnairePage() {
  redirect('/learning-content/questionnaire');
}
