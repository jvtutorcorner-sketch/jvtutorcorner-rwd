"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ProgressHeader from '../components/ProgressHeader';
import StepS0 from '../components/steps/StepS0';
import StepS1 from '../components/steps/StepS1';
import StepS2 from '../components/steps/StepS2';
import StepS3 from '../components/steps/StepS3';
import StepS4 from '../components/steps/StepS4';
import StepS5 from '../components/steps/StepS5';
import StepS6 from '../components/steps/StepS6';
import StepS7 from '../components/steps/StepS7';
import { defaultValues, LearningQuestionnaireValues, QUESTIONNAIRE_STEPS } from '@/types/questionnaire';

const TOTAL_STEPS = QUESTIONNAIRE_STEPS.length;

function validateStep(step: number, values: LearningQuestionnaireValues): string | null {
  switch (step) {
    case 0: return values.agreedToTerms ? null : '請先閱讀並同意條款';
    case 1: return values.role ? null : '請選擇您的身分';
    case 3: return values.subjects.length > 0 ? null : '請至少選擇一個科目';
    case 4: return values.goals.length > 0 ? null : '請至少選擇一個學習目標';
    default: return null;
  }
}

export default function QuestionnairePage() {
  const params = useParams();
  const mode = (params?.mode as string) || 'learning';

  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<LearningQuestionnaireValues>(defaultValues);
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | undefined>();
  const [matchResult, setMatchResult] = useState<{ teachers: any[]; courses: any[] } | undefined>();
  const [error, setError] = useState<string | null>(null);

  const onChange = (patch: Partial<LearningQuestionnaireValues>) => {
    setValues(prev => ({ ...prev, ...patch }));
    setError(null);
  };

  const handleNext = async () => {
    const validationError = validateStep(currentStep, values);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (currentStep === TOTAL_STEPS - 2) {
      // Last data-entry step — submit
      await handleSubmit();
      return;
    }

    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
    setError(null);
  };

  useEffect(() => {
    if (!submissionId || values.subjects.length === 0) return;
    fetch(`/api/questionnaire/match?subjects=${encodeURIComponent(values.subjects.join(','))}`)
      .then(r => r.json())
      .then(setMatchResult)
      .catch(() => {});
  }, [submissionId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setCurrentStep(TOTAL_STEPS - 1);
    try {
      const res = await fetch('/api/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, data: values }),
      });
      const json = await res.json();
      if (res.ok && json.submissionId) {
        setSubmissionId(json.submissionId);
      }
    } catch (e) {
      console.error('Submit error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <StepS0 values={values} onChange={onChange} />;
      case 1: return <StepS1 values={values} onChange={onChange} />;
      case 2: return <StepS2 values={values} onChange={onChange} />;
      case 3: return <StepS3 values={values} onChange={onChange} />;
      case 4: return <StepS4 values={values} onChange={onChange} />;
      case 5: return <StepS5 values={values} onChange={onChange} />;
      case 6: return <StepS6 values={values} onChange={onChange} />;
      case 7: return <StepS7 values={values} submissionId={submissionId} submitting={submitting} matchResult={matchResult} />;
      default: return null;
    }
  };

  const isLastDataStep = currentStep === TOTAL_STEPS - 2;
  const isResultStep = currentStep === TOTAL_STEPS - 1;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <ProgressHeader currentStep={currentStep} totalSteps={TOTAL_STEPS} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
          {renderStep()}
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-500 text-center">{error}</p>
        )}

        {!isResultStep && (
          <div className="flex gap-3 mt-4">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium transition-colors"
            >
              {isLastDataStep ? '提交問卷' : '下一步'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
