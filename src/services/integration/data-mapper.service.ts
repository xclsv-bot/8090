import { logger } from '../../utils/logger.js';
import { IntegrationType } from '../oauth/oauth.service.js';

/**
 * Generic data mapper for transforming external data to internal schema
 */
export interface DataMapper<TExternal, TInternal> {
  toInternal(external: TExternal): TInternal;
  toExternal(internal: TInternal): TExternal;
  validate(data: unknown): data is TExternal;
}

// =============================================
// QuickBooks Data Mappers
// =============================================

export interface QuickBooksInvoice {
  Id: string;
  DocNumber: string;
  CustomerRef: { value: string; name?: string };
  TotalAmt: number;
  Balance: number;
  DueDate: string;
  TxnDate: string;
  Line: Array<{
    DetailType: string;
    Amount: number;
    Description?: string;
    SalesItemLineDetail?: {
      ItemRef: { value: string; name?: string };
      Qty: number;
      UnitPrice: number;
    };
  }>;
  MetaData: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

export interface InternalInvoice {
  externalId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  balance: number;
  dueDate: Date;
  transactionDate: Date;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
  source: IntegrationType;
}

export const quickBooksInvoiceMapper: DataMapper<QuickBooksInvoice, InternalInvoice> = {
  toInternal(external: QuickBooksInvoice): InternalInvoice {
    return {
      externalId: external.Id,
      invoiceNumber: external.DocNumber,
      customerId: external.CustomerRef.value,
      customerName: external.CustomerRef.name || '',
      totalAmount: external.TotalAmt,
      balance: external.Balance,
      dueDate: new Date(external.DueDate),
      transactionDate: new Date(external.TxnDate),
      lineItems: external.Line
        .filter(line => line.DetailType === 'SalesItemLineDetail')
        .map(line => ({
          description: line.Description || line.SalesItemLineDetail?.ItemRef.name || '',
          quantity: line.SalesItemLineDetail?.Qty || 1,
          unitPrice: line.SalesItemLineDetail?.UnitPrice || line.Amount,
          amount: line.Amount,
        })),
      createdAt: new Date(external.MetaData.CreateTime),
      updatedAt: new Date(external.MetaData.LastUpdatedTime),
      source: 'quickbooks',
    };
  },

  toExternal(internal: InternalInvoice): QuickBooksInvoice {
    return {
      Id: internal.externalId,
      DocNumber: internal.invoiceNumber,
      CustomerRef: { value: internal.customerId, name: internal.customerName },
      TotalAmt: internal.totalAmount,
      Balance: internal.balance,
      DueDate: internal.dueDate.toISOString().split('T')[0],
      TxnDate: internal.transactionDate.toISOString().split('T')[0],
      Line: internal.lineItems.map(item => ({
        DetailType: 'SalesItemLineDetail',
        Amount: item.amount,
        Description: item.description,
        SalesItemLineDetail: {
          ItemRef: { value: '', name: item.description },
          Qty: item.quantity,
          UnitPrice: item.unitPrice,
        },
      })),
      MetaData: {
        CreateTime: internal.createdAt.toISOString(),
        LastUpdatedTime: internal.updatedAt.toISOString(),
      },
    };
  },

  validate(data: unknown): data is QuickBooksInvoice {
    const obj = data as QuickBooksInvoice;
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj.Id === 'string' &&
      typeof obj.TotalAmt === 'number' &&
      typeof obj.CustomerRef === 'object'
    );
  },
};

// =============================================
// Ramp Data Mappers
// =============================================

export interface RampTransaction {
  id: string;
  amount: number;
  card_id: string;
  card_holder: {
    department_id: string;
    department_name: string;
    first_name: string;
    last_name: string;
  };
  merchant_id: string;
  merchant_name: string;
  merchant_category_code: string;
  sk_category_id: number;
  sk_category_name: string;
  state: 'PENDING' | 'CLEARED' | 'DECLINED';
  user_transaction_time: string;
  receipts: Array<{ id: string; url: string }>;
  memo: string;
}

export interface InternalTransaction {
  externalId: string;
  amount: number;
  cardId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  merchantId: string;
  merchantName: string;
  categoryCode: string;
  categoryName: string;
  status: 'pending' | 'cleared' | 'declined';
  transactionDate: Date;
  receiptUrls: string[];
  memo: string;
  source: IntegrationType;
}

export const rampTransactionMapper: DataMapper<RampTransaction, InternalTransaction> = {
  toInternal(external: RampTransaction): InternalTransaction {
    return {
      externalId: external.id,
      amount: external.amount / 100, // Ramp uses cents
      cardId: external.card_id,
      employeeName: `${external.card_holder.first_name} ${external.card_holder.last_name}`,
      departmentId: external.card_holder.department_id,
      departmentName: external.card_holder.department_name,
      merchantId: external.merchant_id,
      merchantName: external.merchant_name,
      categoryCode: external.merchant_category_code,
      categoryName: external.sk_category_name,
      status: external.state.toLowerCase() as 'pending' | 'cleared' | 'declined',
      transactionDate: new Date(external.user_transaction_time),
      receiptUrls: external.receipts.map(r => r.url),
      memo: external.memo,
      source: 'ramp',
    };
  },

  toExternal(internal: InternalTransaction): RampTransaction {
    const [firstName, ...lastNameParts] = internal.employeeName.split(' ');
    return {
      id: internal.externalId,
      amount: Math.round(internal.amount * 100),
      card_id: internal.cardId,
      card_holder: {
        department_id: internal.departmentId,
        department_name: internal.departmentName,
        first_name: firstName,
        last_name: lastNameParts.join(' '),
      },
      merchant_id: internal.merchantId,
      merchant_name: internal.merchantName,
      merchant_category_code: internal.categoryCode,
      sk_category_id: 0,
      sk_category_name: internal.categoryName,
      state: internal.status.toUpperCase() as 'PENDING' | 'CLEARED' | 'DECLINED',
      user_transaction_time: internal.transactionDate.toISOString(),
      receipts: internal.receiptUrls.map((url, i) => ({ id: `receipt_${i}`, url })),
      memo: internal.memo,
    };
  },

  validate(data: unknown): data is RampTransaction {
    const obj = data as RampTransaction;
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj.id === 'string' &&
      typeof obj.amount === 'number' &&
      typeof obj.card_holder === 'object'
    );
  },
};

/**
 * Transform batch of records
 */
export function transformBatch<TExternal, TInternal>(
  records: TExternal[],
  mapper: DataMapper<TExternal, TInternal>
): { successful: TInternal[]; failed: Array<{ record: TExternal; error: string }> } {
  const successful: TInternal[] = [];
  const failed: Array<{ record: TExternal; error: string }> = [];

  for (const record of records) {
    try {
      if (mapper.validate(record)) {
        successful.push(mapper.toInternal(record));
      } else {
        failed.push({ record, error: 'Validation failed' });
      }
    } catch (error) {
      failed.push({
        record,
        error: error instanceof Error ? error.message : 'Transform failed',
      });
    }
  }

  if (failed.length > 0) {
    logger.warn({
      totalRecords: records.length,
      successCount: successful.length,
      failCount: failed.length,
    }, 'Batch transform completed with errors');
  }

  return { successful, failed };
}
