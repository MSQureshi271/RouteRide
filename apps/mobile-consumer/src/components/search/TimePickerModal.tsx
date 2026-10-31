import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors, radii, spacing, typography } from "@routeride/ui";
import {
  TimeWheelPicker,
  fromTime24,
  toTime24,
} from "@routeride/ui/components/TimeWheelPicker";

export interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initialTime24: string;
  onConfirm: (time24: string) => void;
  onCancel: () => void;
}

export function TimePickerModal({
  visible,
  title,
  initialTime24,
  onConfirm,
  onCancel,
}: TimePickerModalProps) {
  const [value, setValue] = useState(() => fromTime24(initialTime24));
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    if (visible) setValue(fromTime24(initialTime24));
  }, [visible, initialTime24]);

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  return (
    <Modal
      testID="time-picker-modal"
      visible={visible || mounted}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: progress }]}
        />
        <Pressable
          style={styles.dismissArea}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss time picker"
        />
        <Animated.View
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          style={{
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sheetHeight || height, 0],
                }),
              },
            ],
          }}
        >
          <SafeAreaView
            edges={["bottom"]}
            style={styles.sheet}
            accessibilityViewIsModal
          >
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Close time picker"
                hitSlop={12}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <TimeWheelPicker value={value} onChange={setValue} />
            <Button
              variant="primary"
              role="consumer"
              onPress={() => onConfirm(toTime24(value))}
              accessibilityLabel="Confirm time"
              testID="time-picker-confirm-btn"
            >
              Confirm time
            </Button>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { ...typography.headlineMd, color: colors.onSurface },
  close: {
    ...typography.headlineMd,
    color: colors.onSurfaceVariant,
    fontSize: 28,
  },
});
