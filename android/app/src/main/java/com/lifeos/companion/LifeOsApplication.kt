package com.lifeos.companion

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.lifeos.companion.data.AppDatabase
import com.lifeos.companion.data.NotificationRepository
import com.lifeos.companion.data.PreferencesManager
import com.lifeos.companion.worker.IngestSyncWorker
import java.util.concurrent.TimeUnit

/**
 * LifeOS Companion Application Class.
 * Initializes singleton storage, preferences, and background synchronization workers.
 */
class LifeOsApplication : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var preferencesManager: PreferencesManager
        private set

    lateinit var repository: NotificationRepository
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // 1. Initialize local Room database
        database = AppDatabase.getDatabase(this)

        // 2. Initialize encrypted/persistent preferences
        preferencesManager = PreferencesManager(this)

        // 3. Initialize repository
        repository = NotificationRepository(database.notificationDao(), preferencesManager)

        // 4. Schedule background fallback sync worker for queued offline notifications
        scheduleBackgroundSync()
    }

    private fun scheduleBackgroundSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicSyncRequest = PeriodicWorkRequestBuilder<IngestSyncWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            IngestSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicSyncRequest
        )
    }

    companion object {
        lateinit var instance: LifeOsApplication
            private set
    }
}
