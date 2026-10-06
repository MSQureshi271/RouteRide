/**
 * AddressPicker — a text input for address entry with server-side geocoding.
 *
 * Used in the consumer rider management screens (T0.44).
 *
 * Design decision: For MVP, this is a plain text input. The address is sent
 * to the backend which geocodes it via the Maps adapter. This avoids a
 * client-side Google Places API key and keeps geocoding server-side.
 *
 * The component is named AddressPicker so it can be upgraded to include
 * autocomplete later without changing call sites.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import { Input } from "../components/Input/Input";
import { LocationDropdown } from "./LocationDropdown";
import { spacing } from "../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddressPickerProps {
  label: string;
  inputId: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  /** Whether to show the __DEV__ quick-select preset dropdown (default: true) */
  showDevPresets?: boolean | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddressPicker({
  label,
  inputId,
  value,
  onChangeText,
  placeholder = "Enter full address",
  error,
  hint,
  showDevPresets = true,
}: AddressPickerProps) {
  return (
    <View style={styles.container}>
      <Input
        label={label}
        inputId={inputId}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        error={error}
        hint={hint ?? "Enter a complete address including area and city"}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        multiline={false}
        returnKeyType="done"
      />
      {showDevPresets ? (
        <LocationDropdown
          placeholder={`Choose sample ${label.toLowerCase()}`}
          onSelect={(loc) => onChangeText(loc.address)}
          testID={`${inputId}-preset-dropdown`}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
});
