/**
 * Operators API
 * WO-98: Domain module for operator operations (WO-2)
 */

import type { Operator, OperatorContact } from '@/types';
import { get, post, put, del, buildQueryString } from './client';

// ============================================
// OPERATORS API
// ============================================

export const operatorsApi = {
  /** List operators with optional filters */
  list: (params?: { status?: string; search?: string }) => {
    const query = buildQueryString(params);
    return get<Operator[]>(`/api/v1/operators${query}`);
  },

  /** Get single operator by ID */
  get: (id: string) => get<Operator>(`/api/v1/operators/${id}`),

  /** Create new operator */
  create: (data: Partial<Operator>) => post<Operator>('/api/v1/operators', data),

  /** Update existing operator */
  update: (id: string, data: Partial<Operator>) => put<Operator>(`/api/v1/operators/${id}`, data),

  /** Delete operator */
  delete: (id: string) => del<void>(`/api/v1/operators/${id}`),

  // ----------------------------------------
  // Contacts
  // ----------------------------------------

  /** Get contacts for an operator */
  getContacts: (operatorId: string) =>
    get<OperatorContact[]>(`/api/v1/operators/${operatorId}/contacts`),

  /** Add contact to operator */
  addContact: (operatorId: string, data: Partial<OperatorContact>) =>
    post<OperatorContact>(`/api/v1/operators/${operatorId}/contacts`, data),

  /** Update operator contact */
  updateContact: (operatorId: string, contactId: string, data: Partial<OperatorContact>) =>
    put<OperatorContact>(`/api/v1/operators/${operatorId}/contacts/${contactId}`, data),

  /** Delete operator contact */
  deleteContact: (operatorId: string, contactId: string) =>
    del<void>(`/api/v1/operators/${operatorId}/contacts/${contactId}`),

  // ----------------------------------------
  // Performance
  // ----------------------------------------

  /** Get operator performance metrics */
  getPerformance: (id: string) =>
    get<Operator['performanceSummary']>(`/api/v1/operators/${id}/performance`),
};
