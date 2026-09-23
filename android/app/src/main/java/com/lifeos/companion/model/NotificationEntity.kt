package com.lifeos.companion.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local Room Entity for offline message queue and duplicate prevention.
 * Indexed by deduplicationId to guarantee uniqueness at the database layer.
 */
@Entity(
    tableName = "captured_notifications",
    indices = [
        Index(value = ["deduplicationId"], unique = true),
        Index(value = ["syncStatus"]),
        Index(value = ["postTime"])
    ]
)
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val deduplicationId: String,
    val packageName: String,
    val sender: String,
    val messageText: String,
    val postTime: Long,
    val conversationTitle: String? = null,
    val subText: String? = null,
    val isGroupChat: Boolean = false,
    val syncStatus: SyncStatus = SyncStatus.PENDING,
    val retryCount: Int = 0,
    val lastAttemptTime: Long = 0L,
    val createdAt: Long = System.currentTimeMillis()
)

enum class SyncStatus {
    PENDING,
    SYNCING,
    SYNCED,
    FAILED
}
