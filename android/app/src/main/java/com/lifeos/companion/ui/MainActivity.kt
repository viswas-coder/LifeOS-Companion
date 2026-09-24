package com.lifeos.companion.ui

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifeos.companion.model.NotificationEntity
import com.lifeos.companion.model.SyncStatus
import com.lifeos.companion.ui.theme.Amber500
import com.lifeos.companion.ui.theme.Blue500
import com.lifeos.companion.ui.theme.Emerald400
import com.lifeos.companion.ui.theme.Emerald500
import com.lifeos.companion.ui.theme.Emerald600
import com.lifeos.companion.ui.theme.LifeOSCompanionTheme
import com.lifeos.companion.ui.theme.Red500
import com.lifeos.companion.ui.theme.Slate200
import com.lifeos.companion.ui.theme.Slate400
import com.lifeos.companion.ui.theme.Slate700
import com.lifeos.companion.ui.theme.Slate800
import com.lifeos.companion.ui.theme.Slate900
import com.lifeos.companion.ui.theme.Slate950
import com.lifeos.companion.util.DeviceCompatibilityHelper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LifeOSCompanionTheme {
                LifeOSCompanionScreen(viewModel = viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-check permission if user returned from system settings
        viewModel.refreshPermissions()
    }
}

@Composable
fun LifeOSCompanionScreen(viewModel: MainViewModel) {
    val context = LocalContext.current
    val hasNotificationAccess by viewModel.isNotificationAccessGranted.collectAsState()
    val isBatteryIgnored by viewModel.isBatteryOptimizationIgnored.collectAsState()
    val isMonitoringActive by viewModel.isMonitoringActive.collectAsState()

    val totalCount by viewModel.totalCount.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    val syncedCount by viewModel.syncedCount.collectAsState()
    val failedCount by viewModel.failedCount.collectAsState()

    val latestNotification by viewModel.latestNotification.collectAsState()
    val recentList by viewModel.recentNotifications.collectAsState()

    val currentServerUrl by viewModel.serverUrl.collectAsState()
    val currentApiToken by viewModel.apiToken.collectAsState()
    val connTestResult by viewModel.connectionTest.collectAsState()

    var urlInput by remember(currentServerUrl) { mutableStateOf(currentServerUrl) }
    var tokenInput by remember(currentApiToken) { mutableStateOf(currentApiToken) }

    Scaffold(
        containerColor = Slate950,
        topBar = {
            Surface(color = Slate900, shadowElevation = 4.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "LifeOS Companion",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate200
                        )
                        Text(
                            text = "WhatsApp Ingest • OPPO A74 Ready",
                            fontSize = 12.sp,
                            color = Slate400
                        )
                    }

                    // Status Pill
                    Row(
                        modifier = Modifier
                            .background(
                                if (hasNotificationAccess && isMonitoringActive) Emerald500.copy(alpha = 0.15f)
                                else Red500.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(
                                    if (hasNotificationAccess && isMonitoringActive) Emerald400 else Red500,
                                    shape = CircleShape
                                )
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (!hasNotificationAccess) "Missing Access"
                            else if (isMonitoringActive) "Active"
                            else "Paused",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (hasNotificationAccess && isMonitoringActive) Emerald400 else Red500
                        )
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 1. Notification Access Permission Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (hasNotificationAccess) Icons.Default.CheckCircle else Icons.Default.NotificationsOff,
                                contentDescription = null,
                                tint = if (hasNotificationAccess) Emerald400 else Amber500
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Notification Listener Access",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 16.sp,
                                color = Slate200
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (hasNotificationAccess)
                                "Android system has granted listener access. The app is authorized to intercept WhatsApp notifications."
                            else
                                "Required: Android requires explicit user permission in Special App Access to receive WhatsApp notification broadcasts.",
                            fontSize = 13.sp,
                            color = Slate400
                        )

                        if (!hasNotificationAccess) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = {
                                    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                    context.startActivity(intent)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Emerald500),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Open Android Notification Access Settings")
                            }
                        }
                    }
                }
            }

            // 2. OPPO A74 / ColorOS Background Execution Optimization Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.BatteryAlert,
                                contentDescription = null,
                                tint = if (isBatteryIgnored) Emerald400 else Blue500
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "ColorOS / OPPO A74 Stability",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 16.sp,
                                color = Slate200
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "ColorOS aggressively shuts down background listeners when the screen turns off. Grant Auto-launch & Don't Optimize Battery to keep WhatsApp monitoring 24/7.",
                            fontSize = 13.sp,
                            color = Slate400
                        )

                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    DeviceCompatibilityHelper.requestIgnoreBatteryOptimizations(context)
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Battery Exemption", fontSize = 12.sp)
                            }

                            OutlinedButton(
                                onClick = {
                                    DeviceCompatibilityHelper.openColorOsAutoLaunchSettings(context)
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Auto-launch Settings", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }

            // 3. Monitoring Control Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = if (isMonitoringActive) "Monitoring Active" else "Monitoring Paused",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 16.sp,
                                color = Slate200
                            )
                            Text(
                                text = if (isMonitoringActive) "Listening for com.whatsapp notifications" else "Capturing paused by user",
                                fontSize = 13.sp,
                                color = Slate400
                            )
                        }

                        Switch(
                            checked = isMonitoringActive,
                            onCheckedChange = { viewModel.toggleMonitoring(it) },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Slate950,
                                checkedTrackColor = Emerald500
                            )
                        )
                    }
                }
            }

            // 4. Metrics Grid
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MetricBox(title = "Total Captured", value = totalCount.toString(), color = Slate200, modifier = Modifier.weight(1f))
                    MetricBox(title = "Pending Queue", value = pendingCount.toString(), color = Amber500, modifier = Modifier.weight(1f))
                    MetricBox(title = "Synced to LifeOS", value = syncedCount.toString(), color = Emerald400, modifier = Modifier.weight(1f))
                    MetricBox(title = "Failed / Retry", value = failedCount.toString(), color = if (failedCount > 0) Red500 else Slate400, modifier = Modifier.weight(1f))
                }
            }

            // 5. Last Captured Notification Preview
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Last Captured Notification",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 15.sp,
                                color = Slate200
                            )
                            if (latestNotification != null) {
                                val status = latestNotification!!.syncStatus
                                SyncBadge(status = status)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        if (latestNotification != null) {
                            val notif = latestNotification!!
                            val dateStr = SimpleDateFormat("HH:mm:ss dd/MM", Locale.getDefault()).format(Date(notif.postTime))

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = notif.sender,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Emerald400
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "• $dateStr",
                                    fontSize = 12.sp,
                                    color = Slate400
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = notif.messageText.ifBlank { "[No text or attachment only]" },
                                fontSize = 13.sp,
                                color = Slate200
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Fingerprint: ${notif.deduplicationId.take(16)}...",
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Slate400
                            )
                        } else {
                            Text(
                                text = "No WhatsApp notifications captured yet. Send a test message or wait for incoming WhatsApp messages.",
                                fontSize = 13.sp,
                                color = Slate400
                            )
                        }
                    }
                }
            }

            // 6. LifeOS Server Configuration & Ingest Endpoint Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "LifeOS Backend Connection",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 16.sp,
                            color = Slate200
                        )
                        Text(
                            text = "Configurable endpoint for forward ingestion. No hard-coded keys.",
                            fontSize = 12.sp,
                            color = Slate400
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = urlInput,
                            onValueChange = {
                                urlInput = it
                                viewModel.updateServerUrl(it)
                            },
                            label = { Text("LifeOS Server Base URL") },
                            placeholder = { Text("https://your-lifeos.app or http://10.0.2.2:3000") },
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Emerald500,
                                unfocusedBorderColor = Slate700
                            ),
                            singleLine = true
                        )

                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Destination Endpoint: POST /api/whatsapp/personal-ingest",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Emerald400
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = tokenInput,
                            onValueChange = {
                                tokenInput = it
                                viewModel.updateApiToken(it)
                            },
                            label = { Text("Optional Authorization Token (Bearer)") },
                            placeholder = { Text("e.g. sk_live_your_token") },
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Emerald500,
                                unfocusedBorderColor = Slate700
                            ),
                            singleLine = true
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { viewModel.testConnection() },
                                colors = ButtonDefaults.buttonColors(containerColor = Emerald600),
                                enabled = !connTestResult.inProgress,
                                modifier = Modifier.weight(1f)
                            ) {
                                if (connTestResult.inProgress) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = Slate950,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Test Ping")
                                }
                            }

                            if (failedCount > 0 || pendingCount > 0) {
                                OutlinedButton(
                                    onClick = { viewModel.retryFailedQueue() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Retry Queue")
                                }
                            }
                        }

                        if (connTestResult.message != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = connTestResult.message!!,
                                fontSize = 12.sp,
                                color = if (connTestResult.success == true) Emerald400 else Red500
                            )
                        }
                    }
                }
            }

            // 7. Recent Ingest Activity Feed
            item {
                Text(
                    text = "Recent Ingest Log (${recentList.size})",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    color = Slate200
                )
            }

            items(recentList) { item ->
                NotificationRow(item)
            }
        }
    }
}

