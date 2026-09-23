package com.lifeos.companion.model

import com.google.gson.annotations.SerializedName

/**
 * Payload sent to LifeOS backend ingest endpoint:
 * POST /api/whatsapp/personal-ingest
 *
 * NOTE: The companion app NEVER creates tasks directly.
 * It forwards verified raw notification ingest events for server-side triage.
 */
data class IngestPayload(
    @SerializedName("eventType")
    val eventType: String = "whatsapp_notification",

    @SerializedName("deduplicationId")
    val deduplicationId: String,

    @SerializedName("sourceApp")
    val sourceApp: String = "WhatsApp",

    @SerializedName("packageName")
    val packageName: String,

    @SerializedName("sender")
    val sender: String,

    @SerializedName("message")
    val message: String,

    @SerializedName("timestamp")
    val timestamp: Long,

    @SerializedName("conversationTitle")
    val conversationTitle: String? = null,

    @SerializedName("subText")
    val subText: String? = null,

    @SerializedName("isGroupChat")
    val isGroupChat: Boolean = false,

    @SerializedName("deviceModel")
    val deviceModel: String = android.os.Build.MODEL ?: "Android Device",

    @SerializedName("capturedAt")
    val capturedAt: Long = System.currentTimeMillis()
)

data class IngestResponse(
    @SerializedName("success")
    val success: Boolean,

    @SerializedName("message")
    val message: String? = null,

    @SerializedName("ingestId")
    val ingestId: String? = null,

    @SerializedName("status")
    val status: String? = null
)
