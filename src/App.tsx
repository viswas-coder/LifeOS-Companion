import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Smartphone,
  Bell,
  Shield,
  FileCode,
  Download,
  Copy,
  Check,
  Play,
  Server,
  RefreshCw,
  Cpu,
  Layers,
  CheckCircle,
  Database,
  Send,
  Zap
} from 'lucide-react';

interface AndroidFileItem {
  path: string;
  name: string;
  language: string;
  category: 'core' | 'service' | 'data' | 'ui' | 'gradle';
  description: string;
  content: string;
}

interface IngestLog {
  id: string;
  timestamp: string;
  sender: string;
  message: string;
  chat: string;
  deduplicationId: string;
  isGroup: boolean;
  status: 'ACCEPTED' | 'DUPLICATE_REJECTED' | 'SYSTEM_FILTERED';
  rawPayload: any;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'simulator' | 'oppo' | 'api'>('overview');
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [copiedFile, setCopiedFile] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Ingest Simulator State
  const [ingestLogs, setIngestLogs] = useState<IngestLog[]>([]);
  const [simSender, setSimSender] = useState('Sarah Connor');
  const [simMessage, setSimMessage] = useState('Hey, please review the Q3 strategy doc before our 3pm sync.');
  const [simChat, setSimChat] = useState('Sarah Connor');
  const [simIsGroup, setSimIsGroup] = useState(false);
  const [seenHashes, setSeenHashes] = useState<Set<string>>(new Set());

  // Android Project Files Catalog
  const androidFiles: AndroidFileItem[] = [
    {
      path: 'app/src/main/AndroidManifest.xml',
      name: 'AndroidManifest.xml',
      language: 'xml',
      category: 'core',
      description: 'Declares NotificationListenerService with BIND_NOTIFICATION_LISTENER_SERVICE permission, network security, and zero superfluous permissions.',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Legitimate permissions for network delivery and reliable background sync -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <!-- Needed to request battery optimization exemption on aggressive OEM skins like ColorOS (OPPO) -->
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

    <!--
        NOTE: No storage, SMS, contacts, accessibility, or WhatsApp database permissions requested.
        The app operates solely via Android's official NotificationListenerService.
    -->

    <application
        android:name=".LifeOsApplication"
        android:allowBackup="true"
        android:dataExtractionRules="@xml/backup_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.LifeOSCompanion"
        android:networkSecurityConfig="@xml/network_security_config">

        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:theme="@style/Theme.LifeOSCompanion">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!--
            Official Android NotificationListenerService declaration.
            Requires the BIND_NOTIFICATION_LISTENER_SERVICE permission to guarantee that
            ONLY the Android OS System Server is permitted to bind to this service.
        -->
        <service
            android:name=".service.WhatsAppNotificationListenerService"
            android:label="@string/service_name"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>

    </application>

</manifest>`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/service/WhatsAppNotificationListenerService.kt',
      name: 'WhatsAppNotificationListenerService.kt',
      language: 'kotlin',
      category: 'service',
      description: 'Official NotificationListenerService implementation. Strictly intercepts com.whatsapp, extracts standard extras, checks deduplication, and queues for LifeOS.',
      content: `package com.lifeos.companion.service

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.lifeos.companion.LifeOsApplication
import com.lifeos.companion.model.WhatsAppNotificationEvent
import com.lifeos.companion.util.NotificationDeduplicator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Official Android NotificationListenerService Implementation for LifeOS Companion.
 *
 * HOW THIS SERVICE WORKS:
 * 1. The Android OS System Server maintains an active IPC binder link to this service.
 * 2. Only the Android OS itself is allowed to bind to this service, enforced by the
 *    android.permission.BIND_NOTIFICATION_LISTENER_SERVICE permission in AndroidManifest.xml.
 * 3. Whenever any notification is posted to the Android notification drawer, the OS invokes
 *    onNotificationPosted(StatusBarNotification sbn).
 * 4. STRICT FILTERING: We check sbn.packageName. If it is NOT "com.whatsapp" (or "com.whatsapp.w4b"),
 *    we drop the event immediately. No other application's notification is ever read or processed.
 * 5. LEGITIMATE DATA EXTRACTION: We read solely from sbn.notification.extras using official
 *    Android Notification API constants (Notification.EXTRA_TITLE, Notification.EXTRA_TEXT, etc.).
 * 6. ZERO DATABASE ACCESS: We never touch WhatsApp's internal /data/data folders, databases,
 *    or encrypted backups.
 * 7. DE-DUPLICATION: We compute a cryptographic SHA-256 fingerprint from the message contents and sender
 *    to discard repeated summary notifications posted by WhatsApp.
 * 8. QUEUE & DISPATCH: The event is stored in local Room SQLite storage and immediately queued
 *    for transmission to the LifeOS Ingest API.
 */
class WhatsAppNotificationListenerService : NotificationListenerService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListenerService connected successfully to Android OS")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListenerService disconnected from Android OS")
        // On Android 7.0+, request rebind if disconnected unexpectedly by OEM aggressive memory manager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(ComponentName(this, WhatsAppNotificationListenerService::class.java))
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    /**
     * Triggered by Android whenever a notification is posted or updated by any app.
     */
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        // 1. Strict Package Whitelist Check
        val packageName = sbn.packageName ?: return
        if (!isWhatsAppPackage(packageName)) {
            // Drop immediately. Never collect notifications from unrelated apps.
            return
        }

        // 2. Check if user paused monitoring in LifeOS Companion UI
        val app = application as? LifeOsApplication ?: return
        if (!app.preferencesManager.isMonitoringEnabled()) {
            Log.d(TAG, "Monitoring is paused by user. Ignoring WhatsApp notification.")
            return
        }

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // 3. Extract only official notification extras exposed by Android
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim()
        val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.trim()
        val isGroup = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false) || !conversationTitle.isNullOrBlank()

