package com.lifeos.companion.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.lifeos.companion.LifeOsApplication

/**
 * Reliable background worker powered by Android WorkManager.
 * Periodically retries queued and failed notifications when network connectivity is restored.
 */
class IngestSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? LifeOsApplication ?: return Result.failure()
        Log.i(TAG, "IngestSyncWorker running: attempting to flush pending offline notifications")

        return try {
            val syncedCount = app.repository.flushPendingQueue()
            Log.i(TAG, "IngestSyncWorker completed. Synced $syncedCount queued notifications.")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "IngestSyncWorker failed to sync queue", e)
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    companion object {
        const val WORK_NAME = "lifeos_ingest_sync_worker"
        private const val TAG = "LifeOS-SyncWorker"
    }
}
