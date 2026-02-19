import { createApiClient, ApiResponse } from '../api-client.service.js';
import { 
  rampTransactionMapper, 
  RampTransaction, 
  InternalTransaction,
  transformBatch 
} from '../data-mapper.service.js';
import { logger } from '../../../utils/logger.js';

const client = createApiClient({
  integration: 'ramp',
  baseUrl: 'https://api.ramp.com/developer/v1',
  defaultHeaders: {
    'Accept': 'application/json',
  },
});

// =============================================
// Transaction Operations
// =============================================

export interface TransactionFilters {
  from_date?: string;
  to_date?: string;
  department_id?: string;
  merchant_id?: string;
  state?: 'PENDING' | 'CLEARED' | 'DECLINED';
  min_amount?: number;
  max_amount?: number;
  page_size?: number;
  start?: string; // cursor for pagination
}

export async function listTransactions(
  filters?: TransactionFilters
): Promise<ApiResponse<{ 
  transactions: InternalTransaction[]; 
  nextCursor: string | null;
  hasMore: boolean;
}>> {
  const params = new URLSearchParams();
  
  if (filters) {
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.department_id) params.append('department_id', filters.department_id);
    if (filters.merchant_id) params.append('merchant_id', filters.merchant_id);
    if (filters.state) params.append('state', filters.state);
    if (filters.min_amount) params.append('min_amount', String(filters.min_amount * 100));
    if (filters.max_amount) params.append('max_amount', String(filters.max_amount * 100));
    if (filters.page_size) params.append('page_size', String(filters.page_size));
    if (filters.start) params.append('start', filters.start);
  }

  const queryString = params.toString();
  const endpoint = `/transactions${queryString ? `?${queryString}` : ''}`;

  const response = await client.get<{
    data: RampTransaction[];
    page: { next?: string };
  }>(endpoint, 'list_transactions');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const { successful } = transformBatch(response.data.data, rampTransactionMapper);

  return {
    ...response,
    data: {
      transactions: successful,
      nextCursor: response.data.page.next || null,
      hasMore: !!response.data.page.next,
    },
  };
}

export async function getTransaction(
  transactionId: string
): Promise<ApiResponse<InternalTransaction>> {
  const response = await client.get<RampTransaction>(
    `/transactions/${transactionId}`,
    'get_transaction'
  );

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  return {
    ...response,
    data: rampTransactionMapper.toInternal(response.data),
  };
}

// =============================================
// Card Operations
// =============================================

export interface RampCard {
  id: string;
  display_name: string;
  last_four: string;
  cardholder_id: string;
  cardholder_name: string;
  is_physical: boolean;
  state: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  spending_restrictions: {
    amount: number;
    interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'TOTAL';
    lock_date?: string;
    categories?: number[];
  };
}

export interface InternalCard {
  externalId: string;
  displayName: string;
  lastFour: string;
  cardholderId: string;
  cardholderName: string;
  isPhysical: boolean;
  status: 'active' | 'suspended' | 'terminated';
  spendLimit: number;
  spendInterval: string;
  source: 'ramp';
}

export async function listCards(params?: {
  cardholder_id?: string;
  state?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  page_size?: number;
  start?: string;
}): Promise<ApiResponse<{ cards: InternalCard[]; nextCursor: string | null }>> {
  const queryParams = new URLSearchParams();
  
  if (params?.cardholder_id) queryParams.append('cardholder_id', params.cardholder_id);
  if (params?.state) queryParams.append('state', params.state);
  if (params?.page_size) queryParams.append('page_size', String(params.page_size));
  if (params?.start) queryParams.append('start', params.start);

  const queryString = queryParams.toString();
  const endpoint = `/cards${queryString ? `?${queryString}` : ''}`;

  const response = await client.get<{
    data: RampCard[];
    page: { next?: string };
  }>(endpoint, 'list_cards');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const cards = response.data.data.map(c => ({
    externalId: c.id,
    displayName: c.display_name,
    lastFour: c.last_four,
    cardholderId: c.cardholder_id,
    cardholderName: c.cardholder_name,
    isPhysical: c.is_physical,
    status: c.state.toLowerCase() as 'active' | 'suspended' | 'terminated',
    spendLimit: c.spending_restrictions.amount / 100,
    spendInterval: c.spending_restrictions.interval,
    source: 'ramp' as const,
  }));

  return {
    ...response,
    data: {
      cards,
      nextCursor: response.data.page.next || null,
    },
  };
}

export async function suspendCard(cardId: string): Promise<ApiResponse<void>> {
  return client.post(`/cards/${cardId}/suspend`, {}, 'suspend_card');
}

export async function unsuspendCard(cardId: string): Promise<ApiResponse<void>> {
  return client.post(`/cards/${cardId}/unsuspend`, {}, 'unsuspend_card');
}

