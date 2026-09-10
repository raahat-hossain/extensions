package eu.kanade.tachiyomi.extension.all.r2merge.net

import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Signs requests aimed at the configured R2 endpoint with AWS Signature V4.
 *
 * Only requests to that exact host are touched; image requests served from a
 * public r2.dev origin, and the synthetic archive URLs, pass straight through.
 */
class SigV4Interceptor(private val configProvider: () -> R2Config?) : Interceptor {

    /**
     * Difference between the device clock and R2's, learned from a rejected
     * request. SigV4 refuses signatures more than 15 minutes out of date, and a
     * phone with a drifting clock would otherwise fail every single request.
     */
    @Volatile
    private var clockSkewMs: Long = 0L

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val config = configProvider() ?: return chain.proceed(request)
        // Credentials go to the configured endpoint and nowhere else: chapters
        // may point at archives on hosts that have no business seeing them.
        val isEndpoint = request.url.host.equals(config.endpoint.host, ignoreCase = true) &&
            request.url.port == config.endpoint.port
        if (!isEndpoint) return chain.proceed(request)

        val response = chain.proceed(sign(request, config, now()))
        if (response.code != 403) return response

        // Retry once against the server's own clock before giving up.
        val body = runCatching { response.peekBody(4096L).string() }.getOrNull().orEmpty()
        if (!body.contains("RequestTimeTooSkewed")) return response
        val serverTime = response.headers.getDate("Date") ?: return response

        clockSkewMs = serverTime.time - System.currentTimeMillis()
        response.close()
        return chain.proceed(sign(request, config, now()))
    }

    private fun now(): Long = System.currentTimeMillis() + clockSkewMs

    /** Visible for tests, which pin the timestamp to check against known vectors. */
    internal fun sign(request: Request, config: R2Config, timeMillis: Long): Request {
        val timestamp = Date(timeMillis)
        val amzDate = amzDateFormat.get()!!.format(timestamp)
        val dateStamp = amzDate.substring(0, 8)

        // Every request this extension makes is a bodyless GET.
        val payloadHash = EMPTY_PAYLOAD_SHA256

        val defaultPort = if (request.url.scheme == "https") 443 else 80
        val host = if (request.url.port == defaultPort) {
            request.url.host
        } else {
            "${request.url.host}:${request.url.port}"
        }

        val canonicalHeaders = buildString {
            append("host:").append(host).append('\n')
            append("x-amz-content-sha256:").append(payloadHash).append('\n')
            append("x-amz-date:").append(amzDate).append('\n')
        }
        val signedHeaders = "host;x-amz-content-sha256;x-amz-date"

        val canonicalRequest = buildString {
            append(request.method).append('\n')
            // Safe to use verbatim: every URL is assembled from awsUriEncode output.
            append(request.url.encodedPath).append('\n')
            append(canonicalQuery(request)).append('\n')
            append(canonicalHeaders).append('\n')
            append(signedHeaders).append('\n')
            append(payloadHash)
        }

        val scope = "$dateStamp/${config.region}/$SERVICE/aws4_request"
        val stringToSign = buildString {
            append(ALGORITHM).append('\n')
            append(amzDate).append('\n')
            append(scope).append('\n')
            append(sha256Hex(canonicalRequest.toByteArray(Charsets.UTF_8)))
        }

        val signingKey = signingKey(config.secretAccessKey, dateStamp, config.region)
        val signature = hex(hmacSha256(signingKey, stringToSign.toByteArray(Charsets.UTF_8)))

        val authorization = "$ALGORITHM Credential=${config.accessKeyId}/$scope, " +
            "SignedHeaders=$signedHeaders, Signature=$signature"

        return request.newBuilder()
            .header("x-amz-date", amzDate)
            .header("x-amz-content-sha256", payloadHash)
            .header("Authorization", authorization)
            .build()
    }

    /** Query parameters sorted by name then value, as the canonical form requires. */
    private fun canonicalQuery(request: Request): String {
        val query = request.url.encodedQuery
        if (query.isNullOrEmpty()) return ""
        return query.split('&')
            .map {
                val index = it.indexOf('=')
                if (index < 0) it to "" else it.substring(0, index) to it.substring(index + 1)
            }
            .sortedWith(compareBy({ it.first }, { it.second }))
            .joinToString("&") { "${it.first}=${it.second}" }
    }

    private fun signingKey(secret: String, dateStamp: String, region: String): ByteArray {
        val date = hmacSha256("AWS4$secret".toByteArray(Charsets.UTF_8), dateStamp.toByteArray(Charsets.UTF_8))
        val regionKey = hmacSha256(date, region.toByteArray(Charsets.UTF_8))
        val service = hmacSha256(regionKey, SERVICE.toByteArray(Charsets.UTF_8))
        return hmacSha256(service, "aws4_request".toByteArray(Charsets.UTF_8))
    }

    private companion object {
        const val ALGORITHM = "AWS4-HMAC-SHA256"
        const val SERVICE = "s3"
        const val EMPTY_PAYLOAD_SHA256 =
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        val amzDateFormat = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        }

        fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray = Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(key, "HmacSHA256"))
            doFinal(data)
        }

        fun sha256Hex(data: ByteArray): String = hex(MessageDigest.getInstance("SHA-256").digest(data))

        fun hex(bytes: ByteArray): String {
            val out = StringBuilder(bytes.size * 2)
            for (byte in bytes) {
                val int = byte.toInt() and 0xFF
                out.append("0123456789abcdef"[int ushr 4])
                out.append("0123456789abcdef"[int and 0x0F])
            }
            return out.toString()
        }
    }
}