@Composable
fun MetricBox(title: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Slate900),
        shape = RoundedCornerShape(8.dp),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = value, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = color)
            Text(text = title, fontSize = 10.sp, color = Slate400, maxLines = 1)
        }
    }
}

@Composable
fun SyncBadge(status: SyncStatus) {
    val (bgColor, textColor, text) = when (status) {
        SyncStatus.SYNCED -> Triple(Emerald500.copy(alpha = 0.2f), Emerald400, "SYNCED")
        SyncStatus.PENDING -> Triple(Amber500.copy(alpha = 0.2f), Amber500, "PENDING")
        SyncStatus.SYNCING -> Triple(Blue500.copy(alpha = 0.2f), Blue500, "SYNCING")
        SyncStatus.FAILED -> Triple(Red500.copy(alpha = 0.2f), Red500, "FAILED")
    }

    Box(
        modifier = Modifier
            .background(bgColor, shape = RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(text = text, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = textColor)
    }
}

@Composable
fun NotificationRow(item: NotificationEntity) {
    val dateStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(item.postTime))
    Card(
        colors = CardDefaults.cardColors(containerColor = Slate900.copy(alpha = 0.7f)),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = item.sender, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Slate200)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = dateStr, fontSize = 11.sp, color = Slate400)
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = item.messageText,
                    fontSize = 12.sp,
                    color = Slate400,
                    maxLines = 1
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            SyncBadge(status = item.syncStatus)
        }
    }
}
