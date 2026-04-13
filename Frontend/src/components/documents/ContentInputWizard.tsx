/**
 * Content Input Wizard Component
 * Multi-step form to fill resume sections
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useProcessText } from '@/hooks/useTextProcessor';
import { useToast } from '@/contexts/ToastContext';

export interface BookmarkSection {
  name: string;
  placeholder: string;
  currentContent?: string;
  generatedContent?: string;
}

interface ContentInputWizardProps {
  sections: BookmarkSection[];
  onUpdate: (updates: Record<string, string>) => void;
  loading?: boolean;
}

export const ContentInputWizard: React.FC<ContentInputWizardProps> = ({
  sections,
  onUpdate,
  loading = false,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [content, setContent] = useState<Record<string, string>>(
    sections.reduce((acc, sec) => ({ ...acc, [sec.placeholder]: sec.currentContent || '' }), {})
  );
  const [useGenerated, setUseGenerated] = useState<Set<string>>(new Set());
  const { showToast } = useToast();
  const processText = useProcessText();

  const currentSection = sections[currentStep];
  const currentPlaceholder = currentSection.placeholder;

  const handleNext = () => {
    if (currentStep < sections.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    onUpdate(content);
    showToast({
      message: 'Resume updated with processed content',
      type: 'success',
    });
  };

  const handleGenerateFromJD = async () => {
    if (!currentSection.currentContent || currentSection.currentContent.length < 50) {
      showToast({
        message: 'Please provide at least 50 characters of text',
        type: 'warning',
      });
      return;
    }

    try {
      const result = await processText.mutateAsync({
        text: currentSection.currentContent,
        pointsPerHeading: 2,
        removeDuplicates: true,
      });

      if (result) {
        const processed = result.processed_text;
        setContent((prev) => ({
          ...prev,
          [currentPlaceholder]: processed,
        }));
        setUseGenerated((prev) => new Set([...prev, currentPlaceholder]));
        showToast({
          message: 'Content processed successfully',
          type: 'success',
        });
      }
    } catch (error) {
      showToast({
        message: `Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
        type: 'error',
      });
    }
  };

  const progress = ((currentStep + 1) / sections.length) * 100;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Step {currentStep + 1} of {sections.length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{Math.round(progress)}%</p>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current Section */}
      <div className="space-y-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
        <div>
          <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
            {currentSection.name}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            Placeholder: {currentSection.placeholder}
          </p>
        </div>

        {/* Content Input */}
        <textarea
          value={content[currentPlaceholder] || ''}
          onChange={(e) =>
            setContent((prev) => ({
              ...prev,
              [currentPlaceholder]: e.target.value,
            }))
          }
          placeholder="Enter or paste content for this section..."
          className="w-full h-40 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none text-sm"
          disabled={loading || processText.isPending}
        />

        {/* Generate Button */}
        <button
          onClick={handleGenerateFromJD}
          disabled={loading || processText.isPending || !content[currentPlaceholder]?.trim()}
          className="w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Sparkles className="w-4 h-4" />
          {processText.isPending ? 'Processing...' : 'AI Process This Section'}
        </button>

        {/* Generated Preview */}
        {useGenerated.has(currentPlaceholder) && content[currentPlaceholder] && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-100 max-h-20 overflow-y-auto">
            <p className="font-medium mb-1">✓ AI Processed</p>
            <p className="whitespace-pre-wrap">{content[currentPlaceholder]}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        {currentStep === sections.length - 1 ? (
          <button
            onClick={handleFinish}
            disabled={loading || processText.isPending}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            Finish & Update Resume
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm font-medium"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
