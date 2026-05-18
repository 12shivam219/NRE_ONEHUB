import {
  useEffect,
  useCallback,
  useMemo,
  memo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  Edit,
  Copy,
  ClipboardPaste,
  Cloud,
  Eye,
  MoreVertical,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  uploadDocument,
  deleteDocument,
  downloadDocument,
  duplicateDocumentToFolder,
  saveDocumentToApp,
  saveDocumentToAppFolder,
} from "../../lib/api/documents";
import { moveToFolder } from "../../lib/api/folders";
import type { Database } from "../../lib/database.types";
import { debounce, formatFileSize } from "../../lib/utils";
import { getRelativeTime } from "../../lib/dateFormatter";
import { useToast } from "../../contexts/ToastContext";
import { useDocumentsInfinite } from "../../hooks/useDocumentsInfinite";
import { useFolders } from "../../hooks/useFolders";
import { CreateFolderModal } from "./CreateFolderModal";
import { FolderSidebar } from "./FolderSidebar";
import { ResumeProcessorPanel } from "./ResumeProcessorPanel";
import { ResumePointsExtractor } from "./ResumePointsExtractor";
import { TrashView } from "./TrashView";
import { FolderPlus } from "lucide-react";
import { lazy, Suspense } from "react";

const editorPromise = () =>
  import("./DocumentEditor").then((module) => ({
    default: module.DocumentEditor,
  }));
const DocumentEditor = lazy(editorPromise);
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DownloadOptionsModal } from "./DownloadOptionsModal";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { useMediaQuery, useTheme } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";

type Document = Database["public"]["Tables"]["documents"]["Row"];
type DocumentFolder = Database["public"]["Tables"]["folders"]["Row"];

type UIState = {
  uploading: boolean;
  selectedDocs: Set<string>;
  searchValue: string;
  isEditorOpen: boolean;
  documentsToEdit: Document[];
  showGoogleDrive: boolean;
  uploadProgress: Record<string, number>;
  selectedDocumentPreview: Document | null;
  documentToDelete: string | null;
  showDeleteConfirm: boolean;
  bulkDeleteMode: boolean;
  deletingInProgress: boolean;
  showCreateFolderModal: boolean;
  showDownloadOptions: boolean;
  documentToDownload: Document | null;
  copiedDocument: Document | null;
  showResumeProcessor: boolean;
  showPointsExtractor: boolean;
};

type UIAction =
  | { type: "setUploading"; value: boolean }
  | { type: "toggleSelectedDoc"; docId: string }
  | { type: "removeSelectedDoc"; docId: string }
  | { type: "selectAllDocs"; docIds: string[] }
  | { type: "clearSelection" }
  | { type: "setSearchValue"; value: string }
  | { type: "openEditor"; documents: Document[] }
  | { type: "closeEditor" }
  | { type: "setShowGoogleDrive"; value: boolean }
  | { type: "setUploadProgress"; value: Record<string, number> }
  | { type: "setSelectedDocumentPreview"; value: Document | null }
  | { type: "openDeleteConfirm"; documentId: string }
  | { type: "closeDeleteConfirm" }
  | { type: "openBulkDeleteConfirm" }
  | { type: "closeBulkDeleteConfirm" }
  | { type: "setDeletingInProgress"; value: boolean }
  | { type: "setShowCreateFolderModal"; value: boolean }
  | { type: "openDownloadOptions"; document: Document }
  | { type: "closeDownloadOptions" }
  | { type: "setCopiedDocument"; document: Document | null }
  | { type: "setShowResumeProcessor"; value: boolean }
  | { type: "setShowPointsExtractor"; value: boolean };

const initialUIState: UIState = {
  uploading: false,
  selectedDocs: new Set<string>(),
  searchValue: "",
  isEditorOpen: false,
  documentsToEdit: [],
  showGoogleDrive: false,
  uploadProgress: {},
  selectedDocumentPreview: null,
  documentToDelete: null,
  showDeleteConfirm: false,
  bulkDeleteMode: false,
  deletingInProgress: false,
  showCreateFolderModal: false,
  showDownloadOptions: false,
  documentToDownload: null,
  copiedDocument: null,
  showResumeProcessor: false,
  showPointsExtractor: false,
};

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "setUploading":
      return { ...state, uploading: action.value };
    case "toggleSelectedDoc": {
      const next = new Set(state.selectedDocs);
      if (next.has(action.docId)) next.delete(action.docId);
      else next.add(action.docId);
      return { ...state, selectedDocs: next };
    }
    case "removeSelectedDoc": {
      if (!state.selectedDocs.has(action.docId)) return state;
      const next = new Set(state.selectedDocs);
      next.delete(action.docId);
      return { ...state, selectedDocs: next };
    }
    case "clearSelection":
      return { ...state, selectedDocs: new Set<string>() };
    case "setSearchValue":
      return { ...state, searchValue: action.value };
    case "openEditor":
      return {
        ...state,
        isEditorOpen: true,
        documentsToEdit: action.documents,
      };
    case "closeEditor":
      return { ...state, isEditorOpen: false, documentsToEdit: [] };
    case "setShowGoogleDrive":
      return { ...state, showGoogleDrive: action.value };
    case "setUploadProgress":
      return { ...state, uploadProgress: action.value };
    case "setSelectedDocumentPreview":
      return { ...state, selectedDocumentPreview: action.value };
    case "openDeleteConfirm":
      return {
        ...state,
        documentToDelete: action.documentId,
        showDeleteConfirm: true,
      };
    case "closeDeleteConfirm":
      return { ...state, documentToDelete: null, showDeleteConfirm: false };
    case "selectAllDocs":
      return { ...state, selectedDocs: new Set(action.docIds) };
    case "openBulkDeleteConfirm":
      return { ...state, showDeleteConfirm: true, bulkDeleteMode: true };
    case "closeBulkDeleteConfirm":
      return { ...state, showDeleteConfirm: false, bulkDeleteMode: false };
    case "setDeletingInProgress":
      return { ...state, deletingInProgress: action.value };
    case "setShowCreateFolderModal":
      return { ...state, showCreateFolderModal: action.value };
    case "openDownloadOptions":
      return {
        ...state,
        showDownloadOptions: true,
        documentToDownload: action.document,
      };
    case "closeDownloadOptions":
      return {
        ...state,
        showDownloadOptions: false,
        documentToDownload: null,
      };
    case "setCopiedDocument":
      return {
        ...state,
        copiedDocument: action.document,
      };
    case "setShowResumeProcessor":
      return {
        ...state,
        showResumeProcessor: action.value,
      };
    case "setShowPointsExtractor":
      return {
        ...state,
        showPointsExtractor: action.value,
      };
    default:
      return state;
  }
}

