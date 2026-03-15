'use client';

import { AlertTriangle, AlertCircle, Info, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AlertData } from '@/types/trafficPrediction';

interface ContextualAlertsProps {
  alerts: AlertData[];
}

function getAlertIcon(type: AlertData['type']) {
  switch (type) {
    case 'conflict':
      return AlertTriangle;
    case 'low_confidence':
      return ShieldAlert;
    case 'seasonal_trend':
      return Info;
    case 'low_traffic':
    default:
      return AlertCircle;
  }
}

function getSeverityClass(severity: AlertData['severity']) {
  if (severity === 'high') {
    return 'border-red-300 bg-red-50 text-red-800';
  }
  if (severity === 'medium') {
    return 'border-amber-300 bg-amber-50 text-amber-800';
  }
  return 'border-blue-300 bg-blue-50 text-blue-800';
}

export function ContextualAlerts({ alerts }: ContextualAlertsProps) {
  if (!alerts.length) {
    return null;
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="text-sm font-semibold">Contextual Alerts</div>
      {alerts.map((alert, index) => {
        const Icon = getAlertIcon(alert.type);
        return (
          <div
            key={`${alert.type}-${index}`}
            className={`rounded-md border p-2 text-xs flex items-start gap-2 ${getSeverityClass(alert.severity)}`}
          >
            <Icon className="h-4 w-4 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">{alert.message}</div>
              <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                {alert.severity}
              </Badge>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
