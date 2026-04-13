/**
 * Text Processor Modal Component
 * Integrates Streamlit text processing functionality into NRE OneHub
 * Can be triggered from document management or as a standalone feature
 */

import React, { useState } from 'react';
import { X, Loader2, Download, Copy, Check } from 'lucide-react';
import { useProcessText, useExportFile } from '@/hooks/useTextProcessor';

interface TextProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProcessComplete?: (text: string) => void;
  initialText?: string;
}

export const TextProcessorModal: React.FC<TextProcessorModalProps> = ({
  isOpen,
  onClose,
  onProcessComplete,
  initialText = '',
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [pointsPerHeading, setPointsPerHeading] = useState(2);
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [copied, setCopied] = useState(false);

  const processTextMutation = useProcessText();
  const exportFileMutation = useExportFile();

  const handleProcess = async () => {
    await processTextMutation.mutateAsync({
      text: inputText,
      pointsPerHeading,
      removeDuplicates,
    });
  };

  const handleCopy = async () => {
    if (processTextMutation.data?.processed_text) {
      await navigator.clipboard.writeText(processTextMutation.data.processed_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (processTextMutation.data?.processed_text) {
      await exportFileMutation.mutateAsync({
        text: processTextMutation.data.processed_text,
        format,
      });
    }
  };

  const handleClose = () => {
    if (processTextMutation.data?.processed_text && onProcessComplete) {
      onProcessComplete(processTextMutation.data.processed_text);
    }
    setInputText(initialText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1400] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-slate-900">📝 Text Processor</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Input Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Structured Text
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your text with headings and bullet points..."
              className="w-full h-48 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-slate-500">
              Format: Headings followed by bullet points (• or -)
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Points per Heading
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={pointsPerHeading}
                onChange={(e) => setPointsPerHeading(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeDuplicates}
                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-slate-700">Remove Duplicates</span>
              </label>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleProcess}
                disabled={!inputText.trim() || processTextMutation.isPending}
                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg transition font-medium flex items-center justify-center gap-2"
              >
                {processTextMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    🔄 Process
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {processTextMutation.error && (
            <div className="p-4 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
              {processTextMutation.error instanceof Error
                ? processTextMutation.error.message
                : 'An error occurred'}
            </div>
          )}

          {/* Results */}
          {processTextMutation.data?.processed_text && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ✅ Processed Output
                </label>
                <textarea
                  value={processTextMutation.data.processed_text}
                  readOnly
                  className="w-full h-48 p-3 border border-slate-200 rounded-lg bg-slate-50 text-sm font-mono resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {processTextMutation.data.char_count} characters
                </p>
              </div>

              {/* Export Options */}
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleExport('docx')}
                  disabled={exportFileMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg transition"
                >
                  {exportFileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  DOCX
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportFileMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white rounded-lg transition"
                >
                  {exportFileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t bg-slate-50">
          <button
            onClick={() => {
              setInputText(initialText);
              processTextMutation.reset();
            }}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Clear
          </button>
          <div className="flex-1" />
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition"
          >
            {processTextMutation.data?.processed_text ? 'Use & Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextProcessorModal;