const getUploadLabel = (id: string) => {
  const lastDash = id.lastIndexOf("-");
  if (lastDash <= 0) return id;
  const maybeTs = id.slice(lastDash + 1);
  if (/^\d{5,}$/.test(maybeTs)) {
    return id.slice(0, lastDash);
  }
  return id;
};

const DocumentRow = memo(
  (props: {
    doc: Document;
    selected: boolean;
    onToggle: (id: string) => void;
    onPreview: (doc: Document) => void;
    onDownload: (doc: Document) => void;
    onDelete: (id: string) => void;
    onCopy: (doc: Document) => void;
    onEdit: (doc: Document) => void;
    onDragStart: (doc: Document, e: React.DragEvent<HTMLDivElement>) => void;
  }) => {
    const { doc, selected, onToggle, onPreview, onDownload, onDelete, onCopy, onEdit, onDragStart } = props;

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = `document-row-menu-${doc.id}`;

    const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onPreview(doc);
      }
      if (e.key === " ") {
        e.preventDefault();
        onToggle(doc.id);
      }
    };

    useEffect(() => {
      if (!isMenuOpen || !menuButtonRef.current) return;
      
      // Calculate position when menu opens (Bug #13: add safety check)
      try {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      } catch {
        // Silently handle menu position calculation error
      }
    }, [isMenuOpen]);

    useEffect(() => {
      if (!isMenuOpen) return;

      const onPointerDown = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (!target) return;
        if (menuButtonRef.current?.contains(target)) return;
        if (menuRef.current?.contains(target)) return;
        setIsMenuOpen(false);
      };

      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }, [isMenuOpen]);

    useEffect(() => {
      if (!isMenuOpen) return;

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      };

      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [isMenuOpen]);

    return (
      <div
        className={`group flex items-center gap-3 px-6 py-3 border-b border-slate-100 cursor-pointer transition-colors ${
          selected ? "bg-blue-50" : "hover:bg-slate-50"
        }`}
        onClick={() => onPreview(doc)}
        onKeyDown={handleRowKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Preview document ${doc.original_filename}`}
        draggable
        onDragStart={(e) => onDragStart(doc, e)}
      >
        {/* Checkbox */}
        <div className="flex-shrink-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(doc.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${selected ? "Deselect" : "Select"} ${
              doc.original_filename
            }`}
          />
        </div>

        {/* Document Info - Flexible */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">
                {doc.original_filename}
              </p>
              <p className="text-xs text-slate-500">
                {formatFileSize(doc.file_size)} • {getRelativeTime(doc.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Version Badge */}
        <div className="flex-shrink-0 hidden sm:block">
          <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md text-xs text-slate-600">
            v{doc.version}
          </span>
        </div>

        {/* Action Buttons - Visible on mobile, hidden until hover on desktop */}
        <div className="flex items-center gap-2 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {/* Preview Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(doc);
            }}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Preview"
            aria-label="Preview document"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* More Menu */}
          <div onClick={(e) => e.stopPropagation()}>
            <button
              ref={menuButtonRef}
              type="button"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls={isMenuOpen ? menuId : undefined}
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && createPortal(
              <div
                ref={menuRef}
                role="menu"
                id={menuId}
                className="fixed w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[9999]"
                style={{
                  top: `${menuPos.top}px`,
                  right: `${menuPos.right}px`,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onCopy(doc);
                  }}
                >
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  Copy
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDownload(doc);
                  }}
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onEdit(doc);
                  }}
                >
                  <Edit className="w-4 h-4" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2 text-sm text-left text-red-700 hover:bg-red-50 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDelete(doc.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Delete
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>
    );
  }
);

