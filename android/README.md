# LifeOS Companion (Android)

A dedicated, security-compliant Android companion application designed to intercept personal WhatsApp notifications using Android's official `NotificationListenerService` and safely forward them to your LifeOS ingest API (`POST /api/whatsapp/personal-ingest`).

---

## Architecture & Security Principles

1. **Zero Database / File Scraping**:
   - The app strictly observes incoming notifications through Android's official `NotificationListenerService` (`onNotificationPosted`).
   - Does **NOT** access WhatsApp's internal `/data/data/com.whatsapp` database, key files, session cookies, or web sessions.
2. **Strict Package Filter**:
   - Only processes notifications originating from `com.whatsapp` (and optionally `com.whatsapp.w4b` WhatsApp Business).
   - All notifications from other applications are discarded immediately at line 1.
3. **Legitimately Exposed Data**:
   - Extracts standard Android `Notification` extras:
     - Sender / Title (`Notification.EXTRA_TITLE` or `Notification.EXTRA_CONVERSATION_TITLE`)
     - Message Text (`Notification.EXTRA_BIG_TEXT` or `Notification.EXTRA_TEXT`)
     - SubText / Context (`Notification.EXTRA_SUB_TEXT`)
     - Timestamp (`sbn.postTime`)
4. **Stable Duplicate-Message Protection**:
   - Computes a cryptographic SHA-256 fingerprint:
     `sha256(packageName + sender + messageText + conversationTitle + subText)`
   - Filters duplicate updates (typing indicators, system updates, summary notifications).
   - Enforces unique index constraint in the local Room SQLite database.
5. **Offline Queue & Resilient Retry**:
   - All incoming notifications are persisted locally in Room database before network transmission (`PENDING`).
   - If LifeOS server is offline or unreachable, notifications remain safely queued.
   - Background sync is managed by Android `WorkManager` with `NetworkType.CONNECTED` constraints and exponential backoff retry.
6. **No Direct Task Creation**:
   - In accordance with LifeOS architecture, the companion app **never** creates tasks or modifies LifeOS state directly.
   - It only pushes raw event payloads to `POST /api/whatsapp/personal-ingest` for LifeOS server-side AI/rule-based triage.
7. **Zero Hardcoded Secrets**:
   - The server URL and optional Bearer API tokens are configured by the user via the in-app UI.

---

## OPPO A74 (ColorOS) Specific Setup

OPPO devices run ColorOS (Android 11 / 12), which has aggressive background process termination rules that can kill background listener services. To ensure continuous 24/7 capture:

1. **Grant Notification Access**:
   - Tap **"Open Android Notification Access Settings"** in the app.
   - Enable **LifeOS Companion**.
2. **Exempt from Battery Optimization**:
   - In LifeOS Companion, tap **"Battery Exemption"**.
   - Select **"Don't optimize"** or **"Allow background activity"**.
3. **Enable Auto-launch**:
   - Go to **Settings** > **App Management** > **Auto-launch**.
   - Toggle **LifeOS Companion** to **ON**.
4. **Lock in Recent Apps (Optional but Recommended)**:
   - Swipe up to open the Android Recent Tasks switcher.
   - Tap the three dots (or pull down) on the LifeOS Companion card and tap **Lock** (padlock icon).

---

## Build & Run Instructions

### Prerequisites
- JDK 17+
- Android SDK 34 (API 34)
- Gradle 8.7+ (included via Gradle Wrapper)

### Command-line Build
```bash
# Clone or navigate to the android directory
cd android

# Build debug APK
./gradlew assembleDebug

# Run unit tests
./gradlew test

# Install directly to connected OPPO A74 device via ADB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Android Studio
1. Open Android Studio -> **File** > **Open** > select the `android` folder.
2. Allow Gradle sync to complete.
3. Connect your OPPO A74 with USB Debugging enabled.
4. Click **Run 'app'** (`Shift + F10`).
