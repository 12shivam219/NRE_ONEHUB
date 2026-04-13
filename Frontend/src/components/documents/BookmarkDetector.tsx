/**
 * Bookmark Detector Component
 * Shows detected template bookmarks in the resume
 */

import React from 'react';
import { BookmarkIcon, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface DetectedBookmark {
  name: string;
  placeholder: string;
  line: number;
  status: 'empty' | 'has-content' | 'filled';
}

interface BookmarkDetectorProps {
  bookmarks: DetectedBookmark[];
  loading?: boolean;
  onSelectBookmark?: (bookmark: DetectedBookmark) => void;
  selectedBookmark?: DetectedBookmark | null;
}

export const BookmarkDetector: React.FC<BookmarkDetectorProps> = ({
  bookmarks,
  loading = false,
  onSelectBookmark,
  selectedBookmark,
}) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">No bookmarks detected</p>
          <p className="text-xs text-amber-700 dark:text-amber-200 mt-1">
            Your resume might not have template placeholders. You can manually add content.
          </p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    empty: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    'has-content': { icon: BookmarkIcon, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    filled: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {bookmarks.length} Bookmark{bookmarks.length !== 1 ? 's' : ''} Found
      </p>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {bookmarks.map((bookmark, idx) => {
          const config = statusConfig[bookmark.status];
          const Icon = config.icon;
          const isSelected = selectedBookmark?.placeholder === bookmark.placeholder;

          return (
            <button
              key={idx}
              onClick={() => onSelectBookmark?.(bookmark)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 transition ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                  : `border-gray-200 dark:border-gray-700 ${config.bg} hover:border-gray-300 dark:hover:border-gray-600`
              }`}
            >
              <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{bookmark.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                  {bookmark.placeholder}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Line {bookmark.line}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
