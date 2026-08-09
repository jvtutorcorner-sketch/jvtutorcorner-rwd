import { redirect } from 'next/navigation';

/** Legacy compatibility route. Learning needs are managed by the learning questionnaire. */
export default function LegacyMedicineSurveySettingsPage() {
  redirect('/questionnaire/learning');
}
