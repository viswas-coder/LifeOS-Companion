package com.lifeos.companion

import com.lifeos.companion.util.NotificationDeduplicator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationDeduplicatorTest {

    @Test
    fun testGenerateFingerprint_identicalContent_yieldsIdenticalHash() {
        val hash1 = NotificationDeduplicator.generateFingerprint(
            packageName = "com.whatsapp",
            sender = "Alice Smith",
            message = "Meeting at 3pm today",
            conversationTitle = null,
            subText = null
        )

        val hash2 = NotificationDeduplicator.generateFingerprint(
            packageName = "com.whatsapp",
            sender = "Alice Smith",
            message = "Meeting at 3pm today",
            conversationTitle = null,
            subText = null
        )

        assertEquals(hash1, hash2)
    }

    @Test
    fun testGenerateFingerprint_differentMessages_yieldsDifferentHash() {
        val hash1 = NotificationDeduplicator.generateFingerprint(
            packageName = "com.whatsapp",
            sender = "Alice Smith",
            message = "Message 1",
            conversationTitle = null,
            subText = null
        )

        val hash2 = NotificationDeduplicator.generateFingerprint(
            packageName = "com.whatsapp",
            sender = "Alice Smith",
            message = "Message 2",
            conversationTitle = null,
            subText = null
        )

        assertNotEquals(hash1, hash2)
    }

    @Test
    fun testIsSystemOrNonContentNotification_filtersKnownWhatsAppSystemAlerts() {
        assertTrue(NotificationDeduplicator.isSystemOrNonContentNotification("WhatsApp", "Checking for new messages"))
        assertTrue(NotificationDeduplicator.isSystemOrNonContentNotification("WhatsApp", "Backup in progress"))
        assertTrue(NotificationDeduplicator.isSystemOrNonContentNotification("WhatsApp Web", "WhatsApp Web is currently active"))
        assertTrue(NotificationDeduplicator.isSystemOrNonContentNotification(null, null))

        // Legitimate personal messages must not be filtered
        assertFalse(NotificationDeduplicator.isSystemOrNonContentNotification("John Doe", "Hey, are you free tomorrow?"))
        assertFalse(NotificationDeduplicator.isSystemOrNonContentNotification("Family Group", "Dinner is ready!"))
    }
}
