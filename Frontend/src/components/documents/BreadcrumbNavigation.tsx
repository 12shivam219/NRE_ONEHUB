import React, { memo } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import type { Database } from '../../lib/database.types';

type Folder = Database['public']['Tables']['folders']['Row'];

interface BreadcrumbNavigationProps {
  path: Folder[]; // Current folder path from root to current
  onNavigate: (folderId: string | null) => void;
  currentFolderId: string | null;
}

export const BreadcrumbNavigation = memo(
  ({ path, onNavigate, currentFolderId }: BreadcrumbNavigationProps) => {
    if (!path || path.length === 0) {
      return (
        <div className="flex items-center gap-2 py-1 text-sm text-slate-700">
          <button
            onClick={() => onNavigate(null)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
              currentFolderId === null
                ? 'border-blue-200 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Home className="h-4 w-4" />
            <span>My Documents</span>
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 overflow-x-auto py-1 pb-2 text-sm text-slate-700 [scrollbar-width:none]">
        <button
          onClick={() => onNavigate(null)}
          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 transition ${
            currentFolderId === null
              ? 'border-blue-200 bg-blue-50 text-blue-700 font-semibold shadow-sm'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Home className="h-4 w-4 flex-shrink-0" />
          <span>My Documents</span>
        </button>

        {path.map((folder, _index) => (
          <React.Fragment key={folder.id}>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <button
              onClick={() => onNavigate(folder.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 transition ${
                currentFolderId === folder.id
                  ? 'border-blue-200 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </div>
    );
  }
);

BreadcrumbNavigation.displayName = 'BreadcrumbNavigation';
