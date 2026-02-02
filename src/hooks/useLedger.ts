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
    // 立即初始化，由 App.tsx 中的 SplashScreen 负责视觉遮罩和等待
    service.init();
  }, []);

  return {
    ...state,
    service // Expose service for actions
  };
}
