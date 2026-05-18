import type { Database } from './database.types';

type Document = Database['public']['Tables']['documents']['Row'];

export interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    permissions: {
      download: boolean;
      edit: boolean;
      print: boolean;
    };
    title: string;
    url: string;
  };
  documentType: 'word' | 'cell' | 'slide';
  editorConfig: {
    callbackUrl: string;
    customization: {
      autosave: boolean;
      compactHeader: boolean;
      compactToolbar: boolean;
      forcesave: boolean;
      toolbarHideFileName: boolean;
    };
    mode: 'edit' | 'view';
    user: {
      id: string;
      name: string;
    };
  };
  events?: Record<string, unknown>;
  height: string;
  token?: string;
  type: 'desktop';
  width: string;
}

export interface OnlyOfficeDocEditorInstance {
  destroyEditor?: () => void;
}

export interface OnlyOfficeApi {
  DocEditor: new (elementId: string, config: OnlyOfficeConfig) => OnlyOfficeDocEditorInstance;
}

declare global {
  interface Window {
    DocsAPI?: OnlyOfficeApi;
  }
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPT_MIME = 'application/vnd.ms-powerpoint';

const normalizeDocumentServerUrl = (value?: string) => value?.trim().replace(/\/+$/, '') ?? '';

export const getOnlyOfficeDocumentServerUrl = () =>
  normalizeDocumentServerUrl(import.meta.env.VITE_ONLYOFFICE_DOCUMENT_SERVER_URL);

export const isOnlyOfficeConfigured = () => getOnlyOfficeDocumentServerUrl().length > 0;

const isTruthyEnvValue = (value: unknown) =>
  typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());

export const isOnlyOfficeJwtDisabled = () =>
  isTruthyEnvValue(import.meta.env.VITE_ONLYOFFICE_DISABLE_JWT);

export const getOnlyOfficeFileType = (doc: Document) => {
  const fileName = (doc.original_filename || doc.filename || '').toLowerCase();

  if (fileName.includes('.')) {
    return fileName.split('.').pop() || 'docx';
  }

  switch (doc.mime_type) {
    case DOC_MIME:
      return 'doc';
    case XLSX_MIME:
      return 'xlsx';
    case XLS_MIME:
      return 'xls';
    case PPTX_MIME:
      return 'pptx';
    case PPT_MIME:
      return 'ppt';
    default:
      return DOCX_MIME === doc.mime_type ? 'docx' : 'docx';
  }
};

export const getOnlyOfficeDocumentType = (doc: Document): 'word' | 'cell' | 'slide' => {
  const fileType = getOnlyOfficeFileType(doc);

  if (['xls', 'xlsx', 'csv', 'ods'].includes(fileType)) {
    return 'cell';
  }

  if (['ppt', 'pptx', 'odp'].includes(fileType)) {
    return 'slide';
  }

  return 'word';
};

export const createOnlyOfficeDocumentKey = (doc: Document) => {
  const timestamp = new Date(doc.updated_at || doc.created_at || Date.now()).getTime();
  return `${doc.id}-${doc.version}-${timestamp}`;
};

export const loadOnlyOfficeApi = async (documentServerUrl: string): Promise<OnlyOfficeApi> => {
  if (window.DocsAPI) {
    return window.DocsAPI;
  }

  const scriptId = 'onlyoffice-docs-api-script';
  const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (existingScript) {
    await new Promise<void>((resolve, reject) => {
      if (window.DocsAPI) {
        resolve();
        return;
      }

      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('ONLYOFFICE API failed to load')), {
        once: true,
      });
    });

    if (!window.DocsAPI) {
      throw new Error('ONLYOFFICE API is unavailable after script load');
    }

    return window.DocsAPI;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${normalizeDocumentServerUrl(documentServerUrl)}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('ONLYOFFICE API failed to load'));
    document.head.appendChild(script);
  });

  if (!window.DocsAPI) {
    throw new Error('ONLYOFFICE API script loaded, but DocsAPI is missing');
  }

  return window.DocsAPI;
};
