/**
 * Toast notification component
 *
 * Slides in from the top (Consumer) or bottom (Driver) of the screen.
 * Auto-dismisses after 4 seconds.
 * Multiple toasts queue in a ToastProvider context.
 *
 * Accessibility: accessibilityLiveRegion="polite" announces the message.
 * For critical errors, use accessibilityLiveRegion="assertive".
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, typography } from "../../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info" | "warning";
export type ToastPosition = "top" | "bottom";

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant, duration?: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Toast item ───────────────────────────────────────────────────────────────

const variantColors: Record<ToastVariant, { bg: string; fg: string }> = {
  success: { bg: colors.secondary, fg: colors.onSecondary },
  error: { bg: colors.error, fg: colors.onError },
  warning: { bg: colors.statusEnRoute, fg: "#FFFFFF" },
  info: { bg: colors.primaryContainer, fg: colors.onPrimary },
};

function ToastItem({
  toast,
  position,
  onDismiss,
}: {
  toast: ToastMessage;
  position: ToastPosition;
  onDismiss: (id: string) => void;
}) {
  const translateY = useRef(
    new Animated.Value(position === "top" ? -100 : 100),
  ).current;

  React.useEffect(() => {
    // Slide in
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    // Auto-dismiss
    const timer = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: position === "top" ? -100 : 100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onDismiss(toast.id));
    }, toast.duration ?? 4000);

    return () => clearTimeout(timer);
  }, [toast.duration, toast.id, translateY, position, onDismiss]);

  const { bg, fg } = variantColors[toast.variant];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bg, transform: [{ translateY }] },
      ]}
      accessibilityLiveRegion={
        toast.variant === "error" ? "assertive" : "polite"
      }
      accessibilityRole="alert"
      accessible
      accessibilityLabel={toast.message}
    >
      <Text style={[styles.toastText, { color: fg }]}>{toast.message}</Text>
      <TouchableOpacity
        onPress={() => onDismiss(toast.id)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={8}
      >
        <Text style={[styles.dismiss, { color: fg }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({
  children,
  position = "top",
}: {
  children: React.ReactNode;
  position?: ToastPosition;
}) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 4000) => {
      const id = String(nextId.current++);
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        style={[
          styles.overlay,
          position === "top" ? styles.top : styles.bottom,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.stack} pointerEvents="box-none">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              position={position}
              onDismiss={dismiss}
            />
          ))}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be called within a <ToastProvider>");
  }
  return ctx;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  top: {
    top: Platform.OS === "android" ? 24 : 0,
  },
  bottom: {
    bottom: 0,
  },
  stack: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadows.card,
  },
  toastText: {
    ...typography.bodyMd,
    fontFamily: "Inter-Medium",
    flex: 1,
    marginRight: spacing.sm,
  },
  dismiss: {
    fontSize: 14,
  },
});
