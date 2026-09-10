package eu.kanade.tachiyomi.extension.all.r2merge.net

import eu.kanade.tachiyomi.extension.all.r2merge.refererForImage
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * TachiManga loads `thumbnail_url` through the source client but skips
 * [eu.kanade.tachiyomi.source.online.HttpSource.imageRequest], so gallery CDNs
 * (HentaiRead, etc.) see no Referer and throw Cloudflare. Wrap those covers in
 * a reserved host so our interceptors add Referer and CF can solve on the real URL.
 */
object CoverImageInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.url.host.equals(HOST, ignoreCase = true)) {
            return chain.proceed(request)
        }
        val target = request.url.queryParameter(PARAM_URL)?.toHttpUrlOrNull()
            ?: throw IOException("Malformed cover url: ${request.url}")
        return chain.proceed(request.newBuilder().url(target).build())
    }

    const val HOST = "cover.r2library.invalid"

    fun wrap(imageUrl: String): String {
        val parsed = imageUrl.toHttpUrlOrNull()
            ?: throw IOException("Cover is not a valid address: $imageUrl")
        return HttpUrl.Builder()
            .scheme("https")
            .host(HOST)
            .addPathSegment("img")
            .addQueryParameter(PARAM_URL, parsed.toString())
            .build()
            .toString()
    }

    fun wrapIfNeeded(imageUrl: String): String {
        val host = imageUrl.toHttpUrlOrNull()?.host ?: return imageUrl
        if (host.equals(HOST, ignoreCase = true) ||
            host.equals(ArchiveInterceptor.HOST, ignoreCase = true)
        ) {
            return imageUrl
        }
        return if (refererForImage(imageUrl) != null) wrap(imageUrl) else imageUrl
    }

    private const val PARAM_URL = "u"
}
