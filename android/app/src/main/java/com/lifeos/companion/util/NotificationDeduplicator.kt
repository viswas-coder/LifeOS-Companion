package com.lifeos.companion.util

import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Provides multi-layer duplicate message filtering and stable ID generation.
 * WhatsApp frequently triggers notification updates for typing status, summary notifications,
 * or status bar refreshes. This utility ensures each discrete message is only processed once.
 */
object NotificationDeduplicator {

    // In-memory cache of recently ingested message fingerprints with expiration (last 10 minutes)
    private val recentFingerprints = ConcurrentHashMap<String, Long>()
    private const val EXPIRATION_WINDOW_MS = 10 * 60 * 1000L // 10 minutes

    /**
     * Generates a stable cryptographic SHA-256 fingerprint for a notification event.
     * Uses sender, message content, and conversation context.
     */
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

    /**
     * Checks if this exact message fingerprint was seen recently.
     */
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

    /**
     * Filters out non-message WhatsApp system notifications (e.g., "Checking for new messages",
     * "WhatsApp Web is currently active", backup notifications, etc.)
     */
    fun isSystemOrNonContentNotification(title: String?, text: String?): Boolean {
        if (title.isNullOrBlank() && text.isNullOrBlank()) return true

        val combined = "${title.orEmpty()} ${text.orEmpty()}".lowercase()
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
}