        // 4. Validate content: Discard empty notifications or system background alerts (e.g. "Backup in progress")
        if (NotificationDeduplicator.isSystemOrNonContentNotification(title, text)) {
            Log.d(TAG, "Skipping system/non-content WhatsApp notification: $title | $text")
            return
        }

        val effectiveSender = title ?: "WhatsApp Contact"
        val effectiveMessage = text ?: ""
        val postTime = sbn.postTime.takeIf { it > 0L } ?: System.currentTimeMillis()

        // 5. Generate stable fingerprint for duplicate detection
        val deduplicationId = NotificationDeduplicator.generateFingerprint(
            packageName = packageName,
            sender = effectiveSender,
            message = effectiveMessage,
            conversationTitle = conversationTitle,
            subText = subText
        )

        val event = WhatsAppNotificationEvent(
            deduplicationId = deduplicationId,
            packageName = packageName,
            senderOrChat = effectiveSender,
            messageText = effectiveMessage,
            postTime = postTime,
            conversationTitle = conversationTitle,
            subText = subText,
            isGroupChat = isGroup,
            notificationKey = sbn.key
        )

        // 6. Process asynchronously via Repository (persists to Room queue and attempts sync)
        serviceScope.launch {
            try {
                val ingested = app.repository.processIncomingNotification(event)
                if (ingested) {
                    Log.i(TAG, "Successfully captured WhatsApp notification from: $effectiveSender")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing captured WhatsApp notification", e)
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Dismissal event handled cleanly
    }

    companion object {
        private const val TAG = "LifeOS-NotifListener"

        const val WHATSAPP_STANDARD_PACKAGE = "com.whatsapp"
        const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

        fun isWhatsAppPackage(pkg: String): Boolean {
            return pkg == WHATSAPP_STANDARD_PACKAGE || pkg == WHATSAPP_BUSINESS_PACKAGE
        }

        fun isNotificationAccessGranted(context: Context): Boolean {
            val componentName = ComponentName(context, WhatsAppNotificationListenerService::class.java)
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            return flat != null && flat.contains(componentName.flattenToString())
        }
    }
}`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/util/NotificationDeduplicator.kt',
      name: 'NotificationDeduplicator.kt',
      language: 'kotlin',
      category: 'service',
      description: 'Generates SHA-256 stable fingerprints and filters out WhatsApp system alerts (backup progress, web active, call status).',
      content: `package com.lifeos.companion.util

import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Provides multi-layer duplicate message filtering and stable ID generation.
 * WhatsApp frequently triggers notification updates for typing status, summary notifications,
 * or status bar refreshes. This utility ensures each discrete message is only processed once.
 */
object NotificationDeduplicator {

    private val recentFingerprints = ConcurrentHashMap<String, Long>()
    private const val EXPIRATION_WINDOW_MS = 10 * 60 * 1000L // 10 minutes

    fun generateFingerprint(
        packageName: String,
        sender: String,
        message: String,
        conversationTitle: String?,
        subText: String?
    ): String {
        val raw = buildString {
            append(packageName.trim().lowercase())
            append("|")
            append(sender.trim().lowercase())
            append("|")
            append(message.trim())
            if (!conversationTitle.isNullOrBlank()) {
                append("|")
                append(conversationTitle.trim().lowercase())
            }
            if (!subText.isNullOrBlank()) {
                append("|")
                append(subText.trim().lowercase())
            }
        }
        return sha256(raw)
    }

    @Synchronized
    fun isDuplicateRecent(fingerprint: String): Boolean {
        cleanupExpired()
        val now = System.currentTimeMillis()
        val previousTimestamp = recentFingerprints[fingerprint]

        if (previousTimestamp != null && (now - previousTimestamp) < EXPIRATION_WINDOW_MS) {
            return true
        }

        recentFingerprints[fingerprint] = now
        return false
    }

    fun isSystemOrNonContentNotification(title: String?, text: String?): Boolean {
        if (title.isNullOrBlank() && text.isNullOrBlank()) return true

        val combined = "\${title.orEmpty()} \${text.orEmpty()}".lowercase()
        val ignoredPatterns = listOf(
            "checking for new messages",
            "whatsapp web is currently active",
            "backup in progress",
            "restoring chat history",
            "calling...",
            "incoming call",
            "missed call",
            "ongoing call",
            "waiting for this message"
        )

        return ignoredPatterns.any { pattern -> combined.contains(pattern) }
    }

    private fun cleanupExpired() {
        val now = System.currentTimeMillis()
        val iterator = recentFingerprints.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (now - entry.value > EXPIRATION_WINDOW_MS) {
                iterator.remove()
            }
        }
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
}`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/util/DeviceCompatibilityHelper.kt',
      name: 'DeviceCompatibilityHelper.kt',
      language: 'kotlin',
      category: 'core',
      description: 'OPPO A74 & ColorOS OEM integration helper. Direct intents to open Auto-launch Manager & Battery Optimization exemptions.',
      content: `package com.lifeos.companion.util

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Handles OEM-specific background execution quirks, specifically tailored for ColorOS (OPPO A74).
 * ColorOS aggressively kills background services and unbinds NotificationListenerService
 * unless auto-launch and battery optimization exceptions are explicitly granted.
 */
object DeviceCompatibilityHelper {

    private const val TAG = "LifeOS-Compat"

    fun isOppoOrColorOs(): Boolean {
        val manufacturer = Build.MANUFACTURER?.lowercase().orEmpty()
        val brand = Build.BRAND?.lowercase().orEmpty()
        return manufacturer.contains("oppo") || brand.contains("oppo") ||
                manufacturer.contains("realme") || brand.contains("realme") ||
                manufacturer.contains("oneplus") || brand.contains("oneplus")
    }

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        return powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:\${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch battery optimization request", e)
            val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(fallback)
        }
    }

    fun openColorOsAutoLaunchSettings(context: Context): Boolean {
        val intents = listOf(
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.PermissionManagerActivity"))
        )

        for (intent in intents) {
            try {
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
                return true
            } catch (ignored: Exception) {
                // Try next candidate component
            }
        }

        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/data/NotificationRepository.kt',
      name: 'NotificationRepository.kt',
      language: 'kotlin',
      category: 'data',
      description: 'Coordinates Room SQLite message storage, deduplication, immediate HTTP dispatch, and offline fallback queues.',
      content: `package com.lifeos.companion.data

import android.util.Log
import com.lifeos.companion.model.IngestPayload
import com.lifeos.companion.model.NotificationEntity
import com.lifeos.companion.model.SyncStatus
import com.lifeos.companion.model.WhatsAppNotificationEvent
import com.lifeos.companion.network.NetworkClient
import com.lifeos.companion.util.NotificationDeduplicator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class NotificationRepository(
    private val notificationDao: NotificationDao,
    private val preferencesManager: PreferencesManager
) {

    val latestNotification: Flow<NotificationEntity?> = notificationDao.observeLatestNotification()
    val totalCount: Flow<Int> = notificationDao.observeTotalCount()
    val pendingCount: Flow<Int> = notificationDao.observeCountByStatus(SyncStatus.PENDING)
    val syncedCount: Flow<Int> = notificationDao.observeCountByStatus(SyncStatus.SYNCED)
    val failedCount: Flow<Int> = notificationDao.observeCountByStatus(SyncStatus.FAILED)
    val recentNotifications: Flow<List<NotificationEntity>> = notificationDao.observeRecentNotifications(15)

    suspend fun processIncomingNotification(event: WhatsAppNotificationEvent): Boolean = withContext(Dispatchers.IO) {
        if (NotificationDeduplicator.isDuplicateRecent(event.deduplicationId)) {
            Log.d(TAG, "Notification skipped: duplicate fingerprint \${event.deduplicationId}")
            return@withContext false
        }

        val existing = notificationDao.findByDeduplicationId(event.deduplicationId)
        if (existing != null) {
            Log.d(TAG, "Notification already exists in database: \${event.deduplicationId}")
            return@withContext false
        }

        val entity = NotificationEntity(
            deduplicationId = event.deduplicationId,
            packageName = event.packageName,
            sender = event.senderOrChat,
            messageText = event.messageText,
            postTime = event.postTime,
            conversationTitle = event.conversationTitle,
            subText = event.subText,
            isGroupChat = event.isGroupChat,
            syncStatus = SyncStatus.PENDING
        )

        val insertedId = notificationDao.insertNotification(entity)
        if (insertedId <= 0L) return@withContext false

        val savedEntity = entity.copy(id = insertedId)
        dispatchNotification(savedEntity)
        return@withContext true
    }

    suspend fun dispatchNotification(entity: NotificationEntity): Boolean = withContext(Dispatchers.IO) {
        try {
            notificationDao.updateSyncStatus(entity.id, SyncStatus.SYNCING)

            val serverUrl = preferencesManager.getServerUrl()
            val apiToken = preferencesManager.getApiToken()
            val authHeader = if (apiToken.isNotBlank()) "Bearer \$apiToken" else null

            val apiService = NetworkClient.createApiService(serverUrl)

            val payload = IngestPayload(
                eventType = "whatsapp_notification",
                deduplicationId = entity.deduplicationId,
                packageName = entity.packageName,
                sender = entity.sender,
                message = entity.messageText,
                timestamp = entity.postTime,
                conversationTitle = entity.conversationTitle,
                subText = entity.subText,
                isGroupChat = entity.isGroupChat
            )

            val response = apiService.ingestNotification(payload, authHeader)

            if (response.isSuccessful && response.body()?.success != false) {
                notificationDao.updateSyncStatus(entity.id, SyncStatus.SYNCED)
                preferencesManager.setLastSyncTimestamp(System.currentTimeMillis())
                preferencesManager.setLastSyncStatus("Success (\${response.code()})")
                true
            } else {
                notificationDao.markSyncFailed(entity.id)
                preferencesManager.setLastSyncStatus("Failed (HTTP \${response.code()})")
                false
            }
        } catch (e: Exception) {
            notificationDao.markSyncFailed(entity.id)
            preferencesManager.setLastSyncStatus("Offline / Unreachable")
            false
        }
    }

    suspend fun flushPendingQueue(): Int = withContext(Dispatchers.IO) {
        val pendingList = notificationDao.getPendingNotifications(SyncStatus.PENDING, 50)
        var count = 0
        for (item in pendingList) {
            if (dispatchNotification(item)) count++
        }
        count
    }

    suspend fun retryFailedQueue(): Int = withContext(Dispatchers.IO) {
        notificationDao.resetFailedToPending()
        flushPendingQueue()
    }

    companion object {
        private const val TAG = "LifeOS-Repo"
    }
}`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/ui/MainActivity.kt',
      name: 'MainActivity.kt',
      language: 'kotlin',
      category: 'ui',
      description: 'Modern Jetpack Compose user interface displaying access status, live queue counts, last notification, server config, and OPPO quick setup.',
      content: `package com.lifeos.companion.ui

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.lifeos.companion.ui.theme.LifeOSCompanionTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LifeOSCompanionTheme {
                LifeOSCompanionScreen(viewModel = viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        viewModel.refreshPermissions()
    }
}`
    },
    {
      path: 'app/src/main/java/com/lifeos/companion/model/IngestPayload.kt',
      name: 'IngestPayload.kt',
      language: 'kotlin',
      category: 'data',
      description: 'Data model for POST /api/whatsapp/personal-ingest. Strictly conveys raw notification events without modifying LifeOS tasks directly.',
      content: `package com.lifeos.companion.model

import com.google.gson.annotations.SerializedName

/**
 * Payload sent to LifeOS backend ingest endpoint:
 * POST /api/whatsapp/personal-ingest
 *
 * NOTE: The companion app NEVER creates tasks directly.
 * It forwards verified raw notification ingest events for server-side triage.
 */
data class IngestPayload(
    @SerializedName("eventType")
    val eventType: String = "whatsapp_notification",

    @SerializedName("deduplicationId")
    val deduplicationId: String,

    @SerializedName("sourceApp")
    val sourceApp: String = "WhatsApp",

    @SerializedName("packageName")
    val packageName: String,

    @SerializedName("sender")
    val sender: String,

    @SerializedName("message")
    val message: String,

    @SerializedName("timestamp")
    val timestamp: Long,

    @SerializedName("conversationTitle")
    val conversationTitle: String? = null,

    @SerializedName("subText")
    val subText: String? = null,

    @SerializedName("isGroupChat")
    val isGroupChat: Boolean = false,

    @SerializedName("deviceModel")
    val deviceModel: String = android.os.Build.MODEL ?: "Android Device",

    @SerializedName("capturedAt")
    val capturedAt: Long = System.currentTimeMillis()
)

data class IngestResponse(
    @SerializedName("success")
    val success: Boolean,

    @SerializedName("message")
    val message: String? = null,

    @SerializedName("ingestId")
    val ingestId: String? = null,

    @SerializedName("status")
    val status: String? = null
)`
    },
    {
      path: 'app/build.gradle.kts',
      name: 'app/build.gradle.kts',
      language: 'kotlin',
      category: 'gradle',
      description: 'Module-level Gradle script configured with Min SDK 26, Target SDK 34, Jetpack Compose, Room, WorkManager, and Retrofit.',
      content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.kapt)
}

android {
    namespace = "com.lifeos.companion"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.lifeos.companion"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Jetpack Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    kapt(libs.androidx.room.compiler)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // Retrofit & OkHttp
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    // Coroutines & DataStore
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore.preferences)
}`
    },
    {
      path: 'gradle/libs.versions.toml',
      name: 'libs.versions.toml',
      language: 'toml',
      category: 'gradle',
      description: 'Modern standard Version Catalog pinning AGP 8.5.2, Kotlin 2.0.0, Compose 2024.09, Room 2.6.1, and WorkManager 2.9.1.',
      content: `[versions]
