// ECDAT API Client with Frozen Error Envelope parsing & X-Request-Id correlation
import { ApiError, ErrorEnvelope } from '../types/api';

const DEFAULT_BASE_URL = 'https://ecdat-api-oci7.onrender.com/api/v1';
const STORAGE_KEY_BASE_URL = 'ecdat_api_base_url';
const STORAGE_KEY_API_KEY = 'ecdat_api_key';

export function getBaseUrl(): string {
  return localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_BASE_URL, url.replace(/\/+$/, ''));
}

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || 'dev-ecdat-key';
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY_API_KEY, key);
}

export class ECDATApiError extends Error {
  code: string;
  details?: Record<string, any>;
  statusCode: number;
  requestId?: string;
  timestamp?: string;

  constructor(statusCode: number, envelope?: ErrorEnvelope, rawText?: string) {
    const error = envelope?.error;
    const message = error?.message || rawText || `HTTP ${statusCode} Error`;
    super(message);
    this.name = 'ECDATApiError';
    this.statusCode = statusCode;
    this.code = error?.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 401 ? 'UNAUTHORIZED' : 'UNKNOWN_ERROR');
    this.details = error?.details;
    this.requestId = envelope?.request_id;
    this.timestamp = envelope?.timestamp;
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

export interface ApiResponse<T> {
  data: T;
  requestId?: string;
  responseTimeMs?: number;
}

function generateRequestId(): string {
  return 'req_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  let url = `${baseUrl}${cleanEndpoint}`;
  if (options.params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    }
    const qStr = query.toString();
    if (qStr) {
      url += (url.includes('?') ? '&' : '?') + qStr;
    }
  }

  const requestId = generateRequestId();
  const headers = new Headers(options.headers || {});
  headers.set('X-API-Key', apiKey);
  headers.set('X-Request-Id', requestId);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const startTime = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: any) {
    throw new ECDATApiError(0, {
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: `Failed to connect to ECDAT backend at ${baseUrl}. Ensure backend is running. (${err.message})`,
      },
      timestamp: new Date().toISOString(),
      request_id: requestId,
    });
  }

  const duration = Math.round(performance.now() - startTime);
  const serverRequestId = response.headers.get('X-Request-Id') || requestId;
  const serverResponseTime = response.headers.get('X-Response-Time-ms')
    ? parseFloat(response.headers.get('X-Response-Time-ms')!)
    : duration;

  if (!response.ok) {
    let envelope: ErrorEnvelope | undefined;
    let rawText: string | undefined;
    try {
      const data = await response.json();
      if (data && data.error && data.error.code) {
        envelope = data as ErrorEnvelope;
      }
    } catch {
      try {
        rawText = await response.text();
      } catch {
        // ignore
      }
    }
    throw new ECDATApiError(response.status, envelope, rawText);
  }

  // Handle binary/text responses (e.g. exports)
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/octet-stream') || contentType.includes('text/csv') || contentType.includes('text/markdown')) {
    const textOrBlob = await response.text();
    return {
      data: textOrBlob as unknown as T,
      requestId: serverRequestId,
      responseTimeMs: serverResponseTime,
    };
  }

  const data = (await response.json()) as T;
  return {
    data,
    requestId: serverRequestId,
    responseTimeMs: serverResponseTime,
  };
}
