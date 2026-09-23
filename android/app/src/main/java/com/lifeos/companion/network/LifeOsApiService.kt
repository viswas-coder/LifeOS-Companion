package com.lifeos.companion.network

import com.lifeos.companion.model.IngestPayload
import com.lifeos.companion.model.IngestResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * Retrofit interface for LifeOS Ingest API.
 * Endpoint: POST /api/whatsapp/personal-ingest
 */
interface LifeOsApiService {

    @POST("/api/whatsapp/personal-ingest")
    suspend fun ingestNotification(
        @Body payload: IngestPayload,
        @Header("Authorization") authHeader: String? = null
    ): Response<IngestResponse>

    @POST("/api/whatsapp/personal-ingest")
    suspend fun pingIngestEndpoint(
        @Body payload: Map<String, String> = mapOf("ping" to "true", "eventType" to "ping"),
        @Header("Authorization") authHeader: String? = null
    ): Response<IngestResponse>
}
