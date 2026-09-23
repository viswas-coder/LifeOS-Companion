package com.lifeos.companion.data

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

/**
 * Single source of truth for notification ingest, queue management, and server synchronization.
 */
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

    /**
     * Ingests a legitimately received WhatsApp notification event.
     * 1. Checks deduplication filter.
     * 2. Inserts into local Room database with PENDING status.
     * 3. Attempts immediate online sync; if offline, leaves PENDING for WorkManager.
     */
    suspend fun processIncomingNotification(event: WhatsAppNotificationEvent): Boolean = withContext(Dispatchers.IO) {
        // Fast-path memory deduplication check
        if (NotificationDeduplicator.isDuplicateRecent(event.deduplicationId)) {
            Log.d(TAG, "Notification skipped: duplicate fingerprint ${event.deduplicationId}")
            return@withContext false
        }

        // Check if already persisted in Room
        val existing = notificationDao.findByDeduplicationId(event.deduplicationId)
        if (existing != null) {
            Log.d(TAG, "Notification already exists in database: ${event.deduplicationId}")
            return@withContext false
        }

        // Persist to local Room database
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
        if (insertedId <= 0L) {
            return@withContext false
        }

        // Attempt immediate dispatch
        val savedEntity = entity.copy(id = insertedId)
        dispatchNotification(savedEntity)
        return@withContext true
    }

    /**
     * Transmits a single queued notification to the LifeOS Ingest API.
     */
    suspend fun dispatchNotification(entity: NotificationEntity): Boolean = withContext(Dispatchers.IO) {
        try {
            notificationDao.updateSyncStatus(entity.id, SyncStatus.SYNCING)

            val serverUrl = preferencesManager.getServerUrl()
            val apiToken = preferencesManager.getApiToken()
            val authHeader = if (apiToken.isNotBlank()) "Bearer $apiToken" else null

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
                preferencesManager.setLastSyncStatus("Success (${response.code()})")
                Log.i(TAG, "Successfully synced notification ${entity.id} to LifeOS")
                true
            } else {
                val errorMsg = "HTTP ${response.code()}: ${response.message()}"
                notificationDao.markSyncFailed(entity.id)
                preferencesManager.setLastSyncStatus("Failed ($errorMsg)")
                Log.w(TAG, "Server rejected notification ${entity.id}: $errorMsg")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network failure syncing notification ${entity.id} to LifeOS", e)
            notificationDao.markSyncFailed(entity.id)
            preferencesManager.setLastSyncStatus("Offline / Unreachable (${e.localizedMessage ?: "timeout"})")
            false
        }
    }

    /**
     * Flushes all pending or failed messages from the local queue to LifeOS.
     */
    suspend fun flushPendingQueue(): Int = withContext(Dispatchers.IO) {
        val pendingList = notificationDao.getPendingNotifications(SyncStatus.PENDING, 50)
        var successCount = 0
        for (item in pendingList) {
            val ok = dispatchNotification(item)
            if (ok) successCount++
        }
        successCount
    }

    suspend fun retryFailedQueue(): Int = withContext(Dispatchers.IO) {
        notificationDao.resetFailedToPending()
        flushPendingQueue()
    }

    companion object {
        private const val TAG = "LifeOS-Repo"
    }
}
