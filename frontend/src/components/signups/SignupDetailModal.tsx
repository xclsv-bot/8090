'use client';

import { useState, useEffect, useCallback } from 'react';
import { signupsApi } from '@/lib/api';
import type { Signup, SignupAuditEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Check,
  X,
  RefreshCw,
  Clock,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Image as ImageIcon,
  History,
  AlertCircle,
  CheckCircle,
  Loader2,
  SkipForward,
  ExternalLink,
} from 'lucide-react';

interface SignupDetailModalProps {
  signup: Signup | null;
  open: boolean;
  onClose: () => void;
  onValidate?: (id: string, status: 'validated' | 'rejected') => void;
  onConfirmExtraction?: (id: string) => void;
  onSkipExtraction?: (id: string) => void;
  onRetrySync?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  validated: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  duplicate: 'bg-gray-100 text-gray-700',
};

const extractionStatusColors: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  needs_review: 'bg-yellow-100 text-yellow-700',
  skipped: 'bg-gray-100 text-gray-700',
};

const auditActionLabels: Record<string, string> = {
  submitted: 'Sign-up Submitted',
  validated: 'Validated',
  rejected: 'Rejected',
  extraction_started: 'Extraction Started',
  extraction_completed: 'Extraction Completed',
  extraction_failed: 'Extraction Failed',
  extraction_reviewed: 'Extraction Reviewed',
  customerio_sync_initial: 'Initial Sync to Customer.io',
  customerio_sync_enriched: 'Enriched Sync to Customer.io',
  customerio_sync_failed: 'Customer.io Sync Failed',
  customerio_sync_retried: 'Customer.io Sync Retried',
};

const auditActionIcons: Record<string, React.ReactNode> = {
  submitted: <Clock className="h-4 w-4 text-blue-500" />,
  validated: <CheckCircle className="h-4 w-4 text-green-500" />,
  rejected: <X className="h-4 w-4 text-red-500" />,
  extraction_started: <Loader2 className="h-4 w-4 text-blue-500" />,
  extraction_completed: <Check className="h-4 w-4 text-green-500" />,
  extraction_failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  extraction_reviewed: <User className="h-4 w-4 text-purple-500" />,
  customerio_sync_initial: <ExternalLink className="h-4 w-4 text-blue-500" />,
  customerio_sync_enriched: <ExternalLink className="h-4 w-4 text-green-500" />,
  customerio_sync_failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  customerio_sync_retried: <RefreshCw className="h-4 w-4 text-yellow-500" />,
};

