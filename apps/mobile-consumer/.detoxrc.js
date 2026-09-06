/** @type {Detox.DetoxConfig} */
module.exports = {
  logger: {
    level: process.env.CI ? "debug" : "info",
  },
  testRunner: {
    $0: "jest",
    args: {
      config: "e2e/jest.config.js",
      maxWorkers: 1,
    },
  },
  artifacts: {
    plugins: {
      log: process.env.CI ? "failing" : "none",
      screenshot: "failing",
      video: "failing",
    },
  },
  apps: {
    "ios.debug": {
      type: "ios.app",
      binaryPath:
        "ios/build/Build/Products/Debug-iphonesimulator/RouteRide.app",
      build:
        "xcodebuild -workspace ios/RouteRide.xcworkspace -scheme RouteRide -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "android.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/debug/app-debug.apk",
      build:
        "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug",
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: "iPhone 16",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: "Pixel_7_API_35",
      },
    },
  },
  configurations: {
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.debug",
    },
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
  },
};
