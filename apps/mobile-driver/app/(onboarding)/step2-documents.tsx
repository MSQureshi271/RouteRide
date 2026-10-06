/**
 * Step 2 — Document Uploads.
 *
 * Two-step flow per document:
 *  1. POST /drivers/me/documents/upload-url  → get pre-signed PUT URL
 *  2. PUT <presigned-url> with the file bytes (direct to S3/LocalStack)
 *  3. POST /drivers/me/documents/confirm     → validate magic bytes and record
 *
 * Required document types: CNIC, LICENCE, REGISTRATION, INSURANCE
 * Accepted MIME types: image/jpeg, image/png, application/pdf
 */
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import {
  Button,
  getApiClient,
  resolveUploadUrl,
  colors,
  spacing,
  typography,
} from "@routeride/ui";
import { fetchAndNavigateToOnboardingStep } from "../../src/navigation/onboardingRouter";
import type { DriverDocumentItem } from "@routeride/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = "CNIC" | "LICENCE" | "REGISTRATION" | "INSURANCE";
type DocStatus = "idle" | "uploading" | "done" | "error";

interface DocState {
  type: DocType;
  label: string;
  status: DocStatus;
  error?: string | null;
}

const REQUIRED_DOCS: DocState[] = [
  { type: "CNIC", label: "CNIC (National ID)", status: "idle" },
  { type: "LICENCE", label: "Driving Licence", status: "idle" },
  { type: "REGISTRATION", label: "Vehicle Registration", status: "idle" },
  { type: "INSURANCE", label: "Vehicle Insurance", status: "idle" },
];

// ─── Component ────────────────────────────────────────────────────────────────

function uploadToS3(
  url: string,
  fileUri: string,
  mimeType: string,
  fileName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mimeType);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `S3 upload failed with HTTP ${xhr.status}: ${xhr.responseText || "No response body"}`,
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during document upload"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Document upload timed out"));
    };

    xhr.send({
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as unknown as Blob);
  });
}

