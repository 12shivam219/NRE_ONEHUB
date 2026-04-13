/**
 * Resume Points Extractor Modal Component
 * Allows users to extract cycles from text (Single & Batch modes)
 * Features: Text area, file upload, batch processing, exports (DOCX/PDF/ZIP)
 */

import React, { useState, useCallback } from 'react';
import { X, Download, Copy } from 'lucide-react';
import { SinglePointsExtractor } from './SinglePointsExtractor';
import { BatchPointsExtractor } from './BatchPointsExtractor';
import { useToast } from '@/contexts/ToastContext';

interface ResumePointsExtractorProps {
  isOpen: boolean;
  onClose: () => void;
  onExtractComplete?: (cyclesText: string) => void; // For proceeding to bookmark mapping
}

type ExtractorMode = 'single' | 'batch';
type ExtractorStep = 'mode-select' | 'input' | 'results' | 'complete';

export const ResumePointsExtractor: React.FC<ResumePointsExtractorProps> = ({
  isOpen,
  onClose,
  onExtractComplete,
}) => {
  const [mode, setMode] = useState<ExtractorMode>('single');
  const [step, setStep] = useState<ExtractorStep>('mode-select');
  const [extractedText, setExtractedText] = useState<string>('');
  const [extractedFiles, setExtractedFiles] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const handleClose = useCallback(() => {
    setMode('single');
    setStep('mode-select');
    setExtractedText('');
    setExtractedFiles({});
    onClose();
  }, [onClose]);

  const handleModeSelect = useCallback((selectedMode: ExtractorMode) => {
    setMode(selectedMode);
    setStep('input');
  }, []);

  const handleSingleComplete = useCallback((cyclesText: string) => {
    setExtractedText(cyclesText);
    setStep('results');
    showToast({ message: '✅ Points extracted successfully!', type: 'success' });
  }, [showToast]);

  const handleBatchComplete = useCallback((files: Record<string, string>) => {
    setExtractedFiles(files);
    setStep('results');
    showToast({ message: `✅ Extracted ${Object.keys(files).length} file(s)!`, type: 'success' });
  }, [showToast]);

  const handleProceedToMapping = useCallback(() => {
    const textToUse = mode === 'single' ? extractedText : Object.values(extractedFiles).join('\n\n');
    if (onExtractComplete) {
      onExtractComplete(textToUse);
      handleClose();
    }
  }, [mode, extractedText, extractedFiles, onExtractComplete, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1400] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🚀 Extract Points</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Generate cycles from your content for resume injection
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition"
          >
            <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex gap-2 text-xs font-medium">
            <span
              className={`px-3 py-1 rounded-full ${
                step !== 'mode-select' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}
            >
              {step !== 'mode-select' ? '✓' : '1'} Mode
            </span>
            <span
              className={`px-3 py-1 rounded-full ${
                step === 'mode-select' ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : step !== 'input' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}
            >
              {step === 'results' || step === 'complete' ? '✓' : '2'} Extract
            </span>
            <span
              className={`px-3 py-1 rounded-full ${
                step !== 'results' && step !== 'complete' ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : step === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}
            >
              {step === 'complete' ? '✓' : '3'} Results
            </span>
            <span
              className={`px-3 py-1 rounded-full ${
                step === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              4 Export
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Mode Selection */}
          {step === 'mode-select' && (
            <div className="max-w-3xl mx-auto space-y-6 py-8">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                  Choose Extraction Mode
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Single File Option */}
                  <button
                    onClick={() => handleModeSelect('single')}
                    className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
                  >
                    <div className="text-2xl mb-2">📄</div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                      Single File
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Extract cycles from one text or file. Perfect for processing a single set of
                      content.
                    </p>
                    <ul className="mt-4 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <li>✓ Text area input</li>
                      <li>✓ File upload (.txt)</li>
                      <li>✓ Configurable settings</li>
                    </ul>
                  </button>

                  {/* Batch Files Option */}
                  <button
                    onClick={() => handleModeSelect('batch')}
                    className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all text-left"
                  >
                    <div className="text-2xl mb-2">📦</div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                      Batch Files
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Extract cycles from multiple files at once. Great for processing bulk content.
                    </p>
                    <ul className="mt-4 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <li>✓ Paste & separate mode</li>
                      <li>✓ Multiple file upload</li>
                      <li>✓ ZIP bulk download</li>
                    </ul>
                  </button>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>💡 Tip:</strong> Choose Single for one piece of content, or Batch to process
                  multiple files and download all results in a ZIP file.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Input & Processing */}
          {step === 'input' && mode === 'single' && (
            <SinglePointsExtractor onComplete={handleSingleComplete} />
          )}

          {step === 'input' && mode === 'batch' && (
            <BatchPointsExtractor onComplete={handleBatchComplete} />
          )}

          {/* Step 3: Results & Options */}
          {step === 'results' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  ✅ Extraction Complete
                </h3>

                {mode === 'single' && (
                  <div className="space-y-4">
                    {/* Results Preview */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                        Preview (First 500 chars):
                      </p>
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300 font-mono">
                          {extractedText.substring(0, 500)}
                          {extractedText.length > 500 ? '...' : ''}
                        </pre>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(extractedText);
                          showToast({ message: '✓ Copied to clipboard!', type: 'success' });
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center justify-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Text
                      </button>
                      <a
                        href={`data:text/plain,${encodeURIComponent(extractedText)}`}
                        download="extracted_points.txt"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download TXT
                      </a>
                      <button
                        onClick={() => setStep('complete')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export More
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'batch' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {Object.keys(extractedFiles).length} file(s) processed
                    </p>
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {Object.entries(extractedFiles).map(([filename, content]) => (
                        <div
                          key={filename}
                          className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {filename}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {content.split('\n').length} lines
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Workflow Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">What's next?</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setStep('complete')}
                    className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    📥 Continue to Export
                  </button>
                  {onExtractComplete && (
                    <button
                      onClick={handleProceedToMapping}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                    >
                      🎯 Proceed to Bookmark Mapping
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Export Options */}
          {step === 'complete' && (
            <div className="max-w-2xl mx-auto space-y-6 py-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">✅</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Ready to Export
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose how you want to download your extracted points
                </p>
              </div>

              <div className="space-y-3">
                {mode === 'single' && (
                  <>
                    <ExportButton
                      label="Download as TEXT"
                      description="Plain text format (.txt)"
                      icon="📄"
                      href={`data:text/plain,${encodeURIComponent(extractedText)}`}
                      filename="extracted_points.txt"
                    />
                    <ExportButton
                      label="Download as DOCX"
                      description="Microsoft Word format"
                      icon="📘"
                      onClick={() => {
                        // Trigger DOCX export
                        showToast({ message: 'DOCX export coming soon!', type: 'info' });
                      }}
                    />
                    <ExportButton
                      label="Download as PDF"
                      description="Portable PDF format"
                      icon="📕"
                      onClick={() => {
                        // Trigger PDF export
                        showToast({ message: 'PDF export coming soon!', type: 'info' });
                      }}
                    />
                  </>
                )}

                {mode === 'batch' && (
                  <>
                    <ExportButton
                      label="Download as ZIP"
                      description="All files in one ZIP"
                      icon="📦"
                      onClick={() => {
                        // Trigger ZIP export
                        showToast({ message: 'ZIP export coming soon!', type: 'info' });
                      }}
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('results')}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition font-medium"
                >
                  ← Back
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 bg-gray-800 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Export Button Component
 */
interface ExportButtonProps {
  label: string;
  description: string;
  icon: string;
  href?: string;
  filename?: string;
  onClick?: () => void;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  label,
  description,
  icon,
  href,
  filename,
  onClick,
}) => {
  if (href) {
    return (
      <a
        href={href}
        download={filename}
        className="block p-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div className="flex-1 text-left">
            <p className="font-medium text-gray-900 dark:text-white">{label}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>
          <Download className="w-5 h-5 text-gray-400" />
        </div>
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-white">{label}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        <Download className="w-5 h-5 text-gray-400" />
      </div>
    </button>
  );
};
