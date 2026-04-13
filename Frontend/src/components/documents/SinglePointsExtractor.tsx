/**
 * Single Points Extractor Component
 * Handles single file/text extraction with configuration
 */

import React, { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, Copy } from 'lucide-react';
import { useProcessText } from '@/hooks/useTextProcessor';
import { useToast } from '@/contexts/ToastContext';

interface SinglePointsExtractorProps {
  onComplete: (cyclesText: string) => void;
}

export const SinglePointsExtractor: React.FC<SinglePointsExtractorProps> = ({ onComplete }) => {
  const [inputText, setInputText] = useState<string>('');
  const [pointsPerCycle, setPointsPerCycle] = useState<number>(2);
  const [removeDuplicates, setRemoveDuplicates] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const { showToast } = useToast();
  const processText = useProcessText();

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  }, []);

  const handleLoadSample = useCallback(() => {
    const sampleText = `Executive Leadership
• Led cross-functional teams of 15+ engineers successfully
• Implemented agile methodologies increasing productivity by 40%
• Mentored junior developers resulting in 3 promotions
• Managed quarterly budgets exceeding $2M

Technical Architecture
• Designed microservices architecture serving 1M+ daily users
• Optimized database queries reducing load times by 60%
• Implemented CI/CD pipeline reducing deployment time by 75%
• Led cloud migration to AWS saving 35% infrastructure costs

Project Delivery
• Delivered 12 major projects on time and within budget
• Coordinated with stakeholders ensuring 100% requirement satisfaction
• Implemented automated testing increasing code coverage to 85%
• Established coding standards adopted across organization`;
    setInputText(sampleText);
    showToast({ message: '📋 Sample text loaded!', type: 'info' });
  }, [showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/plain') {
        file.text().then((content) => {
          setInputText(content);
          showToast({ message: '✓ File loaded!', type: 'success' });
        });
      } else {
        showToast({ message: '❌ Please drag a .txt file', type: 'error' });
      }
    }
  }, [showToast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      const file = files[0];
      file.text().then((content) => {
        setInputText(content);
        showToast({ message: '✓ File loaded!', type: 'success' });
      });
    }
  }, [showToast]);

  const handleProcess = useCallback(async () => {
    if (!inputText.trim()) {
      showToast({ message: '❌ Please enter or upload text', type: 'error' });
      return;
    }

    try {
      const result = await processText.mutateAsync({
        text: inputText,
        pointsPerHeading: pointsPerCycle,
        removeDuplicates,
      });

      if (result && result.processed_text) {
        onComplete(result.processed_text);
      } else {
        showToast({ message: '❌ Processing failed', type: 'error' });
      }
    } catch (error) {
      showToast({
        message: `❌ Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
        type: 'error',
      });
    }
  }, [inputText, pointsPerCycle, removeDuplicates, processText, onComplete, showToast]);

  const charCount = inputText.length;
  const wordCount = inputText.trim().split(/\s+/).filter((w) => w.length > 0).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Configuration Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Points Per Cycle
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={pointsPerCycle}
            onChange={(e) => setPointsPerCycle(Math.min(10, Math.max(1, parseInt(e.target.value) || 2)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Extract N points per heading</p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            <input
              type="checkbox"
              checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              🔍 Remove Duplicate Points
            </span>
          </label>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Remove exact duplicate points within cycles
          </p>
        </div>
      </div>

      {/* Help Text */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>📝 Format:</strong> Enter text with headings followed by bullet points (using •, -, or *)
        </p>
      </div>

      {/* Input Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Enter or Upload Text
          </label>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {charCount} chars • {wordCount} words
          </div>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative p-4 border-2 border-dashed rounded-lg transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          <div className="flex flex-col items-center gap-2 py-2">
            <Upload className="w-6 h-6 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag and drop a .txt file here, or click to browse
            </p>
          </div>

          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>

        {/* Text Area */}
        <textarea
          value={inputText}
          onChange={handleTextChange}
          placeholder="Paste your text here or upload a file...

Example format:
Executive Leadership
• Led teams successfully
• Implemented methodologies

Technical Skills
• Designed architecture
• Optimized performance"
          className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          rows={14}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleLoadSample}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          📋 Load Sample
        </button>

        <button
          onClick={() => setInputText('')}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          🗑️ Clear
        </button>

        <button
          onClick={() => {
            navigator.clipboard.readText().then((text) => {
              setInputText(text);
              showToast({ message: '✓ Pasted from clipboard!', type: 'success' });
            });
          }}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          Paste
        </button>

        <button
          onClick={handleProcess}
          disabled={processText.isPending || !inputText.trim()}
          className="flex-1 px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
        >
          {processText.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Extract Cycles
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <strong>⚡ What happens next:</strong> Your text will be processed into cycles with the
          configured points per heading. Then you can export or proceed to bookmark mapping.
        </p>
      </div>
    </div>
  );
};