// =============================================
// Receipt Operations
// =============================================

export interface RampReceipt {
  id: string;
  transaction_id: string;
  user_id: string;
  receipt_url: string;
  created_at: string;
}

export async function listReceipts(params?: {
  transaction_id?: string;
  from_date?: string;
  to_date?: string;
  page_size?: number;
  start?: string;
}): Promise<ApiResponse<{ receipts: RampReceipt[]; nextCursor: string | null }>> {
  const queryParams = new URLSearchParams();
  
  if (params?.transaction_id) queryParams.append('transaction_id', params.transaction_id);
  if (params?.from_date) queryParams.append('from_date', params.from_date);
  if (params?.to_date) queryParams.append('to_date', params.to_date);
  if (params?.page_size) queryParams.append('page_size', String(params.page_size));
  if (params?.start) queryParams.append('start', params.start);

  const queryString = queryParams.toString();
  const endpoint = `/receipts${queryString ? `?${queryString}` : ''}`;

  const response = await client.get<{
    data: RampReceipt[];
    page: { next?: string };
  }>(endpoint, 'list_receipts');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  return {
    ...response,
    data: {
      receipts: response.data.data,
      nextCursor: response.data.page.next || null,
    },
  };
}

// =============================================
// User/Employee Operations
// =============================================

export interface RampUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  department_id: string;
  department_name: string;
  status: 'INVITE_PENDING' | 'USER_ACTIVE' | 'USER_SUSPENDED';
}

export interface InternalEmployee {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  departmentId: string;
  departmentName: string;
  status: 'pending' | 'active' | 'suspended';
  source: 'ramp';
}

export async function listUsers(params?: {
  department_id?: string;
  status?: 'INVITE_PENDING' | 'USER_ACTIVE' | 'USER_SUSPENDED';
  page_size?: number;
  start?: string;
}): Promise<ApiResponse<{ employees: InternalEmployee[]; nextCursor: string | null }>> {
  const queryParams = new URLSearchParams();
  
  if (params?.department_id) queryParams.append('department_id', params.department_id);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.page_size) queryParams.append('page_size', String(params.page_size));
  if (params?.start) queryParams.append('start', params.start);

  const queryString = queryParams.toString();
  const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

  const response = await client.get<{
    data: RampUser[];
    page: { next?: string };
  }>(endpoint, 'list_users');

  if (!response.success || !response.data) {
    return { ...response, data: undefined };
  }

  const employees = response.data.data.map(u => ({
    externalId: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    fullName: `${u.first_name} ${u.last_name}`,
    role: u.role,
    departmentId: u.department_id,
    departmentName: u.department_name,
    status: u.status === 'INVITE_PENDING' ? 'pending' as const 
          : u.status === 'USER_ACTIVE' ? 'active' as const 
          : 'suspended' as const,
    source: 'ramp' as const,
  }));

  return {
    ...response,
    data: {
      employees,
      nextCursor: response.data.page.next || null,
    },
  };
}

// =============================================
// Spend Analytics
// =============================================

export async function getSpendByDepartment(params: {
  from_date: string;
  to_date: string;
}): Promise<ApiResponse<Array<{
  departmentId: string;
  departmentName: string;
  totalSpend: number;
  transactionCount: number;
}>>> {
  // Ramp doesn't have a direct spend-by-department endpoint,
  // so we aggregate from transactions
  const allTransactions: InternalTransaction[] = [];
  let cursor: string | undefined;
  
  do {
    const response = await listTransactions({
      from_date: params.from_date,
      to_date: params.to_date,
      state: 'CLEARED',
      page_size: 100,
      start: cursor,
    });
    
    if (!response.success || !response.data) {
      return { ...response, data: undefined };
    }
    
    allTransactions.push(...response.data.transactions);
    cursor = response.data.nextCursor || undefined;
  } while (cursor);

  // Aggregate by department
  const byDepartment = allTransactions.reduce((acc, txn) => {
    const key = txn.departmentId;
    if (!acc[key]) {
      acc[key] = {
        departmentId: txn.departmentId,
        departmentName: txn.departmentName,
        totalSpend: 0,
        transactionCount: 0,
      };
    }
    acc[key].totalSpend += txn.amount;
    acc[key].transactionCount++;
    return acc;
  }, {} as Record<string, { departmentId: string; departmentName: string; totalSpend: number; transactionCount: number }>);

  return {
    success: true,
    data: Object.values(byDepartment).sort((a, b) => b.totalSpend - a.totalSpend),
  };
}

// Export client for direct use
export { client as rampClient };

// Re-export types for convenience
export type { 
  RampTransaction, 
  InternalTransaction,
} from '../data-mapper.service.js';
