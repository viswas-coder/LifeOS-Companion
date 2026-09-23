package com.lifeos.companion.service

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
        // Notification dismissed by user; nothing required for ingest
    }

    companion object {
        private const val TAG = "LifeOS-NotifListener"

        // Only official WhatsApp package identifiers
        const val WHATSAPP_STANDARD_PACKAGE = "com.whatsapp"
        const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

        fun isWhatsAppPackage(pkg: String): Boolean {
            return pkg == WHATSAPP_STANDARD_PACKAGE || pkg == WHATSAPP_BUSINESS_PACKAGE
        }

        /**
         * Helper to check whether the user has granted Notification Access permission to this app.
         */
        fun isNotificationAccessGranted(context: Context): Boolean {
            val componentName = ComponentName(context, WhatsAppNotificationListenerService::class.java)
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            return flat != null && flat.contains(componentName.flattenToString())
        }
    }
}
