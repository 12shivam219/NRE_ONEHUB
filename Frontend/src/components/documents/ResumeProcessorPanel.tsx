/**
 * Resume Processor Panel Component
 * Main wrapper for the smart resume editor with Streamlit-aligned bookmark workflow
 * Matches Streamlit's: Upload → Detect → Add Text → Map Cycles → Inject workflow
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, Loader2, Download, ArrowRight } from 'lucide-react';
import { ResumeUploadZone } from './ResumeUploadZone';
import { useDetectBookmarks, useInjectResume } from '@/hooks/useTextProcessor';
import { useToast } from '@/contexts/ToastContext';

interface ResumeProcessorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type PanelStep = 'upload-resume' | 'detecting' | 'upload-text' | 'mapping' | 'injecting' | 'complete';

// Inner component that uses hooks - only rendered when modal is open
const ResumeProcessorContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState<PanelStep>('upload-resume');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [detectedBookmarks, setDetectedBookmarks] = useState<string[]>([]);
  const [processedText, setProcessedText] = useState<string>('');
  const [customMapping, setCustomMapping] = useState<Record<number, string>>({});
  const [downloadedFile, setDownloadedFile] = useState<Blob | null>(null);
  const { showToast } = useToast();
  const detectBookmarks = useDetectBookmarks();
  const injectResume = useInjectResume();

  // Helper: Extract cycles from processed text
  const extractCycles = useCallback((text: string): number => {
    const cycleMatches = text.match(/Cycle\s+(\d+):/gi);
    if (!cycleMatches) return 0;
    const cycleNums = cycleMatches.map((m) => {
      const num = m.match(/\d+/);
      return num ? parseInt(num[0], 10) : 0;
    });
    return Math.max(...cycleNums, 0);
  }, []);

  // Helper: Auto-suggest cycle-to-bookmark mapping
  const suggestMapping = useCallback(
    (bookmarks: string[], numCycles: number): Record<number, string> => {
      const mapping: Record<number, string> = {};
      for (let i = 1; i <= numCycles && i <= bookmarks.length; i++) {
        mapping[i] = bookmarks[i - 1];
      }
      return mapping;
    },
    []
  );

  // Handle close
  const handleClose = useCallback(() => {
    setStep('upload-resume');
    setResumeFile(null);
    setDetectedBookmarks([]);
    setProcessedText('');
    setCustomMapping({});
    setDownloadedFile(null);
    onClose();
  }, [onClose]);

  // Handle resume file selection
  const handleResumeSelect = useCallback(
    async (file: File) => {
      if (detectBookmarks.isPending) {
        showToast({ message: 'Detection already in progress', type: 'warning' });
        return;
      }

      setResumeFile(file);
      setStep('detecting');

      try {
        const result = await detectBookmarks.mutateAsync(file);
        
        if (result?.bookmarks && Array.isArray(result.bookmarks) && result.bookmarks.length > 0) {
          const bookmarks = result.bookmarks.map((bm: any) => (typeof bm === 'string' ? bm : bm.name || String(bm)));
          setDetectedBookmarks(bookmarks);
          setCustomMapping({});
          setProcessedText('');
          setStep('upload-text');
          showToast({ message: `✅ Found ${bookmarks.length} bookmark(s)`, type: 'success' });
        } else {
          setDetectedBookmarks([]);
          setStep('upload-resume');
          showToast({ message: '⚠️ No bookmarks found. Add bookmarks to your resume first.', type: 'warning' });
        }
      } catch (error) {
        setResumeFile(null);
        setStep('upload-resume');
        showToast({
          message: `Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error',
        });
      }
    },
    [detectBookmarks, showToast]
  );

  // Handle resume text upload/paste
  const handleTextProvide = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        showToast({ message: 'Please provide processed text', type: 'warning' });
        return;
      }

      const numCycles = extractCycles(trimmed);
      if (numCycles === 0) {
        showToast({ message: 'No cycles found. Expected format: "Cycle 1: • point • point"', type: 'error' });
        return;
      }

      setProcessedText(trimmed);
      const suggested = suggestMapping(detectedBookmarks, numCycles);
      setCustomMapping(suggested);
      setStep('mapping');
      showToast({ message: `✅ Found ${numCycles} cycle(s). Review the mapping below.`, type: 'success' });
    },
    [detectedBookmarks, extractCycles, suggestMapping, showToast]
  );

  // Handle mapping update
  const handleMappingUpdate = useCallback((cycleNum: number, bookmarkName: string) => {
    setCustomMapping((prev) => ({
      ...prev,
      [cycleNum]: bookmarkName,
    }));
  }, []);

  // Handle injection
  const handleInject = useCallback(async () => {
    if (!resumeFile || !processedText) {
      showToast({ message: 'Missing resume or text', type: 'error' });
      return;
    }

    setStep('injecting');

    try {
      const result = await injectResume.mutateAsync({
        resumeFile,
        processedText,
        mapping: customMapping,
      });

      if (result) {
        setDownloadedFile(result);
        setStep('complete');
        showToast({ message: '✅ Resume updated successfully!', type: 'success' });
      }
    } catch (error) {
      setStep('mapping');
      showToast({
        message: `Injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    }
  }, [resumeFile, processedText, customMapping, injectResume, showToast]);

  // Computed values
  const numCycles = useMemo(() => extractCycles(processedText), [processedText, extractCycles]);
  const hasMismatch = numCycles !== detectedBookmarks.length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🎯 Smart Resume Editor</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Inject processed content into your resume using Word bookmarks
          </p>
        </div>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
        >
          <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Progress Steps */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex gap-2 text-xs font-medium">
          <span className={`px-3 py-1 rounded-full ${!['upload-resume', 'detecting'].includes(step) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            ✓ Resume
          </span>
          <span className={`px-3 py-1 rounded-full ${step !== 'upload-resume' && step !== 'detecting' ? (step !== 'upload-text' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400') : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {step === 'upload-text' || step === 'mapping' || step === 'injecting' || step === 'complete' ? '✓' : '2'} Text
          </span>
          <span className={`px-3 py-1 rounded-full ${step === 'mapping' || step === 'injecting' || step === 'complete' ? (step !== 'mapping' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400') : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {step === 'injecting' || step === 'complete' ? '✓' : '3'} Map
          </span>
          <span className={`px-3 py-1 rounded-full ${step === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : step === 'injecting' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {step === 'complete' ? '✓' : '4'} Download
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Step 1: Upload Resume */}
        {step === 'upload-resume' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Step 1: Upload Resume</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Upload a .docx file with Word bookmarks. The app will auto-detect all bookmarks.
              </p>

              {/* Info box */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">📌 What are bookmarks?</p>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  Bookmarks are named sections in Word. You can create ANY custom names:
                </p>
                <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 ml-3 list-disc">
                  <li>First_Company, Second_Company, Third_Company</li>
                  <li>Education, Skills, Projects (or any names you like)</li>
                </ul>
                <a href="/sample-resume-template.md" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-block mt-2">
                  📖 Bookmark setup guide →
                </a>
              </div>
            </div>

            <ResumeUploadZone 
              onFileSelect={handleResumeSelect}
              onTextPaste={() => {}}
              loading={detectBookmarks.isPending}
            />
          </div>
        )}

        {/* Step 1: Detecting */}
        {step === 'detecting' && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            <p className="text-lg font-medium text-gray-900 dark:text-white">Detecting bookmarks...</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Analyzing your resume</p>
          </div>
        )}

        {/* Step 2: Upload Processed Text */}
        {step === 'upload-text' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Step 2: Provide Processed Text</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Paste text processed with cycles (from Tab 1 or your processed output).
              </p>

              {/* Bookmarks info */}
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">✅ Detected {detectedBookmarks.length} bookmark(s)</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {detectedBookmarks.map((bm, idx) => (
                    <span key={idx} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                      {bm}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Processed Text
              </label>
              <textarea
                value={processedText}
                onChange={(e) => setProcessedText(e.target.value)}
                placeholder={`Paste your processed text here. Expected format:\n\nCycle 1:\n• Point 1\n• Point 2\n\nCycle 2:\n• Point A\n• Point B`}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={12}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Use Tab 1 to process text and get output formatted with cycles
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDetectedBookmarks([]);
                  setStep('upload-resume');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                ← Back
              </button>
              <button
                onClick={() => handleTextProvide(processedText)}
                disabled={!processedText.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Continue → Map Cycles
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Mapping */}
        {step === 'mapping' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Step 3: Cycle-to-Bookmark Mapping</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Each cycle will be injected into the corresponding bookmark.
              </p>
            </div>

            {/* Mismatch warning */}
            {hasMismatch && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
                  ⚠️ Mismatch: {numCycles} cycles vs {detectedBookmarks.length} bookmarks
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-200">
                  {numCycles < detectedBookmarks.length
                    ? `First ${numCycles} bookmark(s) will be filled. Others keep original content.`
                    : `Only first ${detectedBookmarks.length} cycle(s) can be injected.`}
                </p>
              </div>
            )}

            {/* Mapping table */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Customize mapping (optional):</p>
              {Array.from({ length: numCycles }, (_, i) => i + 1).map((cycleNum) => (
                <div key={cycleNum} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-20">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Cycle {cycleNum}</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <select
                    value={customMapping[cycleNum] || ''}
                    onChange={(e) => handleMappingUpdate(cycleNum, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select bookmark...</option>
                    {detectedBookmarks.map((bm) => (
                      <option key={bm} value={bm}>
                        {bm}
                      </option>
                    ))}
                  </select>
                  <div className="flex-shrink-0 min-w-fit">
                    <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                      ✓ {customMapping[cycleNum]}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Unused bookmarks */}
            {hasMismatch && numCycles < detectedBookmarks.length && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                <p className="font-medium mb-1">Bookmarks without cycles (will keep original content):</p>
                <div className="flex flex-wrap gap-1">
                  {detectedBookmarks
                    .filter((bm) => !Object.values(customMapping).includes(bm))
                    .map((bm) => (
                      <span key={bm} className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                        {bm}
                      </span>
                    ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('upload-text')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                ← Back
              </button>
              <button
                onClick={handleInject}
                disabled={injectResume.isPending || Object.keys(customMapping).length === 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {injectResume.isPending ? '⏳ Injecting...' : '✨ Inject into Resume'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Injecting */}
        {step === 'injecting' && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="w-12 h-12 animate-spin text-green-500" />
            <p className="text-lg font-medium text-gray-900 dark:text-white">Injecting content...</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Processing your resume</p>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <div className="max-w-2xl mx-auto space-y-6 flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-4xl">✅</span>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Complete!</h3>
              <p className="text-gray-600 dark:text-gray-400">Your resume has been updated with injected content.</p>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (downloadedFile) {
                    const url = URL.createObjectURL(downloadedFile);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'Resume_Updated.docx';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }
                }}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export const ResumeProcessorPanel: React.FC<ResumeProcessorPanelProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden flex flex-col">
        <ResumeProcessorContent onClose={onClose} />
      </div>
    </div>
  );
};
