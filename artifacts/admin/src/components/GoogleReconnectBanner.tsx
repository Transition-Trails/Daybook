import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GoogleReconnectBannerProps {
  visible: boolean;
}

/**
 * Non-blocking warm banner shown when the backend returns reconnect_required
 * (i.e. the user's Google OAuth token has expired or been revoked).
 * Clicking "Reconnect Google" re-runs the OAuth flow, which will refresh the
 * token and clear the banner on next status fetch.
 */
export function GoogleReconnectBanner({ visible }: GoogleReconnectBannerProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 animate-in fade-in duration-300">
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
      <p className="text-sm flex-1">
        Your Google connection expired — reconnect to resume Drive and Calendar sync.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
        onClick={() => { window.location.href = '/api/auth/google'; }}
      >
        Reconnect Google
      </Button>
    </div>
  );
}
