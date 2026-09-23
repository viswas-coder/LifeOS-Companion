package com.lifeos.companion.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Manages runtime configuration for LifeOS Companion.
 * Stores server URL, secret token, and pause/start state securely.
 * Zero hard-coded credentials.
 */
class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )

    private val _isMonitoringActive = MutableStateFlow(isMonitoringEnabled())
    val isMonitoringActive: StateFlow<Boolean> = _isMonitoringActive.asStateFlow()

    private val _serverUrlFlow = MutableStateFlow(getServerUrl())
    val serverUrlFlow: StateFlow<String> = _serverUrlFlow.asStateFlow()

    fun getServerUrl(): String {
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }

    fun setServerUrl(url: String) {
        val cleanUrl = url.trim().removeSuffix("/")
        prefs.edit().putString(KEY_SERVER_URL, cleanUrl).apply()
        _serverUrlFlow.value = cleanUrl
    }

    fun getApiToken(): String {
        return prefs.getString(KEY_API_TOKEN, "") ?: ""
    }

    fun setApiToken(token: String) {
        prefs.edit().putString(KEY_API_TOKEN, token.trim()).apply()
    }

    fun isMonitoringEnabled(): Boolean {
        return prefs.getBoolean(KEY_MONITORING_ENABLED, true)
    }

    fun setMonitoringEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
        _isMonitoringActive.value = enabled
    }

    fun getLastSyncTimestamp(): Long {
        return prefs.getLong(KEY_LAST_SYNC_TIME, 0L)
    }

    fun setLastSyncTimestamp(timestamp: Long) {
        prefs.edit().putLong(KEY_LAST_SYNC_TIME, timestamp).apply()
    }

    fun getLastSyncStatus(): String {
        return prefs.getString(KEY_LAST_SYNC_STATUS, "Ready") ?: "Ready"
    }

    fun setLastSyncStatus(status: String) {
        prefs.edit().putString(KEY_LAST_SYNC_STATUS, status).apply()
    }

    companion object {
        private const val PREFS_NAME = "lifeos_companion_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_API_TOKEN = "api_token"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        private const val KEY_LAST_SYNC_TIME = "last_sync_time"
        private const val KEY_LAST_SYNC_STATUS = "last_sync_status"

        // Default placeholder server URL. Configurable directly in the UI.
        const val DEFAULT_SERVER_URL = "https://your-lifeos.app"
        const val INGEST_ENDPOINT = "/api/whatsapp/personal-ingest"
    }
}
