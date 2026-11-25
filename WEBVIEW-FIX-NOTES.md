# WebView compatibility change

This project keeps the existing app features and applies a narrowly scoped compatibility adjustment to all three portal WebView instances (main portal, popup, and auxiliary WebView):

- removes Android WebView's `; wv` marker from the User-Agent;
- removes the `Version/4.0` token, which some portal endpoints may reject;
- leaves cookies, profile/session handling, cache policy, login flow, and automation logic unchanged.

This is a targeted compatibility fix based on the reported symptom. It is **not yet confirmed against the live Banglar Shiksha login service**; the portal must be tested on a device after building. No source-only change can guarantee the remote portal will accept every device/session.

## Build

Open this folder (the folder containing `settings.gradle.kts`) in Android Studio, allow Gradle sync, then run **Build > Build Bundle(s) / APK(s) > Build APK(s)**. Or run `gradle :app:assembleDebug` with JDK 17 and Gradle 8.9 installed.