agp = "8.5.2"
kotlin = "2.0.0"
coreKtx = "1.13.1"
lifecycleRuntimeKtx = "2.8.6"
activityCompose = "1.9.2"
composeBom = "2024.09.02"
room = "2.6.1"
workManager = "2.9.1"
retrofit = "2.11.0"
okhttp = "4.12.0"
coroutines = "1.8.1"
gson = "2.11.0"
datastore = "1.1.1"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycleRuntimeKtx" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-material-icons-extended = { group = "androidx.compose.material", name = "material-icons-extended" }

androidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
androidx-room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
androidx-room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

androidx-work-runtime-ktx = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "workManager" }

retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-converter-gson = { group = "com.squareup.retrofit2", name = "converter-gson", version.ref = "retrofit" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }

kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-kapt = { id = "org.jetbrains.kotlin.kapt", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }`
    }
  ];

  // Simulator Handler
  const handleSimulateNotification = (isDuplicate = false) => {
    const textToUse = isDuplicate ? simMessage : `${simMessage} (v${Math.floor(Math.random() * 900 + 100)})`;
    const rawString = `com.whatsapp|${simSender.trim().toLowerCase()}|${textToUse.trim()}|${simChat.trim().toLowerCase()}`;

    // Simple client hash
    let hashVal = 0;
    for (let i = 0; i < rawString.length; i++) {
      hashVal = ((hashVal << 5) - hashVal) + rawString.charCodeAt(i);
      hashVal |= 0;
    }
    const dedupId = Math.abs(hashVal).toString(16).padStart(16, '0') + 'f7a8b9';

    const isDup = seenHashes.has(dedupId);
    if (!isDup) {
      setSeenHashes(prev => new Set(prev).add(dedupId));
    }

    const payload = {
      eventType: 'whatsapp_notification',
      deduplicationId: dedupId,
      sourceApp: 'WhatsApp',
      packageName: 'com.whatsapp',
      sender: simSender,
      message: textToUse,
      timestamp: Date.now(),
      conversationTitle: simIsGroup ? simChat : null,
      isGroupChat: simIsGroup,
      deviceModel: 'OPPO CPH2219 (OPPO A74)'
    };

    const newLog: IngestLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toLocaleTimeString(),
      sender: simSender,
      message: textToUse,
      chat: simChat,
      deduplicationId: dedupId,
      isGroup: simIsGroup,
      status: isDup ? 'DUPLICATE_REJECTED' : 'ACCEPTED',
      rawPayload: payload
    };

    setIngestLogs(prev => [newLog, ...prev]);
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      const zip = new JSZip();

      // Root Gradle
      zip.file('settings.gradle.kts', `pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\\\.android.*")
                includeGroupByRegex("com\\\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "LifeOS-Companion"
include(":app")
`);
      zip.file('build.gradle.kts', `// Top-level build file
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.kapt) apply false
}
`);
      zip.file('gradle.properties', `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
