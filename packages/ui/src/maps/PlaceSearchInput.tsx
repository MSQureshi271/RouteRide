/**
 * PlaceSearchInput — Google Places Autocomplete search input.
 *
 * Uses the backend /maps/autocomplete and /maps/place-details proxy endpoints
 * to provide real-time location suggestions without exposing the Google API key.
 *
 * Session token management:
 *  - Generates a UUID per search session.
 *  - Reuses it across autocomplete calls while typing.
 *  - Sends it to /maps/place-details upon selection, completing Google's session billing.
 *  - Resets the token so subsequent searches start a fresh billing session.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiClient } from "../api/client";
import { colors, fontFamilies, radii, spacing } from "../tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectedLocation {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

export interface PlaceSearchInputProps {
  label: string;
  placeholder?: string | undefined;
  onLocationSelected: (location: SelectedLocation) => void;
  onQueryChange?: (() => void) | undefined;
  disabled?: boolean | undefined;
  testID?: string | undefined;
  hint?: string | undefined;
}

interface SuggestionItem {
  placeId: string;
  description: string;
}

function generateSessionToken(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlaceSearchInput({
  label,
  placeholder = "Search location or area (e.g. DHA, Clifton)",
  onLocationSelected,
  onQueryChange,
  disabled = false,
  testID = "place-search-input",
  hint,
}: PlaceSearchInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingDetails, setResolvingDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const sessionTokenRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getOrCreateSessionToken = useCallback((): string => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = generateSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const resetSessionToken = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const fetchSuggestions = useCallback(
    async (text: string) => {
      if (text.trim().length < 2) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      const token = getOrCreateSessionToken();

      try {
        const client = getApiClient();
        const response = await client.get<{ suggestions: SuggestionItem[] }>(
          "/maps/autocomplete",
          {
            params: {
              input: text.trim(),
              sessionToken: token,
            },
          },
        );

        if (response.data?.suggestions) {
          setSuggestions(response.data.suggestions);
        } else {
          setSuggestions([]);
        }
      } catch {
        // Silently clear or show subtle message; do not crash
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [getOrCreateSessionToken],
  );

  const handleTextChange = (text: string) => {
    onQueryChange?.();
    setQuery(text);
    setErrorMessage(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (text.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      resetSessionToken();
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void fetchSuggestions(text);
    }, 300);
  };

  const handleSelectSuggestion = async (item: SuggestionItem) => {
    setResolvingDetails(true);
    setErrorMessage(null);
    setSuggestions([]);
    const currentToken = sessionTokenRef.current;

    try {
      const client = getApiClient();
      const response = await client.get<{
        placeId: string;
        address: string;
        lat: number;
        lng: number;
      }>("/maps/place-details", {
        params: {
          placeId: item.placeId,
          ...(currentToken ? { sessionToken: currentToken } : {}),
        },
      });

      const data = response.data;
      if (
        data &&
        typeof data.lat === "number" &&
        typeof data.lng === "number"
      ) {
        onLocationSelected({
          placeId: data.placeId || item.placeId,
          address: data.address || item.description,
          lat: data.lat,
          lng: data.lng,
        });
        setQuery("");
        resetSessionToken();
      } else {
        setErrorMessage("Could not resolve location coordinates. Try again.");
      }
    } catch {
      setErrorMessage("Failed to resolve location details. Please try again.");
    } finally {
      setResolvingDetails(false);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const showDropdown = isFocused && suggestions.length > 0 && !resolvingDetails;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          disabled && styles.inputWrapperDisabled,
        ]}
      >
        <TextInput
          testID={testID}
          style={styles.input}
          value={query}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          editable={!disabled && !resolvingDetails}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Delay closing dropdown slightly so press event on suggestion registers
            setTimeout(() => setIsFocused(false), 250);
          }}
          accessibilityLabel={label}
          accessibilityRole="search"
          returnKeyType="search"
        />

        {(loading || resolvingDetails) && (
          <ActivityIndicator
            size="small"
            color={colors.secondary}
            style={styles.spinner}
            testID={`${testID}-spinner`}
          />
        )}
      </View>

      {errorMessage && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {errorMessage}
        </Text>
      )}

      {hint && !errorMessage && <Text style={styles.hintText}>{hint}</Text>}

      {showDropdown && (
        <View style={styles.dropdownContainer} testID={`${testID}-dropdown`}>
          <FlatList
            keyboardShouldPersistTaps="always"
            data={suggestions}
            keyExtractor={(item) => item.placeId}
            renderItem={({ item, index }) => (
              <Pressable
                testID={`${testID}-suggestion-${index}`}
                accessibilityRole="button"
                accessibilityLabel={item.description}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed && styles.suggestionRowPressed,
                  index < suggestions.length - 1 && styles.suggestionRowDivider,
                ]}
                onPress={() => void handleSelectSuggestion(item)}
              >
                <Text style={styles.pinIcon}>📍</Text>
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {item.description}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
    position: "relative",
    zIndex: 10,
  },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputWrapperFocused: {
    borderColor: colors.secondary,
    backgroundColor: colors.surfaceContainerLowest,
  },
  inputWrapperDisabled: {
    opacity: 0.6,
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: spacing.sm,
  },
  spinner: {
    marginLeft: spacing.sm,
  },
  hintText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    color: colors.outline,
    marginTop: spacing.xs,
  },
  errorText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.xs,
  },
  dropdownContainer: {
    position: "absolute",
    top: 76,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    maxHeight: 220,
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  suggestionRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  suggestionRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainer,
  },
  pinIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  suggestionText: {
    flex: 1,
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurface,
  },
});
