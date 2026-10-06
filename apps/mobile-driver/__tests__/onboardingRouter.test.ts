import {
  getOnboardingRoute,
  fetchAndNavigateToOnboardingStep,
} from "../src/navigation/onboardingRouter";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

const mockGet = jest.fn();
jest.mock("@routeride/ui", () => ({
  getApiClient: () => ({
    get: (...args: unknown[]) => mockGet(...args),
  }),
}));

describe("onboardingRouter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOnboardingRoute", () => {
    it("maps step1-vehicle to /(onboarding)/step1-vehicle", () => {
      expect(getOnboardingRoute("step1-vehicle")).toBe(
        "/(onboarding)/step1-vehicle",
      );
    });

    it("maps step2-documents to /(onboarding)/step2-documents", () => {
      expect(getOnboardingRoute("step2-documents")).toBe(
        "/(onboarding)/step2-documents",
      );
    });

    it("maps step4-availability to /(onboarding)/step4-availability", () => {
      expect(getOnboardingRoute("step4-availability")).toBe(
        "/(onboarding)/step4-availability",
      );
    });

    it("maps pending to /(onboarding)/pending", () => {
      expect(getOnboardingRoute("pending")).toBe("/(onboarding)/pending");
    });

    it("maps approved to /(app)", () => {
      expect(getOnboardingRoute("approved")).toBe("/(app)");
    });

    it("maps rejected to /(onboarding)/pending", () => {
      expect(getOnboardingRoute("rejected")).toBe("/(onboarding)/pending");
    });

    it("maps suspended to /(onboarding)/pending", () => {
      expect(getOnboardingRoute("suspended")).toBe("/(onboarding)/pending");
    });

    it("maps unknown step to /(onboarding)/step1-vehicle fallback", () => {
      expect(getOnboardingRoute("unknown-step" as never)).toBe(
        "/(onboarding)/step1-vehicle",
      );
    });
  });

  describe("fetchAndNavigateToOnboardingStep", () => {
    it("calls /drivers/me/onboarding-status and navigates to the target route", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            currentStep: "step2-documents",
            status: "PENDING",
            profileCompleted: true,
            documentsCompleted: false,
            availabilityCompleted: false,
            uploadedDocuments: ["CNIC"],
            missingDocuments: ["LICENCE", "REGISTRATION", "INSURANCE"],
          },
        },
      });

      const res = await fetchAndNavigateToOnboardingStep();

      expect(mockGet).toHaveBeenCalledWith("/drivers/me/onboarding-status");
      expect(mockReplace).toHaveBeenCalledWith("/(onboarding)/step2-documents");
      expect(res.currentStep).toBe("step2-documents");
    });

    it("handles direct non-enveloped response shape", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          currentStep: "approved",
          status: "APPROVED",
          profileCompleted: true,
          documentsCompleted: true,
          availabilityCompleted: true,
          uploadedDocuments: ["CNIC", "LICENCE", "REGISTRATION", "INSURANCE"],
          missingDocuments: [],
        },
      });

      const res = await fetchAndNavigateToOnboardingStep();

      expect(mockReplace).toHaveBeenCalledWith("/(app)");
      expect(res.currentStep).toBe("approved");
    });
  });
});
