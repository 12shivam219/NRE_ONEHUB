/**
 * Resume Upload Zone Component
 * Drag-drop file upload with paste support
 */

import React, { useCallback } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface ResumeUploadZoneProps {
  onFileSelect: (file: File) => void;
  onTextPaste: (text: string) => void;
  loading?: boolean;
}

export const ResumeUploadZone: React.FC<ResumeUploadZoneProps> = ({
  onFileSelect,
  onTextPaste,
  loading = false,
}) => {
  const { showToast } = useToast();
  const [dragOver, setDragOver] = React.useState(false);
  const [pastedText, setPastedText] = React.useState('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.type === 'application/msword' ||
          file.type === 'text/plain') {
        onFileSelect(file);
      } else {
        showToast({
          message: 'Please upload a DOCX, DOC, or TXT file',
          type: 'error',
        });
      }
    }
  }, [onFileSelect, showToast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handlePasteSubmit = useCallback(() => {
    if (pastedText.trim().length < 50) {
      showToast({
        message: 'Please paste at least 50 characters of resume text',
        type: 'warning',
      });
      return;
    }
    onTextPaste(pastedText);
    setPastedText('');
  }, [pastedText, onTextPaste, showToast]);

  return (
    <div className="space-y-4">
      {/* Drag Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
        }`}
      >
        <FileUp className={`w-12 h-12 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="font-medium text-gray-900 dark:text-white mb-1">Drop your resume here</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">or</p>
        <label>
          <input
            type="file"
            onChange={handleFileInput}
            accept=".docx,.doc,.txt"
            disabled={loading}
            className="hidden"
          />
          <span className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 cursor-pointer">
            Browse Files
          </span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">DOCX, DOC, or TXT files supported</p>
      </div>

      {/* Paste Text Zone */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Or paste resume text directly
        </label>
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste your resume content here..."
          className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white resize-none"
          disabled={loading}
        />
        <button
          onClick={handlePasteSubmit}
          disabled={loading || !pastedText.trim()}
          className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Use Pasted Text
        </button>
      </div>
    </div>
  );
};
