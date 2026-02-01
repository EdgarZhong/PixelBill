import { useSyncExternalStore, useEffect } from 'react';
import { LedgerService } from '../core/services/LedgerService';

export function useLedger() {
  const service = LedgerService.getInstance();

  const state = useSyncExternalStore(
    (callback) => service.subscribe(callback),
    () => service.getState()
  );

  // Initial setup (if needed)
  useEffect(() => {
    service.init();
  }, []);

  return {
    ...state,
    service // Expose service for actions
  };
}
