import { by, device, element, expect } from "detox";

describe("Consumer Registration Flow (T0.34)", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("completes registration and lands on the passenger shell", async () => {
    // 1. On login screen, navigate to sign up
    await expect(element(by.text("Sign up"))).toBeVisible();
    await element(by.text("Sign up")).tap();

    // 2. Fill registration form
    await expect(element(by.text("Create account"))).toBeVisible();

    await element(by.id("reg-name")).typeText("Test Passenger");
    await element(by.id("reg-phone")).typeText("+923001234567");
    await element(by.id("reg-password")).typeText("SecurePass123!");
    await element(by.id("reg-confirm")).typeText("SecurePass123!\n");

    // 3. Submit
    await element(by.label("Create account")).tap();

    // 4. Verify OTP screen appears
    await expect(element(by.text("Enter code"))).toBeVisible();

    // 5. Enter 6-digit test OTP
    const digit1 = element(by.label("Digit 1"));
    await digit1.typeText("123456");

    // 6. Tap Verify
    await element(by.label("Verify code")).tap();

    // 7. Verify passenger landing shell is displayed
    await expect(element(by.text("RouteRide Passenger"))).toBeVisible();
  });
});
