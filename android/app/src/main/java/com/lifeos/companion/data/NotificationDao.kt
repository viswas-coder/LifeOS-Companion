package com.lifeos.companion.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.lifeos.companion.model.NotificationEntity
import com.lifeos.companion.model.SyncStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface NotificationDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertNotification(notification: NotificationEntity): Long

    @Update
    suspend fun updateNotification(notification: NotificationEntity)

    @Query("SELECT * FROM captured_notifications WHERE deduplicationId = :dedupId LIMIT 1")
    suspend fun findByDeduplicationId(dedupId: String): NotificationEntity?

    @Query("SELECT * FROM captured_notifications WHERE syncStatus = :status ORDER BY postTime ASC LIMIT :limit")
    suspend fun getPendingNotifications(status: SyncStatus = SyncStatus.PENDING, limit: Int = 50): List<NotificationEntity>

    @Query("SELECT * FROM captured_notifications ORDER BY postTime DESC LIMIT 1")
    fun observeLatestNotification(): Flow<NotificationEntity?>

    @Query("SELECT * FROM captured_notifications ORDER BY postTime DESC LIMIT :limit")
    fun observeRecentNotifications(limit: Int = 20): Flow<List<NotificationEntity>>

    @Query("SELECT COUNT(*) FROM captured_notifications")
    fun observeTotalCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM captured_notifications WHERE syncStatus = :status")
    fun observeCountByStatus(status: SyncStatus): Flow<Int>

    @Query("UPDATE captured_notifications SET syncStatus = :status WHERE id = :id")
    suspend fun updateSyncStatus(id: Long, status: SyncStatus)

    @Query("UPDATE captured_notifications SET syncStatus = :status, retryCount = retryCount + 1, lastAttemptTime = :now WHERE id = :id")
    suspend fun markSyncFailed(id: Long, now: Long = System.currentTimeMillis(), status: SyncStatus = SyncStatus.FAILED)

    @Query("UPDATE captured_notifications SET syncStatus = 'PENDING' WHERE syncStatus = 'FAILED'")
    suspend fun resetFailedToPending(): Int

    @Query("DELETE FROM captured_notifications WHERE syncStatus = 'SYNCED' AND postTime < :cutoffTimestamp")
    suspend fun purgeOldSynced(cutoffTimestamp: Long): Int
}
