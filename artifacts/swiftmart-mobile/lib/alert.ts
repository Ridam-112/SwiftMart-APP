import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform alert.
 *
 * React Native Web's `Alert.alert` is a silent no-op — it neither shows a
 * dialog nor throws, so on web the UI just looks stuck (e.g. tapping
 * "Sign In" spins and then nothing happens). This wrapper falls back to the
 * browser's native `window.alert` / `window.confirm` on web so users always
 * get feedback.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Multiple buttons on web: use confirm() for a destructive/cancel pair,
  // otherwise fall back to alert() and run the primary (non-cancel) action.
  const cancelBtn = buttons.find(b => b.style === 'cancel');
  const primaryBtn = buttons.find(b => b !== cancelBtn) ?? buttons[buttons.length - 1];

  if (cancelBtn && buttons.length === 2) {
    if (window.confirm(text)) {
      primaryBtn.onPress?.();
    } else {
      cancelBtn.onPress?.();
    }
    return;
  }

  window.alert(text);
  primaryBtn.onPress?.();
}
