import type { Database } from '../database.types';
import { supabase } from '../supabase';

type Document = Database['public']['Tables']['documents']['Row'];

const API_BASE_URL =
  import.meta.env.VITE_TEXT_PROCESSOR_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000';

const ONLYOFFICE_CALLBACK_BASE_URL =
  import.meta.env.VITE_ONLYOFFICE_CALLBACK_API_URL ||
  API_BASE_URL;

type ForceSaveResponse = {
  success: boolean;
  document?: Document;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return null;
  }
  return data.session.access_token;
}

/** @deprecated Prefer fetchOnlyOfficeCallbackUrl for production (signed callback). */
export const getOnlyOfficeCallbackUrl = (documentId: string, userId: string) =>
  `${ONLYOFFICE_CALLBACK_BASE_URL}/api/onlyoffice/callback/${encodeURIComponent(documentId)}?user_id=${encodeURIComponent(userId)}`;

/**
 * Ask the API for a signed ONLYOFFICE callback URL (Document Server must reach this URL).
 */
export async function fetchOnlyOfficeCallbackUrl(documentId: string): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('You must be signed in to open the document editor.');
  }

  const response = await fetch(`${API_BASE_URL}/api/onlyoffice/callback-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ document_id: documentId }),
  });

  const payload = (await response.json().catch(() => ({}))) as { url?: string; detail?: unknown };

  if (!response.ok) {
    const detail =
      typeof payload.detail === 'string'
        ? payload.detail
        : Array.isArray(payload.detail)
          ? 'Request validation failed'
          : `Failed to build ONLYOFFICE callback URL (HTTP ${response.status})`;
    throw new Error(detail);
  }

  if (!payload.url) {
    throw new Error('API did not return a callback URL');
  }

  return payload.url;
}

export const forceSaveOnlyOfficeDocument = async (
  documentId: string,
  documentKey: string,
  userId: string
): Promise<ForceSaveResponse> => {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, error: 'You must be signed in to save.' };
  }

  const response = await fetch(`${API_BASE_URL}/api/onlyoffice/forcesave`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      documentId,
      documentKey,
      userId,
    }),
  });

  let payload: ForceSaveResponse;

  try {
    payload = (await response.json()) as ForceSaveResponse;
  } catch {
    payload = {
      success: false,
      error: `ONLYOFFICE save request failed with HTTP ${response.status}`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error: payload.error || `ONLYOFFICE save request failed with HTTP ${response.status}`,
    };
  }

  return payload;
};