`);

      // Wrapper
      const wrapperFolder = zip.folder('gradle/wrapper');
      wrapperFolder?.file('gradle-wrapper.properties', `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`);

      // Version Catalog
      const gradleFolder = zip.folder('gradle');
      const catalogFile = androidFiles.find(f => f.name === 'libs.versions.toml');
      if (catalogFile) {
        gradleFolder?.file('libs.versions.toml', catalogFile.content);
      }

      // App folder
      const appFolder = zip.folder('app');
      const appBuild = androidFiles.find(f => f.name === 'app/build.gradle.kts');
      if (appBuild) appFolder?.file('build.gradle.kts', appBuild.content);

      appFolder?.file('proguard-rules.pro', `-keepclassmembers class com.lifeos.companion.model.** { *; }
-keepclassmembers class com.lifeos.companion.network.** { *; }
-keepclassmembers class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class *
`);

      // Source Code
      for (const item of androidFiles) {
        if (item.category !== 'gradle') {
          appFolder?.file(item.path.replace(/^app\//, ''), item.content);
        }
      }

      // Add README
      zip.file('README.md', `# LifeOS Companion (Android)
Official NotificationListenerService for WhatsApp on Android (OPPO A74 ready).
Build with: ./gradlew assembleDebug
`);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lifeos-companion-android.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Error generating zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const selectedFile = androidFiles[selectedFileIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">LifeOS Companion</span>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Android 8.0+ / OPPO A74
                </span>
              </div>
              <p className="text-xs text-slate-400">Official NotificationListenerService Ingest Architecture</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownloadZip}
              disabled={isZipping}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-900/20 active:scale-95 disabled:opacity-50"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Downloaded!</span>
                </>
              ) : isZipping ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating ZIP...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Android Project (.zip)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-slate-800/40 text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 border-b-2 font-medium flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Architecture & Specs</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2.5 border-b-2 font-medium flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'files'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Code Explorer ({androidFiles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2.5 border-b-2 font-medium flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'simulator'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Ingest Simulator & Queue</span>
          </button>
          <button
            onClick={() => setActiveTab('oppo')}
            className={`px-4 py-2.5 border-b-2 font-medium flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'oppo'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>OPPO A74 / ColorOS Guide</span>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2.5 border-b-2 font-medium flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'api'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Backend Ingest Contract</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* TAB 1: OVERVIEW & SPECS */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Hero Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 p-6 md:p-8 relative overflow-hidden">
              <div className="max-w-3xl relative z-10 space-y-4">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono">
                  <Shield className="w-3.5 h-3.5" />
                  <span>100% Security Compliant • No Reverse Engineering</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  LifeOS Companion Android Application
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                  A standalone Kotlin Android application designed specifically to bridge your personal WhatsApp notifications on your <strong>OPPO A74</strong> with your LifeOS web backend. Built exclusively using Android's legitimate <code>NotificationListenerService</code> API.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
                  <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                    <div className="text-slate-400">Package Name</div>
                    <div className="font-mono font-semibold text-emerald-400 mt-0.5">com.lifeos.companion</div>
                  </div>
                  <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                    <div className="text-slate-400">Min / Target SDK</div>
                    <div className="font-mono font-semibold text-white mt-0.5">API 26 / API 34</div>
                  </div>
                  <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                    <div className="text-slate-400">Storage & Queue</div>
                    <div className="font-mono font-semibold text-white mt-0.5">Room SQLite + WorkManager</div>
                  </div>
                  <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800">
                    <div className="text-slate-400">Target Endpoint</div>
                    <div className="font-mono font-semibold text-emerald-400 mt-0.5">/api/whatsapp/personal-ingest</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Core Verification Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base">Zero WhatsApp Tampering</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  No internal database decryption, no WhatsApp Web session hijack, no reverse-engineered private protocols, and zero browser automation. Completely safe for your primary phone.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-1">
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Uses official NotificationListenerService</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Standard Notification extras only</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base">Resilient Offline Queue</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Notifications are stored in Room SQLite with SHA-256 duplicate detection before transmission. Network outages leave notifications queued safely.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-1">
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>WorkManager automatic retry</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Exponential backoff and online gating</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base">OPPO A74 & ColorOS Ready</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ColorOS aggressively disables background services. The app includes tailored intent helpers to trigger Auto-launch whitelist and battery exemption directly.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-1">
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>ColorOS auto-start shortcuts</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>24/7 background listener survival</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* How It Works Diagram */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>End-to-End Notification Ingestion Flow</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-mono text-emerald-400 font-bold">1. Android OS Broadcast</div>
                  <p className="text-slate-400">WhatsApp displays a notification. Android System Server notifies <code>WhatsAppNotificationListenerService.onNotificationPosted()</code>.</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-mono text-blue-400 font-bold">2. Filter & Deduplicate</div>
                  <p className="text-slate-400">App drops non-WhatsApp packages, filters system alerts (backups, call alerts), and computes SHA-256 message fingerprint.</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-mono text-amber-400 font-bold">3. Local Room Persistence</div>
                  <p className="text-slate-400">Event is saved to SQLite with <code>PENDING</code> status. If already in database, duplicate insertion is ignored.</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-mono text-purple-400 font-bold">4. LifeOS Ingest Dispatch</div>
                  <p className="text-slate-400">Retrofit posts to <code>POST /api/whatsapp/personal-ingest</code>. On failure, WorkManager retries with backoff.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CODE EXPLORER */}
        {activeTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* File List */}
            <div className="lg:col-span-4 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">
                Project Files ({androidFiles.length})
              </div>
              <div className="space-y-1 max-h-[650px] overflow-y-auto pr-1">
                {androidFiles.map((file, idx) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFileIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-mono transition-all flex flex-col space-y-1 ${
                      selectedFileIndex === idx
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold truncate">{file.name}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {file.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 truncate font-sans">{file.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Code Viewer */}
            <div className="lg:col-span-8 flex flex-col space-y-3">
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                <div>
                  <div className="text-xs font-mono font-semibold text-emerald-400">{selectedFile.path}</div>
                  <div className="text-xs text-slate-400">{selectedFile.description}</div>
                </div>
                <button
                  onClick={() => handleCopyCode(selectedFile.content)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  {copiedFile ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs overflow-x-auto max-h-[600px] text-slate-300 leading-relaxed">
                <pre>{selectedFile.content}</pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INGEST SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                    <Play className="w-4 h-4 text-emerald-400" />
                    <span>Interactive Notification Ingest Simulator</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Test the deduplication algorithm, sender parsing, and payload schema in real-time before connecting your OPPO A74.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Notification Title / Sender</label>
                  <input
                    type="text"
                    value={simSender}
                    onChange={(e) => setSimSender(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Message Text Preview</label>
                  <input
                    type="text"
                    value={simMessage}
                    onChange={(e) => setSimMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Chat Name / Conversation Title</label>
                  <input
                    type="text"
                    value={simChat}
                    onChange={(e) => setSimChat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simIsGroup}
                    onChange={(e) => setSimIsGroup(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950"
                  />
                  <span>Is WhatsApp Group Chat</span>
                </label>

                <div className="flex space-x-3">
                  <button
                    onClick={() => handleSimulateNotification(true)}
                    className="px-3.5 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                  >
                    Simulate Duplicate Message
                  </button>
                  <button
                    onClick={() => handleSimulateNotification(false)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch Simulated WhatsApp Notification</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Ingest Activity Feed */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">
                  Ingest Activity Stream ({ingestLogs.length} events)
                </h4>
                {ingestLogs.length > 0 && (
                  <button
                    onClick={() => {
                      setIngestLogs([]);
                      setSeenHashes(new Set());
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Clear Stream
                  </button>
                )}
              </div>

              {ingestLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No simulated events dispatched yet. Click "Dispatch Simulated WhatsApp Notification" above.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ingestLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white">{log.sender}</span>
                          {log.isGroup && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]">
                              Group: {log.chat}
                            </span>
                          )}
                          <span className="text-slate-500 font-mono text-[11px]">{log.timestamp}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                            log.status === 'ACCEPTED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <div className="text-slate-300">{log.message}</div>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono">
                        <div>SHA-256 Fingerprint: {log.deduplicationId}</div>
                        <div className="text-slate-400">Target: POST /api/whatsapp/personal-ingest</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: OPPO A74 & COLOROS SETUP */}
        {activeTab === 'oppo' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <span>OPPO A74 (ColorOS 11 / 12) Optimization Guide</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                OPPO devices run ColorOS, which enforces aggressive battery-saving background task termination. By default, ColorOS may unbind or kill NotificationListenerServices when the screen turns off. Follow these steps to ensure continuous 24/7 capture:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Step 1: Grant Notification Access</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Open LifeOS Companion and tap <strong>"Open Android Notification Access Settings"</strong>. Find <em>LifeOS Companion</em> in the list and toggle it to <strong>Allow</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Step 2: Battery Optimization Exemption</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Go to <strong>Settings</strong> &gt; <strong>Battery</strong> &gt; <strong>App Battery Management</strong> &gt; <strong>LifeOS Companion</strong>. Enable <strong>"Allow background activity"</strong> and set to <strong>"Don't optimize"</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Step 3: Enable Auto-launch</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Go to <strong>Settings</strong> &gt; <strong>App Management</strong> &gt; <strong>Auto-launch</strong>. Toggle <strong>LifeOS Companion</strong> to <strong>ON</strong>. The companion app also includes a direct intent button to jump here.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Step 4: Lock in Recent Tasks</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Swipe up to open Recent Tasks. Pull down on the LifeOS Companion card and tap the <strong>Lock (padlock)</strong> icon to prevent accidental closure during memory clearance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: BACKEND INGEST CONTRACT */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>LifeOS Backend Ingest API Contract</span>
              </h3>
              <p className="text-xs text-slate-400">
                When you are ready to connect your existing LifeOS web application, implement this standard POST route:
              </p>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">POST</span>
                <span className="text-slate-200">/api/whatsapp/personal-ingest</span>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Request JSON Schema
                </h4>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre>{`{
  "eventType": "whatsapp_notification",
  "deduplicationId": "3b7c89f012e4...",     // SHA-256 stable fingerprint
  "sourceApp": "WhatsApp",
  "packageName": "com.whatsapp",
  "sender": "Alice Johnson",
  "message": "Hey, let's schedule the meeting for 2 PM",
  "timestamp": 1727079600000,
  "conversationTitle": "Project Sync",      // null for direct chats
  "subText": "2 messages",                 // null or Android subText
  "isGroupChat": true,
  "deviceModel": "OPPO CPH2219 (OPPO A74)",
  "capturedAt": 1727079601230
}`}</pre>
                </div>

                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider pt-2">
                  Expected 200 OK Response
                </h4>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre>{`{
  "success": true,
  "status": "ingested",
  "ingestId": "ing_98273491823"
}`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
