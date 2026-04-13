import { useState } from 'react';
import { AlertCircle, X, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { UserFriendlyError } from '../../lib/errorMessages';
import { BrandButton } from '../brand/BrandButton';

interface ErrorAlertProps {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
  retryLabel?: string;
  technical?: string;
  recovery?: UserFriendlyError['recovery'];
  showTechnical?: boolean;
}

/**
 * Error Alert Component
 * Displays errors with brand styling and recovery actions
 */
export const ErrorAlert = ({
  title,
  message,
  onRetry,
  onDismiss,
  retryLabel = 'Try Again',
  technical,
  recovery,
  showTechnical = false,
}: ErrorAlertProps) => {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-40 rounded-card p-4 sm:p-5 shadow-card">
      <div className="flex gap-3 flex-col sm:flex-row">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold font-heading text-red-300 text-base">{title}</h3>
            {!isOnline && (
              <div className="flex items-center gap-1 text-red-300 text-xs font-semibold">
                <WifiOff className="w-4 h-4" aria-hidden="true" />
                <span>Offline</span>
              </div>
            )}
          </div>
          <p className="text-red-200 text-sm mb-3 leading-relaxed">{message}</p>
          
          {/* Recovery Actions */}
          <div className="flex flex-wrap gap-2 mb-2">
            {recovery && recovery.length > 0 ? (
              recovery.map((action, idx) => (
                <BrandButton
                  key={idx}
                  variant="danger"
                  size="sm"
                  onClick={action.action}
                  className="flex items-center gap-2"
                >
                  {action.label === 'Check Connection' && <Wifi className="w-4 h-4" aria-hidden="true" />}
                  {action.label === 'Retry' && <RefreshCw className="w-4 h-4" aria-hidden="true" />}
                  {action.label}
                </BrandButton>
              ))
            ) : onRetry ? (
              <BrandButton
                variant="danger"
                size="sm"
                onClick={onRetry}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                {retryLabel}
              </BrandButton>
            ) : null}
            <BrandButton
              variant="secondary"
              size="sm"
              onClick={onDismiss}
              className="flex items-center gap-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Dismiss
            </BrandButton>
          </div>

          {/* Technical Details (collapsible) */}
          {technical && (showTechnical || showTechDetails) && (
            <details className="mt-3">
              <summary
                className="text-xs text-red-300 cursor-pointer hover:text-red-200 font-semibold"
                onClick={(e) => {
                  e.preventDefault();
                  setShowTechDetails(!showTechDetails);
                }}
              >
                {showTechDetails ? 'Hide' : 'Show'} technical details
              </summary>
              <pre className="mt-2 p-2 bg-red-500 bg-opacity-20 rounded text-xs text-red-200 overflow-auto max-h-32 font-mono border border-red-500 border-opacity-20">
                {technical}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};
