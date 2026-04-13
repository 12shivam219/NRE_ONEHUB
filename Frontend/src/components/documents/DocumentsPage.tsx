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
  Monitor,
  MoreVertical,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
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
import type { Database } from "../../lib/database.types";
import { debounce, formatFileSize } from "../../lib/utils";
import { getRelativeTime } from "../../lib/dateFormatter";
import { useToast } from "../../contexts/ToastContext";
import { useDocumentsInfinite } from "../../hooks/useDocumentsInfinite";
import { useFolders } from "../../hooks/useFolders";
import { FolderSidebar } from "./FolderSidebar";
import { CreateFolderModal } from "./CreateFolderModal";
import { ResumeProcessorPanel } from "./ResumeProcessorPanel";
import { ResumePointsExtractor } from "./ResumePointsExtractor";
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
  sidebarOpen: boolean;
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
  | { type: "toggleSidebar" }
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
  sidebarOpen: true,
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
    case "toggleSidebar":
      return { ...state, sidebarOpen: !state.sidebarOpen };
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
  }) => {
    const { doc, selected, onToggle, onPreview, onDownload, onDelete, onCopy } = props;

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
        className={`grid grid-cols-[44px_1fr_110px_110px_130px_140px] items-center px-4 py-3 border-b border-slate-100 cursor-pointer transition-all ${
          selected ? "bg-blue-50 border-l-4 border-l-blue-600" : "bg-white hover:bg-slate-50"
        } focus-ring`}
        onClick={() => onPreview(doc)}
        onKeyDown={handleRowKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Preview document ${doc.original_filename}`}
      >
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(doc.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${selected ? "Deselect" : "Select"} ${
              doc.original_filename
            }`}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm font-semibold text-slate-900 truncate hover:text-blue-600">
              {doc.original_filename}
            </span>
          </div>
        </div>
        <div className="text-right text-sm font-medium text-slate-700">
          <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md text-xs">v{doc.version}</span>
        </div>
        <div className="text-right text-sm text-slate-600 font-medium">
          {formatFileSize(doc.file_size)}
        </div>
        <div className="text-right text-sm text-slate-600">
          {getRelativeTime(doc.created_at)}
        </div>
        <div className="flex items-center justify-end gap-2">
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

const MobileDocumentCard = memo(
  (props: {
    doc: Document;
    selected: boolean;
    onToggle: (id: string) => void;
    onPreview: (doc: Document) => void;
    onDownload: (doc: Document) => void;
    onDelete: (id: string) => void;
    onCopy: (doc: Document) => void;
  }) => {
    const { doc, selected, onToggle, onPreview, onDownload, onDelete, onCopy } = props;

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { 
    folders: _folders, 
    createNewFolder,
    refresh: _refreshFolders,
  } = useFolders(currentFolderId);

  type DocumentsPageData = {
    documents: Document[];
    cursorCreatedAt: string | null;
    hasNextPage: boolean;
  };

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
  }, [search, currentFolderId, reset]);

  const selectedDocIds = useMemo(
    () => Array.from(ui.selectedDocs),
    [ui.selectedDocs]
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

    const docsToEdit = documents.filter((doc) => ui.selectedDocs.has(doc.id));
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
    documents,
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
  }, [ui.searchValue, debouncedUpdateSearch]);

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

      const result = await uploadDocument(file, user.id, 'local', undefined, currentFolderId);
      clearInterval(progressInterval);

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

    // Clear all pending timeouts to prevent state conflicts
    pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    pendingTimeoutsRef.current = [];

    await refreshDocuments();
    dispatch({ type: "setUploading", value: false });
    dispatch({ type: "setUploadProgress", value: {} });

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

    dispatch({ type: "closeDeleteConfirm" });
    dispatch({ type: "removeSelectedDoc", docId: documentId });
    
    // Close preview if the deleted document was being previewed
    if (ui.selectedDocumentPreview?.id === documentId) {
      dispatch({ type: "setSelectedDocumentPreview", value: null });
    }

    const removeFromPages = (
      pages: DocumentsPageData[] | undefined
    ): DocumentsPageData[] => {
      if (!pages) return [];
      return pages
        .map((p) => ({
          ...p,
          documents: (p.documents || []).filter((d) => d.id !== documentId),
        }))
        .filter((p) => p.documents.length > 0); // Remove empty pages
    };

    try {
      // Delete the document from the API
      const result = await deleteDocument(documentId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete document");
      }

      // Update the cache by filtering out the deleted document from all pages
      await mutateDocuments(
        (currentPages?: DocumentsPageData[]) => {
          if (!currentPages) return undefined;
          const filtered = removeFromPages(currentPages);
          return filtered;
        },
        {
          revalidate: false,
          populateCache: true,
        }
      );

      showToast({
        type: "success",
        title: "Document deleted",
        message: "The document has been removed.",
      });
    } catch (err) {
      // On error, revalidate to ensure the UI is in sync with server
      await mutateDocuments();
      
      showToast({
        type: "error",
        title: "Failed to delete document",
        message:
          err instanceof Error ? err.message : "Failed to delete document",
      });
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

    const removeFromPages = (
      pages: DocumentsPageData[] | undefined
    ): DocumentsPageData[] => {
      if (!pages) return [];
      return pages
        .map((p) => ({
          ...p,
          documents: (p.documents || []).filter((d) => !documentIds.includes(d.id)),
        }))
        .filter((p) => p.documents.length > 0); // Remove empty pages
    };

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

      // Update the cache by filtering out the deleted documents from all pages
      await mutateDocuments(
        (currentPages?: DocumentsPageData[]) => {
          if (!currentPages) return undefined;
          const filtered = removeFromPages(currentPages);
          return filtered;
        },
        {
          revalidate: false,
          populateCache: true,
        }
      );

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
      const result = await saveDocumentToAppFolder(document.id, user?.id || '', folderId);
      if (result.success) {
        await refreshDocuments();
        showToast({
          type: 'success',
          title: 'Saved to App Folder',
          message: `${document.original_filename} has been saved to your application folder.`,
        });
      } else if (result.error) {
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

  const handleCreateFolder = useCallback(
    async (name: string, description?: string) => {
      try {
        await createNewFolder(name, description);
        dispatch({ type: "setShowCreateFolderModal", value: false });
        showToast({
          type: "success",
          title: "Folder created",
          message: `"${name}" folder has been created successfully.`,
        });
        // Refresh documents to show in the list
        mutateDocuments?.();
      } catch (error) {
        showToast({
          type: "error",
          title: "Failed to create folder",
          message: error instanceof Error ? error.message : "Failed to create folder",
        });
        throw error;
      }
    },
    [createNewFolder, showToast, mutateDocuments]
  );

  const toggleDocSelection = useCallback((docId: string) => {
    dispatch({ type: "toggleSelectedDoc", docId });
  }, []);

  const handlePreview = useCallback((doc: Document) => {
    dispatch({ type: "setSelectedDocumentPreview", value: doc });
  }, []);

  const handleRowDelete = useCallback(
    (documentId: string) => {
      handleDeleteClick(documentId);
    },
    [handleDeleteClick]
  );

  const rowVirtualizer = useVirtualizer({
    count: documents.length,
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
    if (last.index >= documents.length - 10) {
      void loadMore();
    }
  }, [
    virtualRows,
    documents.length,
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

  // Callback to refresh sidebar when a folder is created
  const handleFolderCreated = useCallback(() => {
    // This callback will be called when folderCreateCounter changes
    // FolderSidebar will use it to trigger a refresh
  }, []);

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
    <div className="flex flex-col md:flex-row h-screen overflow-hidden w-full">
      {/* Folder Sidebar - Desktop only, collapsible */}
      {!isMobile && (
        <div
          className={`hidden md:flex md:flex-col flex-shrink-0 h-full transition-all duration-300 border-r border-gray-200 bg-gray-50 overflow-hidden ${
            ui.sidebarOpen ? "w-64" : "w-0"
          }`}
        >
          {ui.sidebarOpen && (
            <FolderSidebar
              currentFolderId={currentFolderId}
              onFolderSelect={setCurrentFolderId}
              onCreateFolder={() =>
                dispatch({ type: "setShowCreateFolderModal", value: true })
              }
              onFolderDeleted={() => {
                // Refresh documents list after folder is deleted
                mutateDocuments?.();
              }}
              onFolderCreated={handleFolderCreated}
            />
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header - Minimalist with All Actions in Dropdown */}
        <div className="flex items-center justify-between gap-4 px-3 sm:px-4 md:px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50 min-h-16">
          {/* Left Section: Sidebar Toggle + Breadcrumb */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Sidebar Toggle Button */}
            {!isMobile && (
              <button
                onClick={() => dispatch({ type: "toggleSidebar" })}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-all duration-200 flex-shrink-0 text-slate-500 hover:text-slate-700 flex items-center justify-center"
                title={ui.sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                aria-label={ui.sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {ui.sidebarOpen ? (
                  <ChevronLeft className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            )}

            {/* Breadcrumb - My Documents (Icon only on mobile) */}
            {(currentFolderId || !isMobile) && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
                    <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="font-semibold text-sm text-slate-700 whitespace-nowrap hidden sm:inline">My Documents</span>
              </div>
            )}
          </div>

          {/* Center Section: Search Bar */}
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-md relative">
              <input
                id="documents-search"
                value={ui.searchValue}
                onChange={(e) =>
                  dispatch({ type: "setSearchValue", value: e.target.value })
                }
                placeholder="Search..."
                className="w-full px-3 py-2.5 pl-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder:text-slate-400 bg-white hover:border-slate-400"
                aria-label="Search documents"
              />
              <svg className="absolute left-3 top-3 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {ui.searchValue && (
                <button
                  onClick={() => dispatch({ type: "setSearchValue", value: "" })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition rounded p-0.5"
                  aria-label="Clear search"
                >
                  <span className="text-lg leading-none">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Section: More Options Dropdown Button */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowActionMenu(!showActionMenu)}
              className="inline-flex items-center justify-center p-2 bg-white border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 hover:scale-105 active:scale-95"
              title="More options"
              aria-label="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Dropdown Menu */}
            {showActionMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 overflow-hidden">
                {/* Upload Option */}
                <label className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-blue-50 transition-colors text-sm font-medium cursor-pointer"
                  onClick={() => setShowActionMenu(false)}
                >
                  <Upload className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>Upload Documents</span>
                  <input
                    type="file"
                    multiple
                    accept=".doc,.docx,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={ui.uploading}
                  />
                </label>

                {/* Extract Points Option */}
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "setShowPointsExtractor", value: true });
                    setShowActionMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-amber-50 transition-colors text-sm font-medium border-t border-slate-100"
                >
                  <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Extract Points</span>
                </button>

                {/* Resume Editor Option */}
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "setShowResumeProcessor", value: true });
                    setShowActionMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-purple-50 transition-colors text-sm font-medium border-t border-slate-100"
                >
                  <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span>Smart Editor</span>
                </button>

                {/* Google Drive Option */}
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "setShowGoogleDrive", value: true });
                    setShowActionMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-blue-50 transition-colors text-sm font-medium border-t border-slate-100"
                >
                  <Cloud className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>Import from Drive</span>
                </button>

                {/* New Folder Option */}
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: "setShowCreateFolderModal", value: true });
                    setShowActionMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-amber-50 transition-colors text-sm font-medium border-t border-slate-100"
                >
                  <FolderPlus className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>New Folder</span>
                </button>

                {/* Paste Option - Conditional */}
                {ui.copiedDocument && (
                  <>
                    <div className="border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        handlePasteDocument();
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-emerald-700 hover:bg-emerald-50 transition-colors text-sm font-medium"
                    >
                      <ClipboardPaste className="w-4 h-4 flex-shrink-0" />
                      <span>Paste Document</span>
                    </button>
                  </>
                )}

                {/* Select All Option */}
                {documents.length > 0 && (
                  <>
                    <div className="border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDocIds.length === documents.length) {
                          dispatch({ type: "clearSelection" });
                        } else {
                          dispatch({ type: "selectAllDocs", docIds: documents.map(d => d.id) });
                        }
                        setShowActionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-blue-50 transition-colors text-sm font-medium"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocIds.length === documents.length && documents.length > 0}
                        readOnly
                        className="w-4 h-4 rounded cursor-pointer flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span>{selectedDocIds.length === documents.length ? "Deselect All" : "Select All"}</span>
                    </button>
                  </>
                )}
              </div>
            )}
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

            {selectedDocIds.length > 0 && (
        <div className="mb-6 p-5 bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-600 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-lg text-sm font-bold">
              {selectedDocIds.length}
            </div>
            <span className="text-slate-900 font-semibold text-sm">
              {selectedDocIds.length > 1 ? `${selectedDocIds.length} documents selected` : "1 document selected"}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={openEditor}
              onMouseEnter={() => {
                editorPromise();
              }}
              onFocus={() => {
                editorPromise();
              }}
              disabled={isMobile}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                isMobile
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg"
              }`}
              title={
                isMobile
                  ? "Resume editor is only available on desktop"
                  : "Edit selected documents"
              }
            >
              {isMobile ? (
                <>
                  <Monitor className="w-4 h-4" />
                  Desktop Only
                </>
              ) : (
                <>
                  <Edit className="w-4 h-4" />
                  Edit
                </>
              )}
            </button>

            <button
              onClick={() => dispatch({ type: "openBulkDeleteConfirm" })}
              disabled={ui.deletingInProgress}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 rounded-lg font-medium text-sm transition-all ${
                ui.deletingInProgress
                  ? "border-red-300 bg-red-50 text-red-500 opacity-50 cursor-not-allowed"
                  : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400 shadow-sm hover:shadow-md"
              }`}
              title={ui.deletingInProgress ? "Deleting..." : "Delete selected documents"}
              aria-label="Delete all selected documents"
            >
              <span className={ui.deletingInProgress ? "inline-block animate-spin" : ""}>
                <Trash2 className="w-4 h-4" />
              </span>
              {ui.deletingInProgress ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      )}

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

            {documents.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 shadow-sm hover:shadow-md transition-all">
          {/* Decorative background elements */}
          <div className="absolute inset-0 opacity-0 hover:opacity-5 transition-opacity" />
          
          {/* Content */}
          <div className="relative px-8 py-24 sm:py-32 text-center">
            {/* Icon Container - Modern gradient */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-600 rounded-2xl blur-2xl opacity-20" />
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center border border-blue-200 shadow-lg">
                  <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Heading & Description */}
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Start Your Resume Collection
            </h3>
            <p className="text-slate-600 mb-2 text-base sm:text-lg max-w-2xl mx-auto">
              Upload your professional resumes and unlock AI-powered insights
            </p>
            <p className="text-slate-500 mb-8 text-sm sm:text-base max-w-2xl mx-auto">
              Extract key points, receive intelligent recommendations, and optimize for any position
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
              <div className="p-4 rounded-xl bg-white/60 border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="text-2xl mb-2">🚀</div>
                <p className="text-sm font-semibold text-slate-900 mb-1">AI Analysis</p>
                <p className="text-xs text-slate-600">Extract & optimize points intelligently</p>
              </div>
              <div className="p-4 rounded-xl bg-white/60 border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="text-2xl mb-2">📄</div>
                <p className="text-sm font-semibold text-slate-900 mb-1">Multi-Format</p>
                <p className="text-xs text-slate-600">PDF, DOCX, DOC fully supported</p>
              </div>
              <div className="p-4 rounded-xl bg-white/60 border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="text-2xl mb-2">⚡</div>
                <p className="text-sm font-semibold text-slate-900 mb-1">Fast & Secure</p>
                <p className="text-xs text-slate-600">Enterprise-grade processing</p>
              </div>
            </div>

            {/* Primary CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <label className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer group">
                <Upload className="w-5 h-5 group-hover:animate-bounce" />
                Upload Your First Resume
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
                onClick={() =>
                  dispatch({ type: "setShowGoogleDrive", value: true })
                }
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all"
              >
                <Cloud className="w-5 h-5" />
                Import from Google Drive
              </button>
            </div>

            {isMobile && (
              <p className="text-xs text-slate-500 text-center mt-6">
                <Monitor className="inline w-4 h-4 mr-1" />
                Full editor features available on desktop
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="card-base overflow-visible">
          {isMobile ? (
            <div className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <MobileDocumentCard
                  key={doc.id}
                  doc={doc}
                  selected={ui.selectedDocs.has(doc.id)}
                  onToggle={toggleDocSelection}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  onDelete={handleRowDelete}
                  onCopy={handleCopyDocument}
                />
              ))}
              {(loadingMore || hasMore) && (
                <div className="px-4 py-3 text-xs text-gray-500">
                  {loadingMore
                    ? "Loading more documents..."
                    : "Scroll to load more"}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[44px_1fr_110px_110px_130px_140px] items-center px-4 py-3 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                <div />
                <div>Filename</div>
                <div className="text-right">Version</div>
                <div className="text-right">Size</div>
                <div className="text-right">Created</div>
                <div className="text-right">Actions</div>
              </div>

              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {virtualRows.map((vr) => {
                  const doc = documents[vr.index];
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
                      />
                    </div>
                  );
                })}
              </div>

              {(loadingMore || hasMore) && (
                <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
                  {loadingMore
                    ? "Loading more documents..."
                    : "Scroll to load more"}
                </div>
              )}
            </>
          )}
        </div>
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
