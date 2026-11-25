package com.bspsms.android

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.random.Random

enum class AuthTab {
    REGISTER,
    GENERAL_LOGIN,
    ADMIN_LOGIN
}

data class UserRecord(
    val userId: String,
    val phone: String,
    val fullName: String = "",
    val username: String = "",
    val role: String = "general",
    val status: String,
    val expiryDate: String,
    val activeDeviceId: String,
    val lastLogin: String,
    val lastActivity: String = "",
    val createdAt: String = "",
    val appLoggedIn: Boolean = false,
    val portalSessionActive: Boolean = false,
    val portalResetVersion: Int = 0,
    val portalLastUpdated: String = "",
    val hasStatusField: Boolean = true,
    val hasExpiryField: Boolean = true,
    val hasAppLoggedInField: Boolean = false
) {
    val isActive: Boolean
        get() = status.trim().lowercase() in setOf("active", "success", "ok")

    val isExpired: Boolean
        get() = isExpiryDatePassed(expiryDate)

    val displayName: String
        get() = fullName.ifBlank { username.ifBlank { userId.ifBlank { phone } } }
}

data class AdminStats(
    val totalGeneralUsers: Int = 0,
    val activeUsers: Int = 0,
    val inactiveUsers: Int = 0,
    val expiredUsers: Int = 0,
    val loggedInAppUsers: Int = 0,
    val activePortalUsers: Int = 0
)

data class AuthSession(
    val isAdmin: Boolean,
    val userId: String,
    val phone: String,
    val expiryDate: String,
    val deviceId: String,
    val sessionToken: String = "",
    val fullName: String = "",
    val username: String = "",
    val role: String = if (isAdmin) "admin" else "general"
) {
    val portalOwnerKey: String
        get() = if (isAdmin) "admin:${userId.trim()}" else "user:${userId.trim().uppercase()}"

    val portalProfileName: String
        get() {
            val safeId = userId.trim().replace(Regex("[^A-Za-z0-9_]"), "_")
            return if (isAdmin) "bsp_admin_$safeId" else "bsp_user_$safeId"
        }
}

data class AuthResponse(
    val ok: Boolean,
    val code: String,
    val message: String,
    val sessionToken: String = "",
    val user: UserRecord? = null,
    val users: List<UserRecord> = emptyList(),
    val stats: AdminStats? = null
)

fun normalizeUserId(raw: String): String {
    return raw.trim().uppercase()
}

fun normalizePhoneNumber(raw: String): String {
    val digits = raw.filter { it.isDigit() }
    if (digits.length > 10) {
        if (digits.startsWith("91") && digits.length >= 12) {
            return digits.takeLast(10)
        }
        if (digits.startsWith("0") && digits.length == 11) {
            return digits.drop(1)
        }
        return digits.takeLast(10)
    }
    return digits
}

fun normalizeLoginIdentifier(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return ""
    val hasLettersOrSymbols = trimmed.any { it.isLetter() || it == '_' || it == '.' || it == '@' || it == '-' }
    return if (!hasLettersOrSymbols) {
        val phone = normalizePhoneNumber(trimmed)
        if (phone.length >= 10) phone else trimmed
    } else {
        trimmed
    }
}

fun normalizePassword(raw: String): String {
    return raw.trim()
}

fun normalizeExpiryDateString(expiryDate: String): String {
    val trimmed = expiryDate.trim()
    if (trimmed.isEmpty()) return ""
    if (trimmed.endsWith("Z", ignoreCase = true) && trimmed.contains("T")) {
        runCatching {
            return Instant.parse(trimmed)
                .atZone(ZoneId.of("Asia/Kolkata"))
                .toLocalDate()
                .toString()
        }
    }
    val dateToken = trimmed.substringBefore("T").substringBefore(" ").trim()
    val normalized = dateToken.replace("/", "-")
    val parsed = try {
        when {
            Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(normalized) -> LocalDate.parse(normalized)
            Regex("^\\d{2}-\\d{2}-\\d{4}$").matches(normalized) -> {
                val parts = normalized.split("-")
                LocalDate.of(parts[2].toInt(), parts[1].toInt(), parts[0].toInt())
            }
            normalized.length >= 10 && Regex("^\\d{4}-\\d{2}-\\d{2}.*").matches(normalized) -> {
                LocalDate.parse(normalized.take(10))
            }
            else -> null
        }
    } catch (_: Exception) {
        null
    }
    return parsed?.toString() ?: trimmed
}

fun isExpiryDatePassed(expiryDate: String): Boolean {
    val normalized = normalizeExpiryDateString(expiryDate)
    if (normalized.isEmpty()) return true
    val expiry = try {
        when {
            Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(normalized) -> LocalDate.parse(normalized)
            normalized.length >= 10 && Regex("^\\d{4}-\\d{2}-\\d{2}.*").matches(normalized) -> {
                LocalDate.parse(normalized.take(10))
            }
            else -> return true
        }
    } catch (_: Exception) {
        return true
    }
    return LocalDate.now(ZoneId.of("Asia/Kolkata")).isAfter(expiry)
}

fun generateNewUserId(): String {
    val num = Random.nextInt(100000, 999999)
    return "PB$num"
}

@SuppressLint("HardwareIds")
fun resolveStableDeviceId(context: Context): String {
    val androidId = try {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    } catch (_: Exception) {
        null
    }
    if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
        return androidId
    }
    val prefs = context.applicationContext.getSharedPreferences("bsp_sms_auth_prefs", Context.MODE_PRIVATE)
    val saved = prefs.getString("fallback_device_uuid", null)
    if (!saved.isNullOrBlank()) return saved
    val generated = UUID.randomUUID().toString()
    prefs.edit().putString("fallback_device_uuid", generated).apply()
    return generated
}
