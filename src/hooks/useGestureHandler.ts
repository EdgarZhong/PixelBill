import { useRef, useCallback, useState } from 'react';

export interface GestureState {
  isActive: boolean;
  direction: 'left' | 'right' | null;
  translateX: number;
  progress: number;
}

interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeCancel?: () => void;
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Hook to detect and handle swipe gestures (left/right) on touch devices
 * Suitable for mobile list item interactions like quick actions
 * 
 * Usage:
 * const { gestureState, bind } = useGestureHandler({
 *   onSwipeLeft: () => console.log('Archive'),
 *   onSwipeRight: () => console.log('Delete')
 * });
 * 
 * return <div {...bind}>Swipeable content</div>
 */
export function useGestureHandler(handlers: GestureHandlers) {
  const [gestureState, setGestureState] = useState<GestureState>({
    isActive: false,
    direction: null,
    translateX: 0,
    progress: 0
  });

  const touchStartRef = useRef<TouchPoint | null>(null);
  const touchCurrentRef = useRef<TouchPoint | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Minimum swipe distance in pixels to trigger action
  const SWIPE_THRESHOLD = 50;
  // Minimum vertical movement tolerance (prevents accidental swipes when scrolling)
  const VERTICAL_TOLERANCE = 10;
  // Maximum allowed time for a swipe gesture in milliseconds
  const SWIPE_TIMEOUT = 500;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
    touchCurrentRef.current = null;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || !touchStartRef.current) return;

    const currentX = touch.clientX;
    const currentY = touch.clientY;
    const startX = touchStartRef.current.x;
    const startY = touchStartRef.current.y;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Check if this is primarily a vertical scroll (not a horizontal swipe)
    if (Math.abs(deltaY) > Math.abs(deltaX) + VERTICAL_TOLERANCE) {
      return;
    }

    touchCurrentRef.current = {
      x: currentX,
      y: currentY,
      timestamp: Date.now()
    };

    // Update gesture state for visual feedback
    const direction = deltaX > 0 ? 'right' : 'left';
    const progress = Math.min(
      Math.abs(deltaX) / SWIPE_THRESHOLD,
      1
    );

    setGestureState({
      isActive: Math.abs(deltaX) > 5, // Start showing feedback after 5px
      direction: direction as 'left' | 'right',
      translateX: deltaX,
      progress
    });

    // Optional: prevent default scrolling during horizontal swipe
    if (Math.abs(deltaX) > VERTICAL_TOLERANCE) {
      // Don't prevent default to allow natural scrolling when not swiping
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !touchCurrentRef.current) {
      setGestureState(prev => ({ ...prev, isActive: false }));
      return;
    }

    const deltaX = touchCurrentRef.current.x - touchStartRef.current.x;
    const deltaTime = touchCurrentRef.current.timestamp - touchStartRef.current.timestamp;
    const isFastSwipe = deltaTime < SWIPE_TIMEOUT;

    // Trigger handlers based on swipe direction and distance
    if (Math.abs(deltaX) > SWIPE_THRESHOLD && isFastSwipe) {
      if (deltaX < 0 && handlers.onSwipeLeft) {
        handlers.onSwipeLeft();
      } else if (deltaX > 0 && handlers.onSwipeRight) {
        handlers.onSwipeRight();
      }
    } else if (handlers.onSwipeCancel) {
      handlers.onSwipeCancel();
    }

    // Reset state
    setGestureState({
      isActive: false,
      direction: null,
      translateX: 0,
      progress: 0
    });

    touchStartRef.current = null;
    touchCurrentRef.current = null;
  }, [handlers]);

  const handleTouchCancel = useCallback(() => {
    setGestureState({
      isActive: false,
      direction: null,
      translateX: 0,
      progress: 0
    });
    touchStartRef.current = null;
    touchCurrentRef.current = null;
  }, []);

  // Bind gesture handlers to an element
  const bind = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    containerRef.current = element;

    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchCancel);

    // Cleanup on unmount
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  return { gestureState, bind, containerRef };
}
