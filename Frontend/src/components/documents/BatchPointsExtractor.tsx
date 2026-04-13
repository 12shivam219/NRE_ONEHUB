/**
 * Batch Points Extractor Component
 * Handles batch file extraction (paste mode & upload mode)
 */

import React, { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { useProcessText } from '@/hooks/useTextProcessor';
import { useToast } from '@/contexts/ToastContext';

interface BatchPointsExtractorProps {
  onComplete: (files: Record<string, string>) => void;
}

type BatchMode = 'paste' | 'upload';
type ProcessingStatus = 'idle' | 'processing' | 'completed';

export const BatchPointsExtractor: React.FC<BatchPointsExtractorProps> = ({ onComplete }) => {
  const [batchMode, setBatchMode] = useState<BatchMode>('paste');
  const [pasteText, setPasteText] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [pointsPerCycle, setPointsPerCycle] = useState<number>(2);
  const [removeDuplicates, setRemoveDuplicates] = useState<boolean>(false);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const { showToast } = useToast();
  const processText = useProcessText();

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

    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'text/plain');
    if (files.length === 0) {
      showToast({ message: '❌ Please drag .txt files only', type: 'error' });
      return;
    }

    setUploadedFiles((prev) => [...prev, ...files]);
    showToast({ message: `✓ Added ${files.length} file(s)!`, type: 'success' });
  }, [showToast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    if (files.length > 0) {
      setUploadedFiles((prev) => [...prev, ...files]);
      showToast({ message: `✓ Added ${files.length} file(s)!`, type: 'success' });
    }
  }, [showToast]);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleProcessPaste = useCallback(async () => {
    if (!pasteText.trim()) {
      showToast({ message: '❌ Please paste text with --- separator', type: 'error' });
      return;
    }

    // Split by ---
    const texts = pasteText
      .split('\n---\n')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (texts.length === 0) {
      showToast({
        message: '❌ No text sections found. Use --- to separate multiple texts.',
        type: 'error',
      });
      return;
    }

    setStatus('processing');
    const results: Record<string, string> = {};
    let completed = 0;

    try {
      for (let i = 0; i < texts.length; i++) {
        const result = await processText.mutateAsync({
          text: texts[i],
          pointsPerHeading: pointsPerCycle,
          removeDuplicates,
        });

        if (result && result.processed_text) {
          results[`text_${i + 1}.txt`] = result.processed_text;
        }

        completed++;
        setProgress(Math.round((completed / texts.length) * 100));
      }

      if (Object.keys(results).length > 0) {
        onComplete(results);
        setStatus('completed');
      } else {
        showToast({ message: '❌ No files were processed successfully', type: 'error' });
        setStatus('idle');
      }
    } catch (error) {
      showToast({
        message: `❌ Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
        type: 'error',
      });
      setStatus('idle');
    }
  }, [pasteText, pointsPerCycle, removeDuplicates, processText, onComplete, showToast]);

  const handleProcessFiles = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      showToast({ message: '❌ Please upload files', type: 'error' });
      return;
    }

    setStatus('processing');
    const results: Record<string, string> = {};
    let completed = 0;

    try {
      for (const file of uploadedFiles) {
        const content = await file.text();
        const result = await processText.mutateAsync({
          text: content,
          pointsPerHeading: pointsPerCycle,
          removeDuplicates,
        });

        if (result && result.processed_text) {
          results[file.name] = result.processed_text;
        }

        completed++;
        setProgress(Math.round((completed / uploadedFiles.length) * 100));
      }

      if (Object.keys(results).length > 0) {
        onComplete(results);
        setStatus('completed');
      } else {
        showToast({ message: '❌ No files were processed successfully', type: 'error' });
        setStatus('idle');
      }
    } catch (error) {
      showToast({
        message: `❌ Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
        type: 'error',
      });
      setStatus('idle');
    }
  }, [uploadedFiles, pointsPerCycle, removeDuplicates, processText, onComplete, showToast]);

  const handleClear = useCallback(() => {
    setPasteText('');
    setUploadedFiles([]);
    setProgress(0);
    setStatus('idle');
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setBatchMode('paste')}
          className={`px-4 py-2 font-medium transition-colors ${
            batchMode === 'paste'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          📝 Paste & Separate
        </button>
        <button
          onClick={() => setBatchMode('upload')}
          className={`px-4 py-2 font-medium transition-colors ${
            batchMode === 'upload'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          📁 Upload Files
        </button>
      </div>

      {/* Configuration */}
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
        </div>
      </div>

      {/* Paste Mode */}
      {batchMode === 'paste' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>💡 Tip:</strong> Paste multiple texts separated by <code>---</code> on its own line
            </p>
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Text 1:
Executive Leadership
• Led teams successfully
• Managed budgets

---

Text 2:
Technical Skills
• Designed systems
• Optimized performance`}
            className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            rows={14}
          />

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              🗑️ Clear
            </button>

            <button
              onClick={handleProcessPaste}
              disabled={status === 'processing' || !pasteText.trim()}
              className="flex-1 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing ({progress}%)...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Process All
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Upload Mode */}
      {batchMode === 'upload' && (
        <div className="space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative p-8 border-2 border-dashed rounded-lg transition-colors text-center ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Drag & drop .txt files here
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">or click to browse</p>
            </div>

            <input
              type="file"
              accept=".txt"
              multiple
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {uploadedFiles.length} file(s) added
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-900 dark:text-white truncate">{file.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              🗑️ Clear All
            </button>

            <button
              onClick={handleProcessFiles}
              disabled={status === 'processing' || uploadedFiles.length === 0}
              className="flex-1 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing ({progress}%)...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Process All
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <strong>⚡ Batch Processing:</strong> Each text/file will be processed separately into cycles,
          then you can export all results together as a ZIP file.
        </p>
      </div>
    </div>
  );
};
