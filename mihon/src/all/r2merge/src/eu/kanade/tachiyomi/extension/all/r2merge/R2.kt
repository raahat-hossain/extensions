package eu.kanade.tachiyomi.extension.all.r2merge

import java.net.URLEncoder
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal class R2Config(
    val accountId: String,
    val accessKeyId: String,
    val secretAccessKey: String,
    val bucket: String,
    val endpoint: String,
    val prefix: String,
)

private fun rfc3986(value: String): String = URLEncoder.encode(value, "UTF-8")
    .replace("+", "%20")
    .replace("*", "%2A")
    .replace("%7E", "~")
    .replace("!", "%21")
    .replace("'", "%27")
    .replace("(", "%28")
    .replace(")", "%29")

private fun encodePath(path: String): String = path.split("/").joinToString("/") { segment ->
    if (segment.isEmpty()) "" else rfc3986(segment)
}

private fun sha256Hex(data: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }

private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(key, "HmacSHA256"))
    return mac.doFinal(data)
}

private fun hmacSha256Hex(key: ByteArray, data: String): String = hmacSha256(key, data.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

private fun signingKey(secret: String, stamp: String, region: String, service: String): ByteArray {
    val kDate = hmacSha256("AWS4$secret".toByteArray(Charsets.UTF_8), stamp.toByteArray())
    val kRegion = hmacSha256(kDate, region.toByteArray())
    val kService = hmacSha256(kRegion, service.toByteArray())
    return hmacSha256(kService, "aws4_request".toByteArray())
}

internal fun presignGet(
    config: R2Config,
    key: String? = null,
    query: Map<String, String> = emptyMap(),
    expiresSeconds: Int = 900,
): String {
    val region = "auto"
    val service = "s3"
    val dateFormat = SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    val amz = dateFormat.format(Date())
    val stamp = amz.substring(0, 8)
    val payloadHash = "UNSIGNED-PAYLOAD"

    val origin = config.endpoint.trimEnd('/')
    val host = origin.substringAfter("://")
    val keyPath = key?.let { "/${it.trimStart('/')}" } ?: ""
    val canonicalUri = encodePath("/${config.bucket}$keyPath")

    val queryParams = linkedMapOf(
        "X-Amz-Algorithm" to "AWS4-HMAC-SHA256",
        "X-Amz-Credential" to "${config.accessKeyId}/$stamp/$region/$service/aws4_request",
        "X-Amz-Date" to amz,
        "X-Amz-Expires" to expiresSeconds.toString(),
        "X-Amz-SignedHeaders" to "host",
    )
    queryParams.putAll(query)

    val signedHeaders = "host"
    val canonicalHeaders = "host:$host\n"
    val canonicalQuery = queryParams.keys.sorted().joinToString("&") { k ->
        "${rfc3986(k)}=${rfc3986(queryParams[k] ?: "")}"
    }

    val canonicalRequest = listOf(
        "GET",
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ).joinToString("\n")

    val stringToSign = listOf(
        "AWS4-HMAC-SHA256",
        amz,
        "$stamp/$region/$service/aws4_request",
        sha256Hex(canonicalRequest.toByteArray(Charsets.UTF_8)),
    ).joinToString("\n")

    val signature = hmacSha256Hex(
        signingKey(config.secretAccessKey, stamp, region, service),
        stringToSign,
    )

    val finalQuery = canonicalQuery + "&" + rfc3986("X-Amz-Signature") + "=" + rfc3986(signature)
    return "$origin$canonicalUri?$finalQuery"
}

internal fun rootPrefix(prefix: String): String {
    val value = prefix.trim().trim('/')
    return if (value.isEmpty()) "" else "$value/"
}
