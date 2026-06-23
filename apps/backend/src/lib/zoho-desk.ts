import { z } from 'zod';

const ZohoTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive().optional(),
  api_domain: z.string().url().optional(),
});

const ZohoContactSchema = z.object({
  email: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
}).passthrough();

const ZohoTicketSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  ticketNumber: z.union([z.string(), z.number()]).transform(String),
  subject: z.string().default('Untitled support ticket'),
  status: z.string().default('Unknown'),
  email: z.string().optional().nullable(),
  webUrl: z.string().url().optional().nullable(),
  contact: ZohoContactSchema.optional().nullable(),
}).passthrough();

const ZohoTicketSearchSchema = z.object({
  data: z.array(ZohoTicketSchema).default([]),
}).passthrough();

const ZohoDepartmentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  isEnabled: z.boolean().optional().default(true),
}).passthrough();

const ZohoDepartmentListSchema = z.object({
  data: z.array(ZohoDepartmentSchema).default([]),
}).passthrough();

export type ZohoDeskTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  email: string | null;
  contactName: string | null;
  url: string | null;
};

let tokenCache: {
  accessToken: string;
  expiresAt: number;
} | null = null;
let departmentCache: {
  id: string;
  expiresAt: number;
} | null = null;

const env = (key: string) => process.env[key]?.trim() || '';

export const isZohoDeskEnabled = () => env('ZOHO_DESK_ENABLED') === 'true';

export const normalizeZohoTicketReference = (reference: string) => {
  const clean = reference.trim();
  if (!clean) return '';

  try {
    const url = new URL(clean);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments.at(-1)?.replace(/^#/, '') || '';
  } catch {
    return clean.replace(/^#/, '');
  }
};

const getZohoConfig = () => {
  if (!isZohoDeskEnabled()) {
    throw new Error('Zoho Desk integration is disabled.');
  }

  const config = {
    clientId: env('ZOHO_DESK_CLIENT_ID'),
    clientSecret: env('ZOHO_DESK_CLIENT_SECRET'),
    refreshToken: env('ZOHO_DESK_REFRESH_TOKEN'),
    organizationId: env('ZOHO_DESK_ORG_ID'),
    accountsUrl: env('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com',
    apiUrl: env('ZOHO_DESK_API_URL') || 'https://desk.zoho.com/api/v1',
  };

  const missing = Object.entries(config)
    .filter(([key, value]) =>
      ['clientId', 'clientSecret', 'refreshToken', 'organizationId'].includes(key) && !value
    )
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Zoho Desk configuration is incomplete: ${missing.join(', ')}.`);
  }

  return config;
};

const getAccessToken = async () => {
  const config = getZohoConfig();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return {
      accessToken: tokenCache.accessToken,
      config,
    };
  }

  const tokenUrl = new URL('/oauth/v2/token', config.accountsUrl);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  } as any);
  const payload: unknown = await response.json();
  const oauthError =
    payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as Record<string, unknown>).error)
      : null;
  if (!response.ok || oauthError) {
    const error =
      oauthError || `HTTP ${response.status}`;
    throw new Error(`Zoho OAuth token refresh failed: ${error}.`);
  }

  const token = ZohoTokenResponseSchema.parse(payload);
  tokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
  return {
    accessToken: token.access_token,
    config,
  };
};

const fetchZoho = async (
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
) => {
  const { accessToken, config } = await getAccessToken();
  const apiBase = config.apiUrl.replace(/\/$/, '');
  const response = await fetch(new URL(path.replace(/^\//, ''), `${apiBase}/`), {
    method: init.method || 'GET',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      orgId: config.organizationId,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  } as any);
  const responseText = await response.text();
  const payload: unknown = responseText ? JSON.parse(responseText) : null;
  if (response.status === 204 || (!responseText && response.ok)) return null;
  if (!response.ok) {
    if (response.status === 404) return null;
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as Record<string, unknown>).message)
        : `HTTP ${response.status}`;
    if (/scope/i.test(message) && path.startsWith('/tickets/search')) {
      throw new Error(
        'Zoho Desk ticket-number lookup requires the Desk.search.READ OAuth scope.'
      );
    }
    throw new Error(`Zoho Desk request failed: ${message}.`);
  }
  return payload;
};

const getSupportDepartmentId = async () => {
  const configuredDepartmentId = env('ZOHO_DESK_DEPARTMENT_ID');
  if (configuredDepartmentId) return configuredDepartmentId;
  if (departmentCache && departmentCache.expiresAt > Date.now()) {
    return departmentCache.id;
  }

  const payload = await fetchZoho('/departments?limit=100');
  const departments = ZohoDepartmentListSchema.parse(payload).data
    .filter((department) => department.isEnabled);
  if (departments.length !== 1) {
    throw new Error(
      'ZOHO_DESK_DEPARTMENT_ID is required when Zoho Desk has zero or multiple active departments.'
    );
  }

  departmentCache = {
    id: departments[0].id,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  return departments[0].id;
};

const toTicket = (ticket: z.infer<typeof ZohoTicketSchema>): ZohoDeskTicket => {
  const contactName = [ticket.contact?.firstName, ticket.contact?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    email: ticket.contact?.email || ticket.email || null,
    contactName: contactName || null,
    url: ticket.webUrl || null,
  };
};

export const getZohoDeskTicket = async (reference: string): Promise<ZohoDeskTicket> => {
  const normalized = normalizeZohoTicketReference(reference);
  if (!normalized) throw new Error('Zoho Desk ticket reference is required.');

  const searchPayload = await fetchZoho(
    `/tickets/search?ticketNumber=${encodeURIComponent(normalized)}&limit=1`
  );
  if (searchPayload) {
    const search = ZohoTicketSearchSchema.parse(searchPayload);
    const ticket = search.data[0];
    if (ticket) return toTicket(ticket);
  }

  const directPayload = await fetchZoho(`/tickets/${encodeURIComponent(normalized)}`);
  if (directPayload) {
    const direct = ZohoTicketSchema.safeParse(directPayload);
    if (direct.success) return toTicket(direct.data);
  }

  throw new Error(`Zoho Desk ticket ${normalized} was not found.`);
};

export type CreateZohoDeskTicketInput = {
  name: string;
  email: string;
  subject: string;
  description: string;
  category: string;
};

export const createZohoDeskTicket = async (
  input: CreateZohoDeskTicketInput
): Promise<ZohoDeskTicket> => {
  const departmentId = await getSupportDepartmentId();
  const payload = await fetchZoho('/tickets', {
    method: 'POST',
    body: {
      subject: input.subject,
      departmentId,
      description: input.description,
      category: input.category,
      channel: 'Web',
      priority: 'Medium',
      email: input.email,
      contact: {
        lastName: input.name,
        email: input.email,
      },
    },
  });
  const ticket = ZohoTicketSchema.parse(payload);
  return toTicket(ticket);
};