export function SignupDetailModal({
  signup,
  open,
  onClose,
  onValidate,
  onConfirmExtraction,
  onSkipExtraction,
  onRetrySync,
}: SignupDetailModalProps) {
  const [auditLog, setAuditLog] = useState<SignupAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  const loadAuditLog = useCallback(async () => {
    if (!signup) return;
    
    setLoadingAudit(true);
    try {
      const response = await signupsApi.getAuditLog(signup.id);
      setAuditLog(response.data || []);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoadingAudit(false);
    }
  }, [signup]);

  useEffect(() => {
    if (open && signup && activeTab === 'history') {
      loadAuditLog();
    }
  }, [open, signup, activeTab, loadAuditLog]);

  useEffect(() => {
    if (!open) {
      setActiveTab('details');
      setAuditLog([]);
    }
  }, [open]);

  if (!signup) return null;

  const customerName = `${signup.customerFirstName} ${signup.customerLastName}`.trim();
  const canValidate = signup.validationStatus === 'pending';
  const canConfirmExtraction = signup.extractionStatus === 'pending' || signup.extractionStatus === 'needs_review';
  const needsSyncRetry = signup.extractionStatus === 'confirmed' || signup.extractionStatus === 'skipped';

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Sign-up Details</span>
            <Badge className={statusColors[signup.validationStatus]}>
              {signup.validationStatus}
            </Badge>
            {signup.extractionStatus && (
              <Badge className={extractionStatusColors[signup.extractionStatus]}>
                {signup.extractionStatus.replace('_', ' ')}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="extraction">Extraction</TabsTrigger>
            <TabsTrigger value="history">
              Audit History
              {auditLog.length > 0 && (
                <Badge variant="secondary" className="ml-2">{auditLog.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Customer Info */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Customer Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">{customerName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{signup.customerEmail || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium">{signup.customerPhone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Operator</p>
                    <p className="font-medium">{signup.operatorName || `#${signup.operatorId}`}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Assignment Info */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Assignment</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Ambassador</p>
                  <p className="font-medium">
                    {signup.ambassador 
                      ? `${signup.ambassador.firstName} ${signup.ambassador.lastName}`
                      : signup.ambassadorId.slice(0, 8) + '...'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Event</p>
                  <p className="font-medium">
                    {signup.event?.title || signup.eventId || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Submitted</p>
                  <p className="font-medium">
                    {new Date(signup.submittedAt).toLocaleString()}
                  </p>
                </div>
                {signup.validatedAt && (
                  <div>
                    <p className="text-sm text-gray-500">Validated</p>
                    <p className="font-medium">
                      {new Date(signup.validatedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* CPA Info */}
            {signup.cpaAmount && (
              <Card className="p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3">Financial</h4>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm text-gray-500">Locked CPA Amount</p>
                    <p className="text-xl font-bold text-green-600">
                      ${signup.cpaAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Validation Actions */}
            {canValidate && onValidate && (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => onValidate(signup.id, 'validated')}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Validate
                </Button>
                <Button
                  onClick={() => onValidate(signup.id, 'rejected')}
                  variant="destructive"
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="extraction" className="space-y-4 mt-4">
            {/* Bet Slip Image */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Bet Slip Photo</h4>
              {signup.betSlipImageUrl ? (
                <div className="rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={signup.betSlipImageUrl}
                    alt="Bet slip"
                    className="w-full h-auto max-h-80 object-contain"
                  />
                </div>
              ) : (
                <div className="h-40 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="h-10 w-10 mx-auto mb-2" />
                    <p className="text-sm">No image uploaded</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Extracted Data */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Extracted Data</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Bet Amount</p>
                  <p className="text-lg font-mono font-bold">
                    {signup.betAmount ? `$${signup.betAmount}` : '—'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Odds</p>
                  <p className="text-lg font-mono font-bold">
                    {signup.odds || '—'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Team/Selection</p>
                  <p className="text-lg font-bold">
                    {signup.teamBetOn || '—'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Extraction Actions */}
            {canConfirmExtraction && (
              <div className="flex gap-2 pt-4 border-t">
                {onConfirmExtraction && (
                  <Button
                    onClick={() => onConfirmExtraction(signup.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirm Extraction
                  </Button>
                )}
                {onSkipExtraction && (
                  <Button
                    onClick={() => onSkipExtraction(signup.id)}
                    variant="outline"
                    className="flex-1"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip Extraction
                  </Button>
                )}
              </div>
            )}

            {/* Sync Retry */}
            {needsSyncRetry && onRetrySync && (
              <div className="pt-4 border-t">
                <Button
                  onClick={() => onRetrySync(signup.id)}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Customer.io Sync
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-4">
                <History className="h-4 w-4 inline mr-2" />
                Complete Audit History
              </h4>
              
              {loadingAudit ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : auditLog.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>No audit history available</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                  
                  {/* Timeline items */}
                  <div className="space-y-4">
                    {auditLog.map((entry, index) => (
                      <div key={entry.id} className="relative pl-10">
                        {/* Timeline dot */}
                        <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                          {auditActionIcons[entry.action] || <Clock className="h-3 w-3 text-gray-400" />}
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">
                                {auditActionLabels[entry.action] || entry.action}
                              </p>
                              {entry.userName && (
                                <p className="text-xs text-gray-500">
                                  by {entry.userName}
                                </p>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          </div>
                          
                          {/* Details */}
                          {entry.details && Object.keys(entry.details).length > 0 && (
                            <div className="mt-2 text-xs text-gray-600 bg-white rounded p-2">
                              {(() => {
                                const details = entry.details as Record<string, unknown>;
                                return (
                                  <>
                                    {details.action ? (
                                      <p><span className="font-medium">Action:</span> {String(details.action)}</p>
                                    ) : null}
                                    {details.reason ? (
                                      <p><span className="font-medium">Reason:</span> {String(details.reason)}</p>
                                    ) : null}
                                    {details.error ? (
                                      <p className="text-red-600">
                                        <span className="font-medium">Error:</span> {String(details.error)}
                                      </p>
                                    ) : null}
                                    {details.corrections ? (
                                      <div className="mt-1">
                                        <span className="font-medium">Corrections:</span>
                                        <pre className="mt-1 text-xs bg-gray-50 p-1 rounded overflow-x-auto">
                                          {JSON.stringify(details.corrections, null, 2)}
                                        </pre>
                                      </div>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default SignupDetailModal;
