import { by, device, element, expect } from "detox";

describe("Driver Registration Flow (T0.34)", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("completes driver application and lands on the driver dashboard shell", async () => {
    // 1. On driver login screen, navigate to apply
    await expect(element(by.text("Apply to drive"))).toBeVisible();
    await element(by.text("Apply to drive")).tap();

    // 2. Fill driver application
    await element(by.id("dreg-name")).typeText("Test Driver");
    await element(by.id("dreg-phone")).typeText("+923009876543");
    await element(by.id("dreg-password")).typeText("DriverPass123!");
    await element(by.id("dreg-confirm")).typeText("DriverPass123!\n");

    // 3. Submit
    await element(by.label("Apply to drive")).tap();

    // 4. Verify OTP screen
    await expect(element(by.text("Verify your number"))).toBeVisible();

    // 5. Enter 6-digit test OTP
    const digit1 = element(by.label("Digit 1"));
    await digit1.typeText("123456");

    // 6. Tap Verify
    await element(by.label("Verify code")).tap();

    // 7. Verify driver dashboard shell appears
    await expect(element(by.text("RouteRide Driver"))).toBeVisible();
  });
});
