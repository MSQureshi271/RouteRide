import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type Item = { value: number | string; label: string };

export default function MockWheelPicker({
  data,
  value,
  testID,
  overlayItemStyle,
  onValueChanged,
}: {
  data: Item[];
  value: Item["value"];
  testID?: string;
  overlayItemStyle?: StyleProp<ViewStyle>;
  onValueChanged?: (event: { item: Item; index: number }) => void;
}) {
  const label = testID?.replace("wheel-", "") ?? "Wheel";
  const column = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <View testID={testID} style={StyleSheet.flatten(overlayItemStyle)}>
      {data.map((item, index) => (
        <Pressable
          key={String(item.value)}
          accessibilityRole="button"
          accessibilityLabel={`${column} ${item.label}`}
          accessibilityState={{ selected: value === item.value }}
          onPress={() => onValueChanged?.({ item, index })}
        >
          <Text>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
