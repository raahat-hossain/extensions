package eu.kanade.tachiyomi.extension.all.r2merge.net

import eu.kanade.tachiyomi.extension.all.r2merge.util.fileName
import eu.kanade.tachiyomi.extension.all.r2merge.util.mediaTypeForName
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException

/** Keeps recently opened archives around so their directory is parsed once. */
class ArchiveCache(
    private val client: OkHttpClient,
    private val configProvider: () -> R2Config?,
) {
    private val cache = object : LinkedHashMap<String, RemoteZip>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, RemoteZip>) = size > MAX_OPEN_ARCHIVES
    }

    /**
     * [target] is either an object key in the bucket, or an absolute URL for an
     * archive hosted anywhere else.
     */
    fun zipFor(target: String): RemoteZip {
        val url = if (isAbsoluteUrl(target)) {
            target.toHttpUrlOrNull()
                ?: throw IOException("Chapter url is not a valid address: $target")
        } else {
            val config = configProvider()
                ?: throw IOException("R2 is not configured — open the source settings first.")
            config.imageUrl(target)
        }
        synchronized(cache) {
            return cache.getOrPut(url.toString()) { RemoteZip(client, url) }
        }
    }

    fun clear() = synchronized(cache) { cache.clear() }

    private companion object {
        const val MAX_OPEN_ARCHIVES = 4
    }
}

/** Chapters may be bucket keys or addresses on any other host. */
fun isAbsoluteUrl(value: String): Boolean = value.startsWith("http://", ignoreCase = true) ||
    value.startsWith("https://", ignoreCase = true)

/**
 * The reader asks for pages by URL, but a page inside a CBZ has no URL of its
 * own. Page URLs are therefore minted against a reserved host and answered here
 * from the archive, entirely inside the HTTP client — so image caching,
 * downloads and retries keep working exactly as they do for loose files.
 */
class ArchiveInterceptor(private val archives: ArchiveCache) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.url.host.equals(HOST, ignoreCase = true)) {
            return chain.proceed(request)
        }

        val key = request.url.queryParameter(PARAM_KEY)
        val entryName = request.url.queryParameter(PARAM_ENTRY)
        if (key.isNullOrEmpty() || entryName.isNullOrEmpty()) {
            throw IOException("Malformed archive page url: ${request.url}")
        }

        val zip = archives.zipFor(key)
        val entry = zip.entries().firstOrNull { it.name == entryName }
            ?: throw IOException("Page \"$entryName\" is no longer inside ${key.fileName()}.")

        val bytes = zip.read(entry)
        val contentType = mediaTypeForName(entryName)

        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(200)
            .message("OK")
            .header("Content-Type", contentType)
            .header("Content-Length", bytes.size.toString())
            .body(bytes.toResponseBody(contentType.toMediaTypeOrNull()))
            .build()
    }

    companion object {
        /** Reserved TLD (RFC 2606) — these URLs are never resolved or sent anywhere. */
        const val HOST = "archive.r2library.invalid"
        private const val PARAM_KEY = "k"
        private const val PARAM_ENTRY = "e"

        fun pageUrl(archiveKey: String, entryName: String): String = HttpUrl.Builder()
            .scheme("https")
            .host(HOST)
            .addPathSegment("page")
            .addQueryParameter(PARAM_KEY, archiveKey)
            .addQueryParameter(PARAM_ENTRY, entryName)
            .build()
            .toString()
    }
}
