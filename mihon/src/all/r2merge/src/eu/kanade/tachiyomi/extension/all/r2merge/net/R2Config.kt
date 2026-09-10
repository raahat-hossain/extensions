package eu.kanade.tachiyomi.extension.all.r2merge.net

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Everything the source needs to talk to one R2 bucket. Built fresh from the
 * source preferences on each use so settings changes take effect immediately.
 */
data class R2Config(
    val endpoint: HttpUrl,
    val bucket: String,
    val accessKeyId: String,
    val secretAccessKey: String,
    val region: String,
    /** Optional folder inside the bucket that holds the library, `""` or `foo/`. */
    val rootPrefix: String,
    /** Optional r2.dev / custom-domain origin used to serve images unsigned. */
    val publicBaseUrl: HttpUrl?,
) {
    /** `https://<account>.r2.cloudflarestorage.com/<bucket>` */
    fun bucketUrl(): HttpUrl = endpoint.newBuilder()
        .addEncodedPathSegment(awsUriEncode(bucket, encodeSlash = true))
        .build()

    /** Signed S3 URL for an object key. */
    fun objectUrl(key: String): HttpUrl {
        val builder = bucketUrl().newBuilder()
        key.split('/').filter { it.isNotEmpty() }.forEach {
            builder.addEncodedPathSegment(awsUriEncode(it, encodeSlash = true))
        }
        return builder.build()
    }

    /**
     * Public (unsigned) URL for a key, when a public bucket origin is set.
     * Cloudflare serves these straight from cache, so they are both faster and
     * cheaper than signed requests.
     */
    fun publicUrl(key: String): HttpUrl? {
        val base = publicBaseUrl ?: return null
        val builder = base.newBuilder()
        key.split('/').filter { it.isNotEmpty() }.forEach {
            builder.addEncodedPathSegment(awsUriEncode(it, encodeSlash = true))
        }
        return builder.build()
    }

    /** The URL an image should be fetched from: public origin when set, signed S3 otherwise. */
    fun imageUrl(key: String): HttpUrl = publicUrl(key) ?: objectUrl(key)

    companion object {
        /**
         * Accepts either a bare Cloudflare account id or a full endpoint URL,
         * so users can paste whichever the dashboard gave them.
         */
        fun parseEndpoint(raw: String): HttpUrl? {
            val value = raw.trim().trimEnd('/')
            if (value.isEmpty()) return null
            if (!value.contains('.') && !value.contains('/')) {
                return "https://$value.r2.cloudflarestorage.com".toHttpUrlOrNull()
            }
            val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) {
                value
            } else {
                "https://$value"
            }
            return withScheme.toHttpUrlOrNull()
        }

        fun parsePublicBase(raw: String): HttpUrl? {
            val value = raw.trim().trimEnd('/')
            if (value.isEmpty()) return null
            val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) {
                value
            } else {
                "https://$value"
            }
            return withScheme.toHttpUrlOrNull()
        }

        /** Normalises a user-typed folder into `""` or `some/folder/`. */
        fun normalizePrefix(raw: String): String {
            val value = raw.trim().trim('/')
            return if (value.isEmpty()) "" else "$value/"
        }
    }
}

private const val UNRESERVED =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

private val HEX = "0123456789ABCDEF".toCharArray()

/**
 * Percent-encoding exactly as AWS SigV4 defines it. OkHttp leaves characters
 * such as `(`, `!` and `+` untouched in paths and query values, which would
 * make the canonical request disagree with what R2 receives and fail signing —
 * so keys are encoded here and handed to OkHttp pre-encoded.
 */
fun awsUriEncode(value: String, encodeSlash: Boolean): String {
    val out = StringBuilder(value.length + 16)
    for (byte in value.toByteArray(Charsets.UTF_8)) {
        val int = byte.toInt() and 0xFF
        val char = int.toChar()
        when {
            char == '/' && !encodeSlash -> out.append('/')
            UNRESERVED.indexOf(char) >= 0 && int < 0x80 -> out.append(char)
            else -> {
                out.append('%')
                out.append(HEX[int ushr 4])
                out.append(HEX[int and 0x0F])
            }
        }
    }
    return out.toString()
}