export default function Step2DocumentsScreen() {
  const [docs, setDocs] = useState<DocState[]>(REQUIRED_DOCS);
  const [navigating, setNavigating] = useState(false);
  const [_loadingInitial, setLoadingInitial] = useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function loadExistingDocuments() {
      try {
        const res = await getApiClient().get<DriverDocumentItem[]>(
          "/drivers/me/documents",
        );
        const docsList =
          (res.data as unknown as { data?: DriverDocumentItem[] })?.data ??
          res.data;
        if (mounted && Array.isArray(docsList)) {
          const confirmedTypes = new Set(
            docsList.map((d: DriverDocumentItem) => d.docType),
          );
          setDocs((prev) =>
            prev.map((d) => ({
              ...d,
              status: confirmedTypes.has(d.type)
                ? ("done" as const)
                : ("idle" as const),
            })),
          );
        }
      } catch {
        // Silently preserve default state on error
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }
    void loadExistingDocuments();
    return () => {
      mounted = false;
    };
  }, []);

  const allDone = docs.every((d) => d.status === "done");

  const setDocStatus = (
    type: DocType,
    status: DocStatus,
    error: string | null = null,
  ) => {
    setDocs((prev) =>
      prev.map((d) => (d.type === type ? { ...d, status, error } : d)),
    );
  };

  const handleUpload = async (docType: DocType) => {
    setDocStatus(docType, "uploading");
    let tempCacheFile: File | null = null;
    try {
      let pickedFile: File | null = null;
      let mimeType = "image/jpeg";

      // Pick document using modern File API if available, with DocumentPicker fallback
      if (typeof File.pickFileAsync === "function") {
        const pickRes = await File.pickFileAsync({
          mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
        });
        if (pickRes.canceled || !pickRes.result) {
          setDocStatus(docType, "idle");
          return;
        }
        pickedFile = pickRes.result;
        const lowerName = (pickedFile.name || "").toLowerCase();
        mimeType =
          pickedFile.type ||
          (lowerName.endsWith(".pdf")
            ? "application/pdf"
            : lowerName.endsWith(".png")
              ? "image/png"
              : "image/jpeg");
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["image/jpeg", "image/png", "application/pdf"],
          copyToCacheDirectory: false,
        });

        if (result.canceled || !result.assets?.[0]) {
          setDocStatus(docType, "idle");
          return;
        }

        const asset = result.assets[0];
        pickedFile = new File(asset.uri);
        mimeType = asset.mimeType ?? "image/jpeg";
      }

      // Step 1: Get pre-signed upload URL
      const urlRes = await getApiClient().post(
        "/drivers/me/documents/upload-url",
        {
          docType,
          mimeType,
        },
      );
      const payload =
        (
          urlRes.data as unknown as {
            data?: { uploadUrl: string; key: string };
          }
        )?.data ?? urlRes.data;
      const { uploadUrl, key } = payload;

      // Step 2: Upload directly to S3 via XMLHttpRequest native streaming
      const targetUrl = resolveUploadUrl(uploadUrl);
      const fileName =
        pickedFile.name ||
        `doc-${docType}.${mimeType.includes("pdf") ? "pdf" : "jpg"}`;

      // On Android, if URI is a content:// URI from SAF, copy into Paths.cache for guaranteed local readable path
      let uploadUri = pickedFile.uri;
      if (pickedFile.uri.startsWith("content://")) {
        const safeName = `upload-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        tempCacheFile = new File(Paths.cache, safeName);
        await pickedFile.copy(tempCacheFile);
        uploadUri = tempCacheFile.uri;
      }

      await uploadToS3(targetUrl, uploadUri, mimeType, fileName);

      // Step 3: Confirm upload (server validates magic bytes)
      await getApiClient().post("/drivers/me/documents/confirm", {
        key,
        docType,
        mimeType,
      });

      setDocStatus(docType, "done");
    } catch (err) {
      console.error(`[Upload Error - ${docType}]:`, err);
      setDocStatus(docType, "error", "Upload failed. Please try again.");
    } finally {
      if (tempCacheFile && tempCacheFile.exists) {
        try {
          tempCacheFile.delete();
        } catch {
          // ignore cleanup error
        }
      }
    }
  };

  const handleContinue = async () => {
    setNavigating(true);
    try {
      await fetchAndNavigateToOnboardingStep();
    } catch {
      router.push("/(onboarding)/step4-availability" as never);
    } finally {
      setNavigating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Please upload clear photos or scans of the following documents. Only
          JPEG, PNG, or PDF files are accepted (max 10 MB each).
        </Text>

        {docs.map((doc) => (
          <View key={doc.type} style={styles.docCard}>
            <View style={styles.docInfo}>
              <Text style={styles.docLabel}>{doc.label}</Text>
              {doc.status === "done" && (
                <Text style={styles.doneText}>✓ Uploaded</Text>
              )}
              {doc.status === "error" && (
                <Text
                  style={styles.errorText}
                  accessibilityRole="alert"
                  accessible
                >
                  {doc.error}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.uploadBtn,
                doc.status === "done" && styles.uploadBtnDone,
              ]}
              onPress={() => handleUpload(doc.type)}
              disabled={doc.status === "uploading"}
              accessibilityLabel={`Upload ${doc.label}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: doc.status === "uploading" }}
              testID={`upload-${doc.type}`}
            >
              {doc.status === "uploading" ? (
                <ActivityIndicator color={colors.onSecondary} size="small" />
              ) : (
                <Text style={styles.uploadBtnText}>
                  {doc.status === "done" ? "Replace" : "Upload"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.actions}>
          <Button
            variant="primary"
            role="driver"
            disabled={!allDone}
            loading={navigating}
            onPress={handleContinue}
            accessibilityLabel="Continue to availability"
          >
            {allDone
              ? "Continue"
              : `Upload all ${docs.filter((d) => d.status !== "done").length} remaining`}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.base, gap: spacing.md },
  intro: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    lineHeight: 22,
  },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: spacing.md,
  },
  docInfo: { flex: 1, gap: 4 },
  docLabel: {
    ...typography.bodyMd,
    color: colors.onSurface,
    fontFamily: "Inter-Medium",
  },
  doneText: { ...typography.bodyMd, color: colors.secondary },
  errorText: { ...typography.bodyMd, color: colors.error },
  uploadBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    minWidth: 80,
    alignItems: "center",
  },
  uploadBtnDone: { backgroundColor: colors.surfaceContainerHigh },
  uploadBtnText: {
    ...typography.bodyMd,
    color: colors.onSecondary,
    fontFamily: "Inter-Medium",
  },
  actions: { marginTop: spacing.lg },
});
