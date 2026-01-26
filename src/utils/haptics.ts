import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Haptics feedback levels for different interaction intensities
 */
export const HapticFeedbackLevel = {
  /**
   * Light haptic feedback - subtle notification
   * Used for minor interactions (tab switches, form validation)
   */
  LIGHT: 'light',
  
  /**
   * Medium haptic feedback - standard interaction
   * Used for normal user actions (button press, gesture confirm)
   */
  MEDIUM: 'medium',
  
  /**
   * Heavy haptic feedback - strong emphasis
   * Used for important actions (delete, critical success)
   */
  HEAVY: 'heavy'
} as const;

export type HapticFeedbackLevelType = typeof HapticFeedbackLevel[keyof typeof HapticFeedbackLevel];

/**
 * Triggers a haptic feedback response
 * Gracefully degrades on devices that don't support haptics
 * 
 * @param level - Intensity level of the haptic feedback
 * @example
 * triggerHaptic(HapticFeedbackLevel.LIGHT);  // Subtle feedback
 * triggerHaptic(HapticFeedbackLevel.MEDIUM); // Standard feedback
 * triggerHaptic(HapticFeedbackLevel.HEAVY);  // Strong feedback
 */
export async function triggerHaptic(
  level: HapticFeedbackLevelType = HapticFeedbackLevel.MEDIUM
): Promise<void> {
  try {
    // Map our feedback levels to Capacitor's ImpactStyle
    const styleMap: Record<HapticFeedbackLevelType, ImpactStyle> = {
      [HapticFeedbackLevel.LIGHT]: ImpactStyle.Light,
      [HapticFeedbackLevel.MEDIUM]: ImpactStyle.Medium,
      [HapticFeedbackLevel.HEAVY]: ImpactStyle.Heavy
    };

    await Haptics.impact({ style: styleMap[level] });
  } catch (error) {
    // Silently fail on unsupported devices or web browsers
    // This is expected behavior - haptics are a progressive enhancement
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptics unavailable:', error);
    }
  }
}

/**
 * Triggers a notification-style haptic response
 * Typically a distinct double-tap pattern used for success/completion feedback
 * 
 * @example
 * triggerHapticNotification();  // Success confirmation haptic
 */
export async function triggerHapticNotification(): Promise<void> {
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptic notification unavailable:', error);
    }
  }
}

/**
 * Triggers a selection-style haptic response
 * Typically a light tap, used for cursor movement or scrolling feedback
 * 
 * @example
 * triggerHapticSelection();  // Selection feedback for list scrolling
 */
export async function triggerHapticSelection(): Promise<void> {
  try {
    await Haptics.selectionStart();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptic selection unavailable:', error);
    }
  }
}

/**
 * Batch haptic feedback utility for complex interactions
 * Executes multiple haptics in sequence with specified delays
 * 
 * @param feedbacks - Array of [level, delayMs] tuples
 * @example
 * // Double-tap effect
 * triggerHapticSequence([
 *   [HapticFeedbackLevel.LIGHT, 0],
 *   [HapticFeedbackLevel.LIGHT, 100]
 * ]);
 */
export async function triggerHapticSequence(
  feedbacks: [HapticFeedbackLevelType, number][]
): Promise<void> {
  for (const [level, delay] of feedbacks) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await triggerHaptic(level);
  }
}
