'use client';

import { useState, useCallback } from 'react';
import { signupsApi } from '@/lib/api';
import type { ExtractionQueueItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Check,
  X,
  SkipForward,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  Edit,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ExtractionReviewQueueProps {
  items: ExtractionQueueItem[];
  totalPending: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onConfirm: (id: string, corrections?: { betAmount?: number; teamBetOn?: string; odds?: string }) => Promise<void>;
  onSkip: (id: string, reason?: string) => Promise<void>;
  onRefresh: () => void;
  loading?: boolean;
}

export function ExtractionReviewQueue({
  items,
  totalPending,
  currentPage,
  pageSize,
  onPageChange,
  onConfirm,
  onSkip,
  onRefresh,
  loading = false,
}: ExtractionReviewQueueProps) {
  const [editingItem, setEditingItem] = useState<ExtractionQueueItem | null>(null);
  const [editValues, setEditValues] = useState<{
    betAmount: string;
    teamBetOn: string;
    odds: string;
  }>({ betAmount: '', teamBetOn: '', odds: '' });
  const [skipReason, setSkipReason] = useState('');
  const [showSkipDialog, setShowSkipDialog] = useState<ExtractionQueueItem | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const totalPages = Math.ceil(totalPending / pageSize);

  const handleConfirm = useCallback(async (item: ExtractionQueueItem) => {
    setProcessing(item.id);
    try {
      await onConfirm(item.id);
    } finally {
      setProcessing(null);
    }
  }, [onConfirm]);

  const handleConfirmWithCorrections = useCallback(async () => {
    if (!editingItem) return;
    
    setProcessing(editingItem.id);
    try {
      const corrections: { betAmount?: number; teamBetOn?: string; odds?: string } = {};
      
      if (editValues.betAmount && editValues.betAmount !== String(editingItem.betAmount)) {
        corrections.betAmount = parseFloat(editValues.betAmount);
      }
      if (editValues.teamBetOn && editValues.teamBetOn !== editingItem.teamBetOn) {
        corrections.teamBetOn = editValues.teamBetOn;
      }
      if (editValues.odds && editValues.odds !== editingItem.odds) {
        corrections.odds = editValues.odds;
      }
      
      await onConfirm(editingItem.id, Object.keys(corrections).length > 0 ? corrections : undefined);
      setEditingItem(null);
    } finally {
      setProcessing(null);
    }
  }, [editingItem, editValues, onConfirm]);

  const handleSkip = useCallback(async () => {
    if (!showSkipDialog) return;
    
    setProcessing(showSkipDialog.id);
    try {
      await onSkip(showSkipDialog.id, skipReason || undefined);
      setShowSkipDialog(null);
      setSkipReason('');
    } finally {
      setProcessing(null);
    }
  }, [showSkipDialog, skipReason, onSkip]);

  const openEditDialog = useCallback((item: ExtractionQueueItem) => {
    setEditingItem(item);
    setEditValues({
      betAmount: item.betAmount ? String(item.betAmount) : '',
      teamBetOn: item.teamBetOn || '',
      odds: item.odds || '',
    });
  }, []);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadge = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-700';
    if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <ImageIcon className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No extractions to review</h3>
        <p className="mt-1 text-gray-500">
          Low-confidence AI extractions will appear here for manual review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Queue header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {items.length} of {totalPending} pending extractions
        </p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {/* Queue items */}
      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex gap-4">
              {/* Image preview */}
              <div className="w-48 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt="Bet slip"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{item.customerName}</p>
                    <p className="text-sm text-gray-500">{item.customerEmail}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {item.operator} • {item.ambassador}
                    </p>
                  </div>
                  <Badge className={getConfidenceBadge(item.extractionConfidence)}>
                    {(item.extractionConfidence * 100).toFixed(0)}% confidence
                  </Badge>
                </div>

                {/* Extracted values */}
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Bet Amount</p>
                    <p className={`font-mono font-medium ${item.betAmount ? '' : 'text-red-500'}`}>
                      {item.betAmount ? `$${item.betAmount}` : 'Missing'}
                    </p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Odds</p>
                    <p className={`font-mono font-medium ${item.odds ? '' : 'text-red-500'}`}>
                      {item.odds || 'Missing'}
                    </p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Team</p>
                    <p className={`font-medium ${item.teamBetOn ? '' : 'text-red-500'}`}>
                      {item.teamBetOn || 'Missing'}
                    </p>
                  </div>
                </div>

                {/* Missing fields warning */}
                {item.missingFields.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    Missing: {item.missingFields.join(', ')}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(item)}
                    disabled={processing === item.id}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleConfirm(item)}
                    disabled={processing === item.id}
                  >
                    {processing === item.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSkipDialog(item)}
                    disabled={processing === item.id}
                  >
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Extraction Values</DialogTitle>
          </DialogHeader>
          
          {editingItem && (
            <div className="space-y-4">
              {/* Image preview */}
              <div className="w-full h-40 bg-gray-100 rounded-lg overflow-hidden">
                {editingItem.imageUrl ? (
                  <img
                    src={editingItem.imageUrl}
                    alt="Bet slip"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Edit form */}
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Bet Amount ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editValues.betAmount}
                    onChange={(e) => setEditValues({ ...editValues, betAmount: e.target.value })}
                    placeholder="Enter bet amount"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Team/Selection</label>
                  <Input
                    value={editValues.teamBetOn}
                    onChange={(e) => setEditValues({ ...editValues, teamBetOn: e.target.value })}
                    placeholder="Enter team or selection"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Odds</label>
                  <Input
                    value={editValues.odds}
                    onChange={(e) => setEditValues({ ...editValues, odds: e.target.value })}
                    placeholder="Enter odds (e.g., +150, -110)"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmWithCorrections}
              disabled={processing === editingItem?.id}
              className="bg-green-600 hover:bg-green-700"
            >
              {processing === editingItem?.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save & Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog open={!!showSkipDialog} onOpenChange={() => setShowSkipDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Extraction</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will skip the extraction for this sign-up. The customer will be synced to Customer.io without bet data.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason (optional)</label>
              <Input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="e.g., Image unreadable, Not a bet slip"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipDialog(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSkip}
              disabled={processing === showSkipDialog?.id}
              variant="destructive"
            >
              {processing === showSkipDialog?.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <SkipForward className="h-4 w-4 mr-2" />
              )}
              Skip Extraction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExtractionReviewQueue;
