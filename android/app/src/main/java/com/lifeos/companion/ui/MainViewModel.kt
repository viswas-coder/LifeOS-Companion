package com.lifeos.companion.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lifeos.companion.LifeOsApplication
import com.lifeos.companion.model.NotificationEntity
import com.lifeos.companion.network.NetworkClient
import com.lifeos.companion.service.WhatsAppNotificationListenerService
import com.lifeos.companion.util.DeviceCompatibilityHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ConnectionTestResult(
    val inProgress: Boolean = false,
    val success: Boolean? = null,
    val message: String? = null
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as LifeOsApplication
    private val repository = app.repository
    private val prefs = app.preferencesManager

    // UI States
    private val _isNotificationAccessGranted = MutableStateFlow(false)
    val isNotificationAccessGranted: StateFlow<Boolean> = _isNotificationAccessGranted.asStateFlow()

    private val _isBatteryOptimizationIgnored = MutableStateFlow(false)
    val isBatteryOptimizationIgnored: StateFlow<Boolean> = _isBatteryOptimizationIgnored.asStateFlow()

    val isMonitoringActive: StateFlow<Boolean> = prefs.isMonitoringActive

    val serverUrl: StateFlow<String> = prefs.serverUrlFlow

    private val _apiToken = MutableStateFlow(prefs.getApiToken())
    val apiToken: StateFlow<String> = _apiToken.asStateFlow()

    private val _connectionTest = MutableStateFlow(ConnectionTestResult())
    val connectionTest: StateFlow<ConnectionTestResult> = _connectionTest.asStateFlow()

    val latestNotification: StateFlow<NotificationEntity?> = repository.latestNotification
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val totalCount: StateFlow<Int> = repository.totalCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val pendingCount: StateFlow<Int> = repository.pendingCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val syncedCount: StateFlow<Int> = repository.syncedCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val failedCount: StateFlow<Int> = repository.failedCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val recentNotifications: StateFlow<List<NotificationEntity>> = repository.recentNotifications
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        refreshPermissions()
    }

    fun refreshPermissions() {
        _isNotificationAccessGranted.value =
            WhatsAppNotificationListenerService.isNotificationAccessGranted(getApplication())
        _isBatteryOptimizationIgnored.value =
            DeviceCompatibilityHelper.isIgnoringBatteryOptimizations(getApplication())
    }

    fun toggleMonitoring(enabled: Boolean) {
        prefs.setMonitoringEnabled(enabled)
    }

    fun updateServerUrl(newUrl: String) {
        prefs.setServerUrl(newUrl)
    }

    fun updateApiToken(newToken: String) {
        prefs.setApiToken(newToken)
        _apiToken.value = newToken
    }

    fun testConnection() {
        viewModelScope.launch(Dispatchers.IO) {
            _connectionTest.value = ConnectionTestResult(inProgress = true)
            try {
                val service = NetworkClient.createApiService(prefs.getServerUrl())
                val token = prefs.getApiToken()
                val auth = if (token.isNotBlank()) "Bearer $token" else null
                val response = service.pingIngestEndpoint(authHeader = auth)

                if (response.isSuccessful) {
                    _connectionTest.value = ConnectionTestResult(
                        inProgress = false,
                        success = true,
                        message = "Connected! HTTP ${response.code()}"
                    )
                } else {
                    _connectionTest.value = ConnectionTestResult(
                        inProgress = false,
                        success = false,
                        message = "Endpoint reached but rejected: HTTP ${response.code()}"
                    )
                }
            } catch (e: Exception) {
                _connectionTest.value = ConnectionTestResult(
                    inProgress = false,
                    success = false,
                    message = "Connection failed: ${e.localizedMessage ?: "timeout"}"
                )
            }
        }
    }

    fun retryFailedQueue() {
        viewModelScope.launch(Dispatchers.IO) {
            repository.retryFailedQueue()
        }
    }
}
