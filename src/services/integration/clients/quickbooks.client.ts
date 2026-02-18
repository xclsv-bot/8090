import { createApiClient, ApiResponse } from '../api-client.service.js';
import { 
  quickBooksInvoiceMapper, 
  QuickBooksInvoice, 
  InternalInvoice,
  transformBatch 
} from '../data-mapper.service.js';
import { logger } from '../../../utils/logger.js';

const QUICKBOOKS_REALM_ID = process.env.QUICKBOOKS_REALM_ID || '9130349596441806';

const client = createApiClient({
  integration: 'quickbooks',
  baseUrl: `https://quickbooks.api.intuit.com/v3/company/${QUICKBOOKS_REALM_ID}`,
  defaultHeaders: {
    'Accept': 'application/json',
  },
  retryConfig: {
    maxAttempts: 3,
    initialDelayMs: 2000,
  },
});

// =============================================
// Invoice Operations
// =============================================

export async function getInvoice(invoiceId: string): Promise<ApiResponse<InternalInvoice>> {
  const response = await client.get<{ Invoice: QuickBooksInvoice }>(
    `/invoice/${invoiceId}`,
    'get_invoice'
  );

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  return {
    ...response,
    data: quickBooksInvoiceMapper.toInternal(response.data.Invoice),
  };
}

export async function listInvoices(params?: {
  startPosition?: number;
  maxResults?: number;
  query?: string;
}): Promise<ApiResponse<{ invoices: InternalInvoice[]; totalCount: number }>> {
  const { startPosition = 1, maxResults = 100, query } = params || {};
  
  let queryStr = `SELECT * FROM Invoice`;
  if (query) {
    queryStr += ` WHERE ${query}`;
  }
  queryStr += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const response = await client.get<{
    QueryResponse: {
      Invoice?: QuickBooksInvoice[];
      totalCount?: number;
      startPosition?: number;
      maxResults?: number;
    };
  }>(`/query?query=${encodeURIComponent(queryStr)}`, 'list_invoices');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const invoices = response.data.QueryResponse.Invoice || [];
  const { successful } = transformBatch(invoices, quickBooksInvoiceMapper);

  return {
    ...response,
    data: {
      invoices: successful,
      totalCount: response.data.QueryResponse.totalCount || invoices.length,
    },
  };
}

export async function createInvoice(
  invoice: Omit<InternalInvoice, 'externalId' | 'createdAt' | 'updatedAt' | 'source'>
): Promise<ApiResponse<InternalInvoice>> {
  const qbInvoice = quickBooksInvoiceMapper.toExternal({
    ...invoice,
    externalId: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    source: 'quickbooks',
  });

  // Remove Id for creation
  const { Id, ...createPayload } = qbInvoice;

  const response = await client.post<{ Invoice: QuickBooksInvoice }>(
    '/invoice',
    createPayload,
    'create_invoice'
  );

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  return {
    ...response,
    data: quickBooksInvoiceMapper.toInternal(response.data.Invoice),
  };
}

// =============================================
// Customer Operations
// =============================================

export interface QuickBooksCustomer {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  Balance: number;
  MetaData: { CreateTime: string; LastUpdatedTime: string };
}

export interface InternalCustomer {
  externalId: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  balance: number;
  source: 'quickbooks';
}

export async function getCustomer(customerId: string): Promise<ApiResponse<InternalCustomer>> {
  const response = await client.get<{ Customer: QuickBooksCustomer }>(
    `/customer/${customerId}`,
    'get_customer'
  );

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const c = response.data.Customer;
  return {
    ...response,
    data: {
      externalId: c.Id,
      displayName: c.DisplayName,
      companyName: c.CompanyName || null,
      email: c.PrimaryEmailAddr?.Address || null,
      phone: c.PrimaryPhone?.FreeFormNumber || null,
      address: {
        line1: c.BillAddr?.Line1 || null,
        city: c.BillAddr?.City || null,
        state: c.BillAddr?.CountrySubDivisionCode || null,
        postalCode: c.BillAddr?.PostalCode || null,
      },
      balance: c.Balance,
      source: 'quickbooks',
    },
  };
}

