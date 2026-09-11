package eu.kanade.tachiyomi.extension.all.r2merge

import eu.kanade.tachiyomi.extension.all.r2merge.util.chapterNumberOf
import eu.kanade.tachiyomi.extension.all.r2merge.util.overlayChapterNumber
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.source.model.Page
import okhttp3.FormBody
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup
import java.io.IOException

internal const val NOVELCROW_BASE = "https://novelcrow.com"

private val SERIES_PATH = Regex(
    """^https?://(?:www\.)?novelcrow\.com/(comic|manga)/([^/?#]+)/?$""",
    RegexOption.IGNORE_CASE,
)

internal fun isNovelCrowSeriesUrl(url: String): Boolean = SERIES_PATH.containsMatchIn(url.trim())

internal fun isRemoteSeriesUrl(url: String): Boolean = isNovelCrowSeriesUrl(url)

internal fun parseMadaraChapterList(html: String, baseUrl: String): List<ParsedChapter> {
    val document = Jsoup.parse(html, baseUrl)
    return document.select("li.wp-manga-chapter a, .wp-manga-chapter > a")
        .mapNotNull { link ->
            val href = link.absUrl("href").ifBlank { link.attr("href") }.trim()
            if (href.isBlank() || isNovelCrowSeriesUrl(href)) return@mapNotNull null
            val title = link.ownText().ifBlank { link.text() }.trim()
            if (title.isBlank()) return@mapNotNull null
            val number = overlayChapterNumber(title)
                ?: chapterNumberOf(title).takeIf { it >= 0f }
                ?: chapterNumberOf(href).takeIf { it >= 0f }
                ?: 0f
            ParsedChapter(
                title = title,
                number = number,
                url = href.substringBefore('?').trimEnd('/') + "/",
                scanlator = "NovelCrow",
                explicitNumber = number > 0f,
            )
        }
        .distinctBy { it.url }
}

internal fun parseMadaraPages(html: String, pageUrl: String): List<Page> {
    val document = Jsoup.parse(html, pageUrl)
    val fromBreaks = document.select("div.page-break img, li.blocks-gallery-item img")
        .mapNotNull { madaraImageUrl(it) }
    val urls = fromBreaks.ifEmpty {
        document.select("div.reading-content img, img.wp-manga-chapter-img")
            .mapNotNull { madaraImageUrl(it) }
    }.ifEmpty {
        Regex("""chapter_preloaded_images\s*=\s*(\[[^\]]+\])""")
            .find(html)
            ?.groupValues
            ?.get(1)
            ?.let { blob ->
                Regex("""https?:\\?/\\?/[^"'\\s]+""").findAll(blob).map { match ->
                    match.value.replace("\\/", "/")
                }.toList()
            }
            .orEmpty()
    }.filter { url ->
        val skip = Regex("avatar|logo|icon|ads|banner|emoji|spinner|loading", RegexOption.IGNORE_CASE)
        val keep = Regex("wp-content/uploads|manga|chapter|comic|/wp-content/", RegexOption.IGNORE_CASE)
        keep.containsMatchIn(url) || !skip.containsMatchIn(url)
    }.distinct()
    if (urls.isEmpty()) {
        throw IOException("NovelCrow: no pages at $pageUrl")
    }
    return urls.mapIndexed { index, url -> Page(index, url = pageUrl, imageUrl = url) }
}

internal fun fetchNovelCrowChapters(
    client: OkHttpClient,
    headers: Headers,
    seriesUrl: String,
): List<ParsedChapter> {
    val series = seriesUrl.trim().substringBefore('#').substringBefore('?').trimEnd('/') + "/"
    val pageHeaders = headers.newBuilder()
        .set("Referer", "$NOVELCROW_BASE/")
        .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .build()
    var html = fetchHttp(client, GET(series, pageHeaders))
    var chapters = parseMadaraChapterList(html, series)
    if (chapters.isEmpty()) {
        val ajaxHeaders = pageHeaders.newBuilder()
            .set("X-Requested-With", "XMLHttpRequest")
            .set("Referer", series)
            .build()
        val ajaxUrls = listOf("${series}ajax/chapters/", "${series}ajax/chapters")
        for (ajaxUrl in ajaxUrls) {
            html = runCatching {
                fetchHttp(
                    client,
                    Request.Builder()
                        .url(ajaxUrl)
                        .headers(ajaxHeaders)
                        .post(ByteArray(0).toRequestBody(null))
                        .build(),
                )
            }.getOrNull() ?: continue
            chapters = parseMadaraChapterList(html, series)
            if (chapters.isNotEmpty()) break
        }
    }
    if (chapters.isEmpty()) {
        val postId = Regex(
            """id=["']manga-chapters-holder["'][^>]*data-id=["'](\d+)["']""",
            RegexOption.IGNORE_CASE,
        ).find(html)?.groupValues?.get(1)
            ?: Regex(
                """data-id=["'](\d+)["'][^>]*id=["']manga-chapters-holder""",
                RegexOption.IGNORE_CASE,
            ).find(html)?.groupValues?.get(1)
        if (!postId.isNullOrBlank()) {
            val form = FormBody.Builder()
                .add("action", "manga_get_chapters")
                .add("manga", postId)
                .build()
            html = fetchHttp(
                client,
                Request.Builder()
                    .url("$NOVELCROW_BASE/wp-admin/admin-ajax.php")
                    .headers(
                        pageHeaders.newBuilder()
                            .set("X-Requested-With", "XMLHttpRequest")
                            .set("Referer", series)
                            .build(),
                    )
                    .post(form)
                    .build(),
            )
            chapters = parseMadaraChapterList(html, series)
        }
    }
    if (chapters.isEmpty()) {
        throw IOException(
            "No NovelCrow chapters at $series — open a NovelCrow page to pass Cloudflare, then refresh.",
        )
    }
    return chapters.sortedWith(compareBy { it.number })
}

private fun madaraImageUrl(element: org.jsoup.nodes.Element): String? {
    val url = listOf("data-src", "data-lazy-src", "data-cfsrc", "src")
        .firstNotNullOfOrNull { attr ->
            element.absUrl(attr).ifBlank { element.attr(attr) }.takeIf { it.startsWith("http") }
        }
        ?: return null
    if (url.startsWith("data:")) return null
    return url
}

private fun fetchHttp(client: OkHttpClient, request: Request): String {
    val response = client.newCall(request).execute()
    val body = response.use { it.body.string() }
    if (!response.isSuccessful) {
        throw IOException("HTTP ${response.code} from ${request.url}")
    }
    if (body.contains("Just a moment", ignoreCase = true) &&
        (body.contains("cf-", ignoreCase = true) || body.contains("challenge-platform"))
    ) {
        throw IOException(
            "Cloudflare blocked NovelCrow. Open any NovelCrow chapter, solve it, then refresh.",
        )
    }
    return body
}