const MobileDocumentCard = memo(
  (props: {
    doc: Document;
    selected: boolean;
    onToggle: (id: string) => void;
    onPreview: (doc: Document) => void;
    onDownload: (doc: Document) => void;
    onDelete: (id: string) => void;
    onCopy: (doc: Document) => void;
    onEdit: (doc: Document) => void;
    onDragStart: (doc: Document, e: React.DragEvent<HTMLDivElement>) => void;
  }) => {
    const { doc, selected, onToggle, onPreview, onDownload, onDelete, onCopy, onEdit, onDragStart } = props;

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = `mobile-document-menu-${doc.id}`;

    const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onPreview(doc);
      }
      if (e.key === " ") {
        e.preventDefault();
        onToggle(doc.id);
      }
    };

    useEffect(() => {
      if (!isMenuOpen || !menuButtonRef.current) return;
      
      // Calculate position when menu opens (Bug #13: add safety check)
      try {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      } catch {
        // Silently handle menu position calculation error
      }
    }, [isMenuOpen]);

    useEffect(() => {
      if (!isMenuOpen) return;

      const onPointerDown = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (!target) return;
        if (menuButtonRef.current?.contains(target)) return;
        if (menuRef.current?.contains(target)) return;
        setIsMenuOpen(false);
      };

      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }, [isMenuOpen]);

    useEffect(() => {
      if (!isMenuOpen) return;

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsMenuOpen(false);
          menuButtonRef.current?.focus();
        }
      };

      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [isMenuOpen]);

    return (
      <div
        className={`p-4 ${selected ? "bg-blue-50" : "bg-white"} focus-ring`}
        role="button"
        tabIndex={0}
        aria-label={`Preview document ${doc.original_filename}`}
        onClick={() => onPreview(doc)}
        onKeyDown={handleCardKeyDown}
        draggable
        onDragStart={(e) => onDragStart(doc, e)}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(doc.id)}
            className="mt-1 w-4 h-4"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${selected ? "Deselect" : "Select"} ${
              doc.original_filename
            }`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div className="text-xs font-medium text-gray-900 truncate">
                {doc.original_filename}
              </div>
            </div>

            <div className="mt-1 text-xs text-gray-600">
              <span className="font-medium text-gray-700">v{doc.version}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span>{formatFileSize(doc.file_size)}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(doc);
            }}
            className="p-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            title="Preview document"
            aria-label="Preview document"
          >
            <Eye className="w-4 h-4" />
          </button>

          <div onClick={(e) => e.stopPropagation()}>
            <button
              ref={menuButtonRef}
              type="button"
              className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls={isMenuOpen ? menuId : undefined}
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && createPortal(
              <div
                ref={menuRef}
                role="menu"
                id={menuId}
                className="fixed w-48 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-[9999]"
                style={{
                  top: `${menuPos.top}px`,
                  right: `${menuPos.right}px`,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-sm text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onCopy(doc);
                  }}
                >
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  Copy
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-sm text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDownload(doc);
                  }}
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-sm text-left text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onEdit(doc);
                  }}
                >
                  <Edit className="w-4 h-4" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-sm text-left text-red-700 hover:bg-red-50 transition-colors flex items-center gap-3 border-t border-slate-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDelete(doc.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Delete
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>
    );
  }
);

export const DocumentsPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [ui, dispatch] = useReducer(uiReducer, initialUIState);
  const [search, setSearch] = useReducer((_: string, next: string) => next, "");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sortBy, setSortBy] = useState<'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc'>('created_desc');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pdf' | 'doc' | 'docx'>('all');
  const [showTrash, setShowTrash] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { 
    folders: _folders, 
    createNewFolder,
    refresh: _refreshFolders,
  } = useFolders(null, 'all');

  const PAGE_SIZE = 100;

  const docsSWR = useDocumentsInfinite({
    userId: user?.id,
    pageSize: PAGE_SIZE,
    search,
    folderId: currentFolderId,
  });

  const {
    documents,
    error: documentsError,
    isLoadingInitial: initialLoading,
    isLoadingMore: loadingMore,
    hasMore,
    loadMore,
    mutate: mutateDocuments,
    reset,
  } = docsSWR;

  const displayedDocuments = useMemo(() => {
    const byType = documents.filter((doc) => {
      if (typeFilter === 'all') return true;
      const filename = String(doc.original_filename || doc.filename || '').toLowerCase();
      return filename.endsWith(`.${typeFilter}`);
    });

    const sorted = [...byType];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':
          return String(a.original_filename || a.filename || '').localeCompare(String(b.original_filename || b.filename || ''));
        case 'name_desc':
          return String(b.original_filename || b.filename || '').localeCompare(String(a.original_filename || a.filename || ''));
        case 'size_desc':
          return (b.file_size || 0) - (a.file_size || 0);
        case 'size_asc':
          return (a.file_size || 0) - (b.file_size || 0);
        case 'created_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sorted;
  }, [documents, sortBy, typeFilter]);

  const folderMap = useMemo(() => {
    const map = new Map<string, DocumentFolder>();
    _folders.forEach((folder) => {
      map.set(folder.id, folder);
    });
    return map;
  }, [_folders]);

  const breadcrumbPath = useMemo(() => {
    if (!currentFolderId) return [];

    const path: DocumentFolder[] = [];
    const visited = new Set<string>();
    let current = folderMap.get(currentFolderId) || null;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parent_folder_id ? folderMap.get(current.parent_folder_id) || null : null;
    }

    return path;
  }, [currentFolderId, folderMap]);

  useEffect(() => {
    if (documentsError) {
      showToast({
        type: "error",
        title: "Failed to load documents",
        message:
          documentsError instanceof Error
            ? documentsError.message
            : String(documentsError),
      });
    }
  }, [documentsError, showToast]);

  useEffect(() => {
    // Keep selection scoped to the currently visible result set.
    dispatch({ type: "clearSelection" });
    void reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentFolderId]);

  const selectedDocIds = useMemo(
    () => Array.from(ui.selectedDocs).filter((id) => displayedDocuments.some((doc) => doc.id === id)),
    [ui.selectedDocs, displayedDocuments]
  );

  const openEditor = useCallback(() => {
    if (isMobile) {
      showToast({
        type: "info",
        title: "Desktop Only Feature",
        message:
          "The resume editor is optimized for desktop use. Please use a desktop computer for the best experience.",
        durationMs: 5000,
      });
      return;
    }

    // Avoid leaving focus on background elements when the editor (or its internals) uses portals
    // that may apply aria-hidden to #root.
    (document.activeElement as HTMLElement | null)?.blur?.();

    if (selectedDocIds.length === 0) {
      showToast({
        type: "info",
        title: "No documents selected",
        message: "Please select at least one document to edit.",
      });
      return;
    }

    if (selectedDocIds.length > 1) {
      showToast({
        type: "warning",
        title: "Only one document at a time",
        message: "Please select only one document to edit.",
      });
      return;
    }

    const docsToEdit = displayedDocuments.filter((doc) => ui.selectedDocs.has(doc.id));
    if (docsToEdit.length !== 1) {
      dispatch({ type: "clearSelection" });
      showToast({
        type: "warning",
        title: "Selection changed",
        message: "Please reselect the document you want to edit.",
      });
      return;
    }
    dispatch({ type: "openEditor", documents: docsToEdit });
  }, [
    displayedDocuments,
    ui.selectedDocs,
    isMobile,
    selectedDocIds.length,
    showToast,
  ]);

  const debouncedUpdateSearch = useMemo(
    () =>
      debounce((next: unknown) => {
        setSearch(String(next ?? ""));
      }, 250),
    []
  );

  useEffect(() => {
    let isMounted = true;
    
    const executeSearch = () => {
      if (isMounted) {
        debouncedUpdateSearch(ui.searchValue);
      }
    };
    
    executeSearch();
    
    // Cancel pending updates on unmount (Bug #7)
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.searchValue]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        Boolean(
          target && "isContentEditable" in target && target.isContentEditable
        );

      if (e.key === "Escape") {
        if (ui.selectedDocumentPreview) {
          dispatch({ type: "setSelectedDocumentPreview", value: null });
        }
      }

      if (!isTypingTarget && e.key === "/") {
        e.preventDefault();
        const el = document.getElementById(
          "documents-search"
        ) as HTMLInputElement | null;
        el?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById(
          "documents-search"
        ) as HTMLInputElement | null;
        el?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!isTypingTarget && selectedDocIds.length > 0) {
          e.preventDefault();
          openEditor();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openEditor, selectedDocIds.length, ui.selectedDocumentPreview]);

  const refreshDocuments = useCallback(async () => {
    dispatch({ type: "clearSelection" });
    await reset();
  }, [reset]);

  const pendingTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const uploadProgressIntervalsRef = useRef<NodeJS.Timeout[]>([]);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cleanup pending timeouts and uploads on unmount (Bug #3, #15: memory leak)
  useEffect(() => {
    const pendingTimeouts = pendingTimeoutsRef.current;
    const uploadAbortControllers = uploadAbortControllersRef.current;

    return () => {
      pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      pendingTimeoutsRef.current = [];
      
      // Cancel all in-progress uploads (Bug #15)
      uploadAbortControllers.forEach((controller, _fileId) => {
        try {
          controller.abort();
        } catch {
          // Silently handle abort error
        }
      });
      uploadAbortControllers.clear();

      // Clear all upload progress intervals
      uploadProgressIntervalsRef.current.forEach(intervalId => clearInterval(intervalId));
      uploadProgressIntervalsRef.current = [];
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const validFiles: File[] = [];
    let hasErrors = false;

    // Validate files before uploading
    for (const file of Array.from(files)) {
      const isValidType =
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "application/msword" ||
        file.type === "application/pdf";

      if (!isValidType) {
        showToast({
          type: "error",
          title: "Invalid file type",
          message: `${file.name}: Only .docx, .doc, and .pdf files are supported`,
        });
        hasErrors = true;
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        showToast({
          type: "error",
          title: "File too large",
          message: `${file.name}: ${(file.size / 1024 / 1024).toFixed(
            2
          )}MB exceeds 5MB limit`,
        });
        hasErrors = true;
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (hasErrors) {
        showToast({
          type: "warning",
          title: "No valid files",
          message: "Please check file sizes and types",
        });
      }
      return;
    }

    dispatch({ type: "setUploading", value: true });
    const progressMap: Record<string, number> = {};

    // Upload valid files with progress tracking
    let successCount = 0;
    for (const file of validFiles) {
      const fileId = `${file.name}-${Date.now()}`;
      progressMap[fileId] = 0;
      dispatch({ type: "setUploadProgress", value: { ...progressMap } });

      // Simulate progress (since uploadDocument doesn't support progress callbacks)
      const progressInterval = setInterval(() => {
        progressMap[fileId] = Math.min(progressMap[fileId] + 10, 90);
        dispatch({ type: "setUploadProgress", value: { ...progressMap } });
      }, 200);
      uploadProgressIntervalsRef.current.push(progressInterval);

      const result = await uploadDocument(file, user.id, 'local', undefined, currentFolderId);
      clearInterval(progressInterval);
      uploadProgressIntervalsRef.current = uploadProgressIntervalsRef.current.filter(id => id !== progressInterval);

      if (result.success) {
        progressMap[fileId] = 100;
        dispatch({ type: "setUploadProgress", value: { ...progressMap } });
        successCount++;
        const timeoutId = setTimeout(() => {
          dispatch({
            type: "setUploadProgress",
            value: Object.fromEntries(
              Object.entries(progressMap).filter(([k]) => k !== fileId)
            ),
          });
          // Remove from tracked timeouts
          pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter(id => id !== timeoutId);
        }, 500);
        pendingTimeoutsRef.current.push(timeoutId);
      } else if (result.error) {
        delete progressMap[fileId];
        dispatch({ type: "setUploadProgress", value: { ...progressMap } });
        showToast({
          type: "error",
          title: "Upload failed",
          message: `${file.name}: ${result.error}`,
        });
      }
    }

    await refreshDocuments();
    dispatch({ type: "setUploading", value: false });
    
    // BUG FIX #21: Clear pending individual file timeouts before clearing all progress
    // This prevents race conditions that keep the upload notification visible
    pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    pendingTimeoutsRef.current = [];
    
    // Clear upload progress after a short delay to show completion
    const finalClearId = setTimeout(() => {
      dispatch({ type: "setUploadProgress", value: {} });
    }, 300);
    pendingTimeoutsRef.current.push(finalClearId);

    if (successCount > 0) {
      showToast({
        type: "success",
        title: "Upload complete",
        message: `${successCount} document${
          successCount !== 1 ? "s" : ""
        } uploaded successfully`,
      });
    }
  };

  const handleDeleteClick = useCallback((documentId: string) => {
    dispatch({ type: "openDeleteConfirm", documentId });
  }, []);

  const handleDelete = async () => {
    if (!ui.documentToDelete) return;
    const documentId = ui.documentToDelete;

    // Set loading state to disable dialog buttons during deletion
    dispatch({ type: "setDeletingInProgress", value: true });
    dispatch({ type: "removeSelectedDoc", docId: documentId });
    
    // Close preview if the deleted document was being previewed
    if (ui.selectedDocumentPreview?.id === documentId) {
      dispatch({ type: "setSelectedDocumentPreview", value: null });
    }

    try {
      // Delete the document from the API
      const result = await deleteDocument(documentId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete document");
      }

      // Force server revalidation to fetch fresh data
      await mutateDocuments(undefined, {
        revalidate: true,
      });

      // Close dialog only after deletion succeeds
      dispatch({ type: "closeDeleteConfirm" });

      showToast({
        type: "success",
        title: "Document deleted",
        message: "The document has been removed.",
      });
    } catch (err) {
      // On error, revalidate to ensure the UI is in sync with server
      await mutateDocuments();
      
      // Close dialog on error too
      dispatch({ type: "closeDeleteConfirm" });
      
      showToast({
        type: "error",
        title: "Failed to delete document",
        message:
          err instanceof Error ? err.message : "Failed to delete document",
      });
    } finally {
      // Always clear loading state when deletion completes
      dispatch({ type: "setDeletingInProgress", value: false });
    }
  };

  const handleBulkDelete = async () => {
    const documentIds = Array.from(ui.selectedDocs);
    if (documentIds.length === 0) return;

    // Set loading state (Bug #18)
    dispatch({ type: "setDeletingInProgress", value: true });

    // Don't dispatch until after mutation succeeds (Bug #2: race condition)
    
    // Close preview if it's one of the deleted documents
    if (ui.selectedDocumentPreview && documentIds.includes(ui.selectedDocumentPreview.id)) {
      dispatch({ type: "setSelectedDocumentPreview", value: null });
    }

    try {
      // Delete all documents in parallel
      const deletePromises = documentIds.map(id => deleteDocument(id));
      const results = await Promise.all(deletePromises);
      
      // Check if all deletes were successful
      const allSuccessful = results.every(r => r.success);
      if (!allSuccessful) {
        const failedCount = results.filter(r => !r.success).length;
        throw new Error(`Failed to delete ${failedCount} document(s)`);
      }

      // Force server revalidation to fetch fresh data
      await mutateDocuments(undefined, {
        revalidate: true,
      });

      // Dispatch state updates only after mutation succeeds
      dispatch({ type: "closeBulkDeleteConfirm" });
      dispatch({ type: "clearSelection" });

      showToast({
        type: "success",
        title: "Documents deleted",
        message: `${documentIds.length} document${documentIds.length > 1 ? "s" : ""} have been removed.`,
      });
    } catch (err) {
      // Silently handle bulk delete error and revalidate
      await mutateDocuments();
      
      // Still close dialog on error
      dispatch({ type: "closeBulkDeleteConfirm" });
      
      showToast({
        type: "error",
        title: "Failed to delete documents",
        message:
          err instanceof Error ? err.message : "Failed to delete documents",
      });
    } finally {
      dispatch({ type: "setDeletingInProgress", value: false });
    }
  };

  const handleDownload = useCallback(
    (document: Document) => {
      dispatch({ type: "openDownloadOptions", document });
    },
    [dispatch]
  );

  const handleDownloadLocal = useCallback(
    async (document: Document) => {
      const result = await downloadDocument(document.storage_path);
      if (result.success && result.url) {
        const ok = (await import('../../lib/safeRedirect')).safeOpenUrl(result.url, '_blank');
        if (!ok) {
          showToast({ type: 'error', title: 'Blocked Link', message: 'This download link is not allowed.' });
        } else {
          showToast({ type: 'success', title: 'Download started', message: `${document.original_filename} is downloading.` });
        }
      } else if (result.error) {
        showToast({
          type: "error",
          title: "Failed to download document",
          message: result.error,
        });
      }
    },
    [showToast]
  );

  const handleSaveToApp = useCallback(
    async (document: Document) => {
      const result = await saveDocumentToApp(document.id, user?.id || '');
      if (result.success) {
        await refreshDocuments();
        showToast({
          type: 'success',
          title: 'Saved to App',
          message: `${document.original_filename} has been saved to your app library.`,
        });
      } else if (result.error) {
        showToast({
          type: 'error',
          title: 'Failed to save to app',
          message: result.error,
        });
      }
    },
    [showToast, user?.id, refreshDocuments]
  );

  const handleSaveToAppFolder = useCallback(
    async (document: Document, folderId: string | null) => {
      console.log('📁 [DocumentsPage] Saving to folder:', { documentId: document.id, folderId, folderName: document.original_filename });
      const result = await saveDocumentToAppFolder(document.id, user?.id || '', folderId);
      if (result.success) {
        console.log('✅ [DocumentsPage] Document saved successfully to folder:', folderId);
        await refreshDocuments();
        showToast({
          type: 'success',
          title: 'Saved to App Folder',
          message: `${document.original_filename} has been saved to your application folder.`,
        });
      } else if (result.error) {
        console.error('❌ [DocumentsPage] Failed to save to folder:', result.error);
        showToast({
          type: 'error',
          title: 'Failed to save to app folder',
          message: result.error,
        });
      }
    },
    [showToast, user?.id, refreshDocuments]
  );

  const handleCopyDocument = useCallback(
    (document: Document) => {
      dispatch({ type: "setCopiedDocument", document });
      showToast({
        type: "success",
        title: "Copied",
        message: `${document.original_filename} is ready to paste.`,
      });
    },
    [showToast]
  );

  const handlePasteDocument = useCallback(async () => {
    if (!ui.copiedDocument || !user?.id) return;

    const result = await duplicateDocumentToFolder(
      ui.copiedDocument.id,
      user.id,
      currentFolderId
    );

    if (result.success) {
      await refreshDocuments();
      showToast({
        type: "success",
        title: "Pasted",
        message: `${ui.copiedDocument.original_filename} was copied to ${
          currentFolderId ? "this folder" : "root documents"
        }.`,
      });
    } else if (result.error) {
      showToast({
        type: "error",
        title: "Paste failed",
        message: result.error,
      });
    }
  }, [currentFolderId, refreshDocuments, showToast, ui.copiedDocument, user?.id]);

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleFolderDeleted = useCallback(() => {
    mutateDocuments?.();
    _refreshFolders?.();
  }, [mutateDocuments, _refreshFolders]);

  const handleFolderCreated = useCallback(() => {
    mutateDocuments?.();
    _refreshFolders?.();
  }, [mutateDocuments, _refreshFolders]);

  const handleOpenTrash = useCallback(() => {
    setShowTrash(true);
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string, description?: string) => {
      try {
        const result = await createNewFolder(name, description);
        if (!result.success) {
          return result;
        }

        dispatch({ type: "setShowCreateFolderModal", value: false });
        // Refresh both documents and folders to show in real-time
        mutateDocuments?.();
        _refreshFolders?.();
        return result;
      } catch (error) {
        showToast({
          type: "error",
          title: "Failed to create folder",
          message: error instanceof Error ? error.message : "Failed to create folder",
        });
        throw error;
      }
    },
    [createNewFolder, showToast, mutateDocuments, _refreshFolders]
  );

  const toggleDocSelection = useCallback((docId: string) => {
    dispatch({ type: "toggleSelectedDoc", docId });
  }, []);

  const handlePreview = useCallback((doc: Document) => {
    dispatch({ type: "setSelectedDocumentPreview", value: doc });
  }, []);

  const handleEditDocument = useCallback((doc: Document) => {
    dispatch({ type: "openEditor", documents: [doc] });
  }, []);

  const handleRowDelete = useCallback(
    (documentId: string) => {
      handleDeleteClick(documentId);
    },
    [handleDeleteClick]
  );

  const handleDocumentDragStart = useCallback((doc: Document, e: React.DragEvent<HTMLDivElement>) => {
    const payload = JSON.stringify({ type: 'document', id: doc.id, name: doc.original_filename });
    e.dataTransfer.setData('application/json', payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDocumentDrop = useCallback(
    async (documentId: string, targetFolderId: string | null) => {
      if (!user?.id) return;
      try {
        const result = await moveToFolder(user.id, documentId, 'document', targetFolderId);
        
        if (result.success) {
          showToast({
            type: "success",
            title: "Document moved",
            message: "Document moved successfully",
          });
          // Refresh documents list
          mutateDocuments?.();
          _refreshFolders?.();
        } else {
          showToast({
            type: "error",
            title: "Move failed",
            message: result.error || "Failed to move document",
          });
        }
      } catch (error) {
        showToast({
          type: "error",
          title: "Move failed",
          message: error instanceof Error ? error.message : "Failed to move document",
        });
      }
    },
    [user?.id, showToast, mutateDocuments, _refreshFolders]
  );

  const rowVirtualizer = useVirtualizer({
    count: displayedDocuments.length,
    getScrollElement: () => document.getElementById("main-content"),
    estimateSize: () => 76,
    overscan: 15, // Bug #21: Increased overscan to handle measurement delays during lazy loading
    measureElement: typeof window !== 'undefined' && navigator.userAgent.indexOf('jsdom') === -1 ? element => element?.getBoundingClientRect().height : undefined,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (isMobile) return;
    if (!hasMore || loadingMore) return;
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (initialLoading) return;
    if (last.index >= displayedDocuments.length - 10) {
      void loadMore();
    }
  }, [
    virtualRows,
    displayedDocuments.length,
    initialLoading,
    loadMore,
    isMobile,
    hasMore,
    loadingMore,
  ]);

  useEffect(() => {
    if (!isMobile) return;

    const el = document.getElementById("main-content");
    if (!el) return;

    const onScroll = () => {
      if (initialLoading) return;
      if (!hasMore || loadingMore) return;
      const thresholdPx = 500;
      const nearBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx;
      if (nearBottom) {
        void loadMore();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isMobile, initialLoading, loadMore, hasMore, loadingMore]);

  if (initialLoading) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-96 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
            >
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row h-screen overflow-hidden w-full bg-white">
      {/* Folder Sidebar */}
      <div
        className={`border-r border-slate-200 bg-white overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          sidebarExpanded ? 'w-96' : 'w-16'
        }`}
      >
        {/* Sidebar Header with Toggle */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-3 border-b border-gray-200 bg-white">
          {sidebarExpanded && <h3 className="text-sm font-semibold text-gray-900">Folders</h3>}
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0 ml-auto"
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content - only show when expanded */}
        {sidebarExpanded && (
          <FolderSidebar
            currentFolderId={currentFolderId}
            onFolderSelect={handleFolderSelect}
            onCreateFolder={() => dispatch({ type: "setShowCreateFolderModal", value: true })}
            onFolderDeleted={handleFolderDeleted}
            onFolderCreated={handleFolderCreated}
            onDocumentDrop={handleDocumentDrop}
            onTrashClick={handleOpenTrash}
          />
        )}

        {/* Collapsed sidebar - show minimize icon */}
        {!sidebarExpanded && (
          <div className="flex-1 flex flex-col items-center justify-start gap-2 px-2 py-3">
            <div className="w-10 h-10 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
              📁
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Clean Header with Breadcrumb, Search, and Upload */}
        <div className="flex flex-col border-b border-slate-200 bg-white">
          {/* Top Row: Breadcrumb + Actions */}
          <div className="flex items-center justify-between gap-4 px-6 py-3.5 min-h-14">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                  currentFolderId === null
                    ? "text-slate-900 bg-slate-100"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                <span className="hidden sm:inline">Root Documents</span>
              </button>

              {breadcrumbPath.length > 0 && (
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  {breadcrumbPath.map((folder) => {
                    const isCurrent = currentFolderId === folder.id;
                    return (
                      <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-slate-300">/</span>
                        <button
                          type="button"
                          onClick={() => setCurrentFolderId(folder.id)}
                          className={`max-w-[220px] truncate rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            isCurrent
                              ? "bg-blue-100 text-blue-700"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                          aria-current={isCurrent ? "page" : undefined}
                          title={folder.name}
                        >
                          {folder.name}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {_folders.length > 0 && (
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    aria-expanded={showFolderDropdown}
                    aria-haspopup="menu"
                  >
                    <span>Jump to folder</span>
                    <svg className={`w-4 h-4 transition-transform ${showFolderDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showFolderDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-y-auto max-h-96">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentFolderId(null);
                          setShowFolderDropdown(false);
                        }}
                        className={`w-full px-4 py-2.5 text-sm text-left font-medium transition-colors border-b border-slate-100 ${
                          currentFolderId === null
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Root Documents
                      </button>
                      {_folders.map(folder => (
                        <button
                          type="button"
                          key={folder.id}
                          onClick={() => {
                            setCurrentFolderId(folder.id);
                            setShowFolderDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-sm text-left font-medium transition-colors border-b border-slate-100 last:border-b-0 ${
                            currentFolderId === folder.id
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                          title={folder.name}
                        >
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Upload Button */}
              <label className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer text-sm">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
                <input
                  type="file"
                  multiple
                  accept=".doc,.docx,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={ui.uploading}
                />
              </label>

              {/* More Options */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  title="More options"
                  aria-label="More options"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showActionMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "setShowPointsExtractor", value: true });
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium text-left border-b border-slate-100"
                    >
                      <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Extract Points</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "setShowResumeProcessor", value: true });
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium text-left border-b border-slate-100"
                    >
                      <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span>Smart Editor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "setShowGoogleDrive", value: true });
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium text-left border-b border-slate-100"
                    >
                      <Cloud className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span>Import from Drive</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "setShowCreateFolderModal", value: true });
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium text-left border-b border-slate-100"
                    >
                      <FolderPlus className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>New Folder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowTrash(true);
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium text-left"
                    >
                      <Trash2 className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>Trash</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Second Row: Search + Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-6 py-3 bg-slate-50 border-t border-slate-200">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <input
                id="documents-search"
                value={ui.searchValue}
                onChange={(e) =>
                  dispatch({ type: "setSearchValue", value: e.target.value })
                }
                placeholder="Search documents..."
                className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder:text-slate-400 bg-white"
                aria-label="Search documents"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {ui.searchValue && (
                <button
                  onClick={() => dispatch({ type: "setSearchValue", value: "" })}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition rounded p-0.5"
                  aria-label="Clear search"
                >
                  <span className="text-lg leading-none">✕</span>
                </button>
              )}
            </div>

            {/* Filter & Sort */}
            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'pdf' | 'doc' | 'docx')}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                aria-label="Filter by file type"
              >
                <option value="all">All Types</option>
                <option value="pdf">PDF</option>
                <option value="doc">DOC</option>
                <option value="docx">DOCX</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc')}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                aria-label="Sort documents"
              >
                <option value="created_desc">Newest</option>
                <option value="created_asc">Oldest</option>
                <option value="name_asc">Name ↑</option>
                <option value="name_desc">Name ↓</option>
                <option value="size_desc">Largest</option>
                <option value="size_asc">Smallest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div id="main-content" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6 md:p-8">
                  {ui.copiedDocument && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-200">
              <ClipboardPaste className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-sm text-emerald-900">
              <span className="font-semibold">Ready to paste:</span>{" "}
              <span className="font-medium">{ui.copiedDocument.original_filename}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePasteDocument}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors text-sm"
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste Here
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "setCopiedDocument", document: null })}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-white text-emerald-700 font-medium hover:bg-emerald-50 transition-colors text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

            {selectedDocIds.length > 0 ? (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedDocIds.length === displayedDocuments.length}
                  onChange={() => {
                    if (selectedDocIds.length === displayedDocuments.length) {
                      dispatch({ type: "clearSelection" });
                    } else {
                      dispatch({ type: "selectAllDocs", docIds: displayedDocuments.map(d => d.id) });
                    }
                  }}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  aria-label="Select or deselect all"
                />
                <span className="text-sm font-medium text-slate-900">
                  {selectedDocIds.length} of {displayedDocuments.length} selected
                </span>
              </div>
            ) : null}

            {Object.keys(ui.uploadProgress).length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-md hover:shadow-lg transition-shadow">
          <div className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            Uploading Files
          </div>
          <div className="space-y-3">
            {Object.entries(ui.uploadProgress).map(([id, pct]) => (
              <div key={id} className="flex items-center gap-3">
                <div className="text-sm text-slate-700 font-medium min-w-0 flex-1 truncate" title={getUploadLabel(id)}>
                  {getUploadLabel(id)}
                </div>
                <div className="flex-shrink-0">
                  <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-600 w-12 text-right">
                  {pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={Boolean(ui.selectedDocumentPreview)}
        document={ui.selectedDocumentPreview}
        onClose={() =>
          dispatch({ type: "setSelectedDocumentPreview", value: null })
        }
      />

      {/* Conditionally render Trash or Documents */}
      {showTrash ? (
        <TrashView onBack={() => setShowTrash(false)} />
      ) : (
        <>
          {displayedDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No documents yet</h3>
              <p className="text-slate-500 text-center mb-6 max-w-sm">
                {search
                  ? "No documents match your search. Try different keywords."
                  : "Upload your first resume to get started."}
              </p>
              {!search && (
                <div className="flex gap-3">
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer text-sm">
                    <Upload className="w-4 h-4" />
                    Upload
                    <input
                      type="file"
                      multiple
                      accept=".doc,.docx,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "setShowGoogleDrive", value: true })}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors text-sm"
                  >
                    <Cloud className="w-4 h-4" />
                    Import
                  </button>
                </div>
              )}
            </div>
          ) : (
        <div className="overflow-visible">
          {isMobile ? (
            <div className="divide-y divide-gray-100">
              {displayedDocuments.map((doc) => (
                <MobileDocumentCard
                  key={doc.id}
                  doc={doc}
                  selected={ui.selectedDocs.has(doc.id)}
                  onToggle={toggleDocSelection}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  onDelete={handleRowDelete}
                  onCopy={handleCopyDocument}
                  onEdit={handleEditDocument}
                  onDragStart={handleDocumentDragStart}
                />
              ))}
              {(loadingMore || hasMore) && (
                <div className="px-6 py-3 text-xs text-slate-500 text-center">
                  {loadingMore
                    ? "Loading more documents..."
                    : "Scroll to load more"}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Table Header - Desktop only */}
              <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600 uppercase tracking-wide">
                <div className="w-4 flex-shrink-0" />
                <div className="flex-1">Name</div>
                <div className="hidden sm:block flex-shrink-0 w-20">Version</div>
                <div className="w-24 flex-shrink-0" />
              </div>

              {/* Virtual Table Rows */}
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {virtualRows.map((vr) => {
                  const doc = displayedDocuments[vr.index];
                  if (!doc) return null;

                  return (
                    <div
                      key={doc.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vr.start}px)`,
                      }}
                    >
                      <DocumentRow
                        doc={doc}
                        selected={ui.selectedDocs.has(doc.id)}
                        onToggle={toggleDocSelection}
                        onPreview={handlePreview}
                        onDownload={handleDownload}
                        onDelete={handleRowDelete}
                        onCopy={handleCopyDocument}
                        onEdit={handleEditDocument}
                        onDragStart={handleDocumentDragStart}
                      />
                    </div>
                  );
                })}
              </div>

              {(loadingMore || hasMore) && (
                <div className="px-6 py-3 text-xs text-slate-500 text-center border-t border-slate-200">
                  {loadingMore
                    ? "Loading more documents..."
                    : "Scroll to load more"}
                </div>
              )}
            </>
          )}
        </div>
      )}
        </>
      )}

      {/* Document Editor Modal */}

      {ui.isEditorOpen && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
              <div className="card-base card-p-md max-w-md w-full text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600 mb-3" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Editor Error</h3>
                <p className="text-gray-600 mb-6 text-xs">
                  The document editor encountered an error. Please close this dialog and try again.
                </p>
                <button
                  onClick={() => {
                    dispatch({ type: "closeEditor" });
                    dispatch({ type: "clearSelection" });
                  }}
                  className="px-4 py-2 bg-primary-800 text-white rounded-lg font-medium hover:bg-primary-900 transition"
                >
                  Close Editor
                </button>
              </div>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                <div className="bg-white p-4 rounded-lg shadow-lg">
                  Loading Editor...
                </div>
              </div>
            }
          >
            <DocumentEditor
              documents={ui.documentsToEdit}
              layout="single"
              onClose={() => {
                dispatch({ type: "closeEditor" });
                dispatch({ type: "clearSelection" });
                refreshDocuments();
              }}
              onSave={async () => {
                dispatch({ type: "closeEditor" });
                dispatch({ type: "clearSelection" });
                await refreshDocuments();
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Google Drive Picker Modal */}
      {ui.showGoogleDrive && (
        <GoogleDrivePicker
          onFilesImported={(docs) => {
            dispatch({ type: "setShowGoogleDrive", value: false });
            refreshDocuments();
            showToast({
              type: "success",
              title: "Documents imported",
              message: `${docs.length} document(s) imported from Google Drive successfully.`,
            });
          }}
          onClose={() => dispatch({ type: "setShowGoogleDrive", value: false })}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={ui.showDeleteConfirm}
        onClose={() => {
          if (ui.bulkDeleteMode) {
            dispatch({ type: "closeBulkDeleteConfirm" });
          } else {
            dispatch({ type: "closeDeleteConfirm" });
          }
        }}
        onConfirm={ui.bulkDeleteMode ? handleBulkDelete : handleDelete}
        isLoading={ui.deletingInProgress}
        title={ui.bulkDeleteMode ? "Delete Multiple Documents" : "Delete Document"}
        message={
          ui.bulkDeleteMode
            ? `Are you sure you want to delete ${ui.selectedDocs.size} document${ui.selectedDocs.size > 1 ? "s" : ""}? This action cannot be undone.`
            : "Are you sure you want to delete this document? This action cannot be undone."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={ui.showCreateFolderModal}
        onClose={() =>
          dispatch({ type: "setShowCreateFolderModal", value: false })
        }
        onCreate={handleCreateFolder}
      />

      {/* Download Options Modal */}
      <DownloadOptionsModal
        isOpen={ui.showDownloadOptions}
        fileName={ui.documentToDownload?.original_filename || 'Document'}
        onClose={() => dispatch({ type: "closeDownloadOptions" })}
        onDownloadLocal={async () => {
          if (ui.documentToDownload) {
            await handleDownloadLocal(ui.documentToDownload);
          }
        }}
        onSaveToApp={async () => {
          if (ui.documentToDownload) {
            await handleSaveToApp(ui.documentToDownload);
          }
        }}
        onSaveToAppFolder={async (folderId) => {
          if (ui.documentToDownload) {
            await handleSaveToAppFolder(ui.documentToDownload, folderId);
          }
        }}
      />

      {/* Smart Resume Editor Panel */}
      <ResumeProcessorPanel
        isOpen={ui.showResumeProcessor}
        onClose={() =>
          dispatch({ type: "setShowResumeProcessor", value: false })
        }
      />

      {/* Extract Points Feature */}
      <ResumePointsExtractor
        isOpen={ui.showPointsExtractor}
        onClose={() =>
          dispatch({ type: "setShowPointsExtractor", value: false })
        }
      />
          </div>
        </div>
      </div>
    </div>
  );
};
