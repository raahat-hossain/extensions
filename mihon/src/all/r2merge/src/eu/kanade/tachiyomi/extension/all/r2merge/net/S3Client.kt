package eu.kanade.tachiyomi.extension.all.r2merge.net

import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.parser.Parser
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class S3Object(val key: String, val size: Long, val lastModified: Long)

data class S3Listing(
    /** Sub-"folders", only populated when a delimiter was requested. */
    val prefixes: List<String>,
    val objects: List<S3Object>,
    val nextToken: String?,
) {
    val truncated: Boolean get() = nextToken != null
}

/** Minimal S3 `ListObjectsV2` client, enough to walk a bucket as a file tree. */
class S3Client(private val client: OkHttpClient) {

    fun list(
        config: R2Config,
        prefix: String,
        delimiter: String?,
        continuationToken: String? = null,
        maxKeys: Int = 1000,
    ): S3Listing {
        val builder = config.bucketUrl().newBuilder()
            .addEncodedQueryParameter("list-type", "2")
            .addEncodedQueryParameter("max-keys", maxKeys.toString())

        if (prefix.isNotEmpty()) {
            builder.addEncodedQueryParameter("prefix", awsUriEncode(prefix, encodeSlash = true))
        }
        if (delimiter != null) {
            builder.addEncodedQueryParameter("delimiter", awsUriEncode(delimiter, encodeSlash = true))
        }
        if (continuationToken != null) {
            builder.addEncodedQueryParameter(
                "continuation-token",
                awsUriEncode(continuationToken, encodeSlash = true),
            )
        }

        val request = Request.Builder()
            .url(builder.build())
            .cacheControl(CacheControl.FORCE_NETWORK)
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body!!.string()
            if (!response.isSuccessful) throw IOException(describeError(response.code, body))
            return parse(body)
        }
    }

    /**
     * Follows continuation tokens until the listing is exhausted or [maxPages]
     * requests have been made, merging the results.
     */
    fun listAll(
        config: R2Config,
        prefix: String,
        delimiter: String?,
        maxPages: Int = 50,
    ): S3Listing {
        val prefixes = mutableListOf<String>()
        val objects = mutableListOf<S3Object>()
        var token: String? = null
        var pages = 0

        do {
            val page = list(config, prefix, delimiter, token)
            prefixes += page.prefixes
            objects += page.objects
            token = page.nextToken
            pages++
        } while (token != null && pages < maxPages)

        return S3Listing(prefixes, objects, token)
    }

    private fun parse(xml: String): S3Listing {
        val document = Jsoup.parse(xml, "", Parser.xmlParser())

        val objects = document.getElementsByTag("Contents").map {
            S3Object(
                key = it.rawText("Key"),
                size = it.rawText("Size").toLongOrNull() ?: 0L,
                lastModified = parseIso8601(it.rawText("LastModified")),
            )
        }
        val prefixes = document.getElementsByTag("CommonPrefixes")
            .map { it.rawText("Prefix") }
            .filter { it.isNotEmpty() }

        val truncated = document.getElementsByTag("IsTruncated")
            .firstOrNull()?.text()?.trim().toBoolean()
        val nextToken = document.getElementsByTag("NextContinuationToken")
            .firstOrNull()?.rawText()?.takeIf { it.isNotEmpty() }

        return S3Listing(prefixes, objects, if (truncated) nextToken else null)
    }

    private fun describeError(code: Int, body: String): String {
        val message = runCatching {
            val doc = Jsoup.parse(body, "", Parser.xmlParser())
            val awsCode = doc.getElementsByTag("Code").firstOrNull()?.text().orEmpty()
            val awsMessage = doc.getElementsByTag("Message").firstOrNull()?.text().orEmpty()
            listOf(awsCode, awsMessage).filter { it.isNotEmpty() }.joinToString(": ")
        }.getOrNull().orEmpty()

        val hint = when (code) {
            400 -> "Check the bucket name and account id / endpoint."
            401, 403 ->
                "Check the access key id and secret access key, and that the R2 API token " +
                    "has read access to this bucket."
            404 -> "Bucket not found — check the bucket name."
            else -> ""
        }
        return listOf("R2 request failed (HTTP $code)", message, hint)
            .filter { it.isNotEmpty() }
            .joinToString(" — ")
    }

    private companion object {
        /**
         * `text()` collapses runs of whitespace, which would silently corrupt
         * keys containing double spaces, so leaf values are read raw.
         */
        fun Element.rawText(tag: String): String = getElementsByTag(tag).firstOrNull()?.wholeText().orEmpty()

        fun Element.rawText(): String = wholeText()

        val iso8601WithMillis = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        }

        val iso8601 = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        }

        fun parseIso8601(value: String): Long {
            if (value.isEmpty()) return 0L
            val format = if (value.contains('.')) iso8601WithMillis else iso8601
            return runCatching { format.get()!!.parse(value)?.time ?: 0L }.getOrDefault(0L)
        }
    }
}