export async function listCustomers(params?: {
  startPosition?: number;
  maxResults?: number;
}): Promise<ApiResponse<{ customers: InternalCustomer[]; totalCount: number }>> {
  const { startPosition = 1, maxResults = 100 } = params || {};
  
  const queryStr = `SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const response = await client.get<{
    QueryResponse: {
      Customer?: QuickBooksCustomer[];
      totalCount?: number;
    };
  }>(`/query?query=${encodeURIComponent(queryStr)}`, 'list_customers');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const customers = (response.data.QueryResponse.Customer || []).map(c => ({
    externalId: c.Id,
    displayName: c.DisplayName,
    companyName: c.CompanyName || null,
    email: c.PrimaryEmailAddr?.Address || null,
    phone: c.PrimaryPhone?.FreeFormNumber || null,
    address: {
      line1: c.BillAddr?.Line1 || null,
      city: c.BillAddr?.City || null,
      state: c.BillAddr?.CountrySubDivisionCode || null,
      postalCode: c.BillAddr?.PostalCode || null,
    },
    balance: c.Balance,
    source: 'quickbooks' as const,
  }));

  return {
    ...response,
    data: {
      customers,
      totalCount: response.data.QueryResponse.totalCount || customers.length,
    },
  };
}

// =============================================
// Payment Operations
// =============================================

export interface QuickBooksPayment {
  Id: string;
  TotalAmt: number;
  CustomerRef: { value: string; name?: string };
  TxnDate: string;
  DepositToAccountRef?: { value: string };
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{ TxnId: string; TxnType: string }>;
  }>;
  MetaData: { CreateTime: string; LastUpdatedTime: string };
}

export interface InternalPayment {
  externalId: string;
  amount: number;
  customerId: string;
  customerName: string | null;
  transactionDate: Date;
  linkedInvoiceIds: string[];
  source: 'quickbooks';
}

export async function listPayments(params?: {
  startPosition?: number;
  maxResults?: number;
  startDate?: string;
  endDate?: string;
}): Promise<ApiResponse<{ payments: InternalPayment[]; totalCount: number }>> {
  const { startPosition = 1, maxResults = 100, startDate, endDate } = params || {};
  
  let queryStr = `SELECT * FROM Payment`;
  const conditions: string[] = [];
  
  if (startDate) conditions.push(`TxnDate >= '${startDate}'`);
  if (endDate) conditions.push(`TxnDate <= '${endDate}'`);
  
  if (conditions.length > 0) {
    queryStr += ` WHERE ${conditions.join(' AND ')}`;
  }
  queryStr += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const response = await client.get<{
    QueryResponse: {
      Payment?: QuickBooksPayment[];
      totalCount?: number;
    };
  }>(`/query?query=${encodeURIComponent(queryStr)}`, 'list_payments');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const payments = (response.data.QueryResponse.Payment || []).map(p => ({
    externalId: p.Id,
    amount: p.TotalAmt,
    customerId: p.CustomerRef.value,
    customerName: p.CustomerRef.name || null,
    transactionDate: new Date(p.TxnDate),
    linkedInvoiceIds: p.Line.flatMap(l => 
      l.LinkedTxn.filter(t => t.TxnType === 'Invoice').map(t => t.TxnId)
    ),
    source: 'quickbooks' as const,
  }));

  return {
    ...response,
    data: {
      payments,
      totalCount: response.data.QueryResponse.totalCount || payments.length,
    },
  };
}

// =============================================
// Reports
// =============================================

export async function getProfitAndLoss(params: {
  startDate: string;
  endDate: string;
}): Promise<ApiResponse<unknown>> {
  const { startDate, endDate } = params;
  
  return client.get(
    `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`,
    'profit_and_loss_report'
  );
}

export async function getBalanceSheet(params: {
  asOfDate: string;
}): Promise<ApiResponse<unknown>> {
  return client.get(
    `/reports/BalanceSheet?date_macro=Custom&start_date=${params.asOfDate}&end_date=${params.asOfDate}`,
    'balance_sheet_report'
  );
}

// Export client for direct use if needed
export { client as quickbooksClient };
