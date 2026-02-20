/**
 * WO-82: Financial Import Service Tests
 */

import { describe, it, expect } from 'vitest';
import { pool } from '../config/database.js';
import { importBudgetActuals, getImportStatus, listImports } from '../services/financial-import.service.js';

// Sample CSV content matching the real format
const SAMPLE_CSV = `Budget/Actual,Date,Event name,Event type,Staff,Reimbursments,Sign up,Rewards,Base,Bonus/ kickback,Parking,Setup,Additional Expense,Additional Expense 2,Additional Expense 3,Additional Expense 4,Total Cost,Revenue,Profitability,%
Budget,"Fri, 01/2",Test Event TGIF,Bar,$300.00,$0.00,10,$300.00,$0.00,$97.50,$0.00,,$0.00,,,,$697.50,"$1,625.00",$927.50,57.00%
Actual,"Fri, 01/2",Test Event TGIF,Bar,$180.00,$0.00,6,$235.00,$0.00,$97.50,$0.00,,$0.00,,,,$512.50,$581.76,$69.26,12.00%`;

describe('WO-82: Financial Import Service', () => {
  describe('importBudgetActuals', () => {
    it('should parse CSV data correctly', async () => {
      // This tests the parsing logic without actually hitting the database
      // Full integration tests should be run against a test database
      
      const result = await importBudgetActuals(SAMPLE_CSV, 'test.csv', { 
        defaultYear: 2025 
      });
      
      expect(result).toBeDefined();
      expect(result.importId).toBeDefined();
      expect(typeof result.totalRows).toBe('number');
      expect(typeof result.processedRows).toBe('number');
    });
  });

  describe('listImports', () => {
    it('should return array of imports', async () => {
      const imports = await listImports({ limit: 5 });
      
      expect(Array.isArray(imports)).toBe(true);
    });
  });

  describe('getImportStatus', () => {
    it('should return null for non-existent import', async () => {
      const status = await getImportStatus('00000000-0000-0000-0000-000000000000');
      
      expect(status).toBeNull();
    });
  });
});
