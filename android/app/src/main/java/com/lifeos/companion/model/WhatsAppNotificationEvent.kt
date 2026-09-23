package com.lifeos.companion.model

/**
 * Clean data transfer model extracted legitimately from Android's StatusBarNotification.
 * Contains only data officially exposed by Android notification extras.
 * Zero access to WhatsApp internal storage or proprietary databases.
 */
data class WhatsAppNotificationEvent(
    val deduplicationId: String,
    val packageName: String,
    val senderOrChat: String,
    val messageText: String,
    val postTime: Long,
    val conversationTitle: String? = null,
    val subText: String? = null,
    val isGroupChat: Boolean = false,
    val notificationKey: String? = null
)
