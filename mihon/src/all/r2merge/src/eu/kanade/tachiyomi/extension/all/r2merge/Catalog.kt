package eu.kanade.tachiyomi.extension.all.r2merge

import android.util.Base64
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import org.jsoup.Jsoup
import org.jsoup.parser.Parser

internal class ParsedChapter(
    val title: String,
    val number: Float,
    val url: String,
    val scanlator: String? = null,
    val dateUpload: Long = 0L,
)

internal class DetailsFile(
    val title: String? = null,
    val summary: String? = null,
    val author: String? = null,
    val artist: String? = null,
    val genre: String? = null,
    val status: String? = null,
    val cover: String? = null,
)

internal class TitleEntry(
    val id: String,
    val coverKey: String? = null,
    val detailsKey: String? = null,
    val chaptersKey: String,
)

internal class ListPage(
    val keys: List<String>,
    val nextToken: String? = null,
)

private fun isCoverName(name: String) = Regex("""^cover\.(png|jpe?g|webp|gif|avif)$""", RegexOption.IGNORE_CASE).matches(name)

private fun isDetailsName(name: String) = Regex("""^(details|info|metadata|series)\.json$""", RegexOption.IGNORE_CASE).matches(name)

private fun isChaptersName(name: String) = Regex("""^(chapters|chapter-list|chapter_list)\.json$""", RegexOption.IGNORE_CASE).matches(name)

private fun basename(key: String) = key.trimEnd('/').substringAfterLast('/')

internal fun parseObjectKeys(xml: String): ListPage {
    if (Regex("""<Error[\s>]""", RegexOption.IGNORE_CASE).containsMatchIn(xml)) {
        val code = Regex("""<Code>([^<]*)</Code>""").find(xml)?.groupValues?.get(1) ?: "Unknown"
        val message = Regex("""<Message>([^<]*)</Message>""").find(xml)?.groupValues?.get(1)
            ?: xml.take(240)
        throw Exception("R2 list error $code: $message")
    }
    val doc = Jsoup.parse(xml, "", Parser.xmlParser())
    val keys = doc.select("Contents > Key").map { it.text() }
        .filter { it.isNotBlank() && !it.endsWith("/") }
    val truncated = doc.selectFirst("IsTruncated")?.text().equals("true", ignoreCase = true)
    val token = if (truncated) {
        doc.selectFirst("NextContinuationToken")?.text()?.takeIf { it.isNotBlank() }
    } else {
        null
    }
    return ListPage(keys, token)
}

internal fun titlesFromKeys(keys: List<String>, root: String): List<TitleEntry> {
    val grouped = linkedMapOf<String, MutableList<String>>()
    val rootNorm = root.trim('/')
    for (key in keys) {
        val rest = if (rootNorm.isNotEmpty() && key.startsWith("$rootNorm/")) {
            key.substring(rootNorm.length + 1)
        } else {
            key
        }
        val id = rest.substringBefore('/')
        if (id.isBlank() || id == rest) continue
        grouped.getOrPut(id) { mutableListOf() }.add(key)
    }

    return grouped.mapNotNull { (id, folderKeys) ->
        val chaptersKey = folderKeys.find { isChaptersName(basename(it)) } ?: return@mapNotNull null
        TitleEntry(
            id = id,
            coverKey = folderKeys.find { isCoverName(basename(it)) },
            detailsKey = folderKeys.find { isDetailsName(basename(it)) },
            chaptersKey = chaptersKey,
        )
    }.sortedBy { it.id.lowercase() }
}

internal fun parseListXml(xml: String, root: String): List<TitleEntry> = titlesFromKeys(parseObjectKeys(xml).keys, root)

internal fun parseDetailsJson(body: String, json: Json): DetailsFile {
    val obj = json.parseToJsonElement(body).jsonObject
    fun str(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
        (obj[key] as? JsonPrimitive)?.contentOrNull?.takeIf { v -> v.isNotBlank() }
    }

    val credits = obj["credits"] as? JsonArray ?: JsonArray(emptyList())
    val author = credits.mapNotNull { credit ->
        val c = credit as? JsonObject ?: return@mapNotNull null
        val role = (c["role"] as? JsonPrimitive)?.contentOrNull?.lowercase().orEmpty()
        val name = (c["name"] as? JsonPrimitive)?.contentOrNull
        if (name != null && (role.isEmpty() || role.contains("author") || role.contains("story"))) {
            name
        } else {
            null
        }
    }.joinToString().ifBlank { null }
    val artist = credits.mapNotNull { credit ->
        val c = credit as? JsonObject ?: return@mapNotNull null
        val role = (c["role"] as? JsonPrimitive)?.contentOrNull?.lowercase().orEmpty()
        val name = (c["name"] as? JsonPrimitive)?.contentOrNull
        if (name != null && (role.contains("art") || role.contains("artist"))) name else null
    }.joinToString().ifBlank { author }

    val genres = (obj["genres"] as? JsonArray)?.mapNotNull {
        val item = it as? JsonObject ?: return@mapNotNull (it as? JsonPrimitive)?.contentOrNull
        (item["title"] as? JsonPrimitive)?.contentOrNull
    }?.joinToString()

    return DetailsFile(
        title = str("title"),
        summary = str("summary", "description"),
        author = author,
        artist = artist,
        genre = genres,
        status = str("status"),
        cover = str("cover"),
    )
}

internal fun parseChaptersJson(body: String, json: Json): List<ParsedChapter> {
    val parsed = json.parseToJsonElement(body.trim().removePrefix("\uFEFF"))
    val list: JsonArray = when (parsed) {
        is JsonArray -> parsed
        is JsonObject -> parsed["chapters"] as? JsonArray
            ?: throw Exception("chapters.json must be an array or { \"chapters\": [...] }")
        else -> throw Exception("chapters.json must be an array or { \"chapters\": [...] }")
    }
    if (list.isEmpty()) throw Exception("chapters.json has no chapters")

    return list.mapIndexed { index, entry ->
        val obj = entry as? JsonObject
        val url = when (entry) {
            is JsonPrimitive -> entry.content
            else -> listOf("url", "href", "link").firstNotNullOfOrNull {
                (obj?.get(it) as? JsonPrimitive)?.contentOrNull
            }
        }?.trim().orEmpty()
        val pages = (obj?.get("pages") as? JsonArray)?.mapNotNull {
            (it as? JsonPrimitive)?.contentOrNull
        }?.filter { it.isNotBlank() }
        val source = listOf("source", "site", "host").firstNotNullOfOrNull {
            (obj?.get(it) as? JsonPrimitive)?.contentOrNull
        }
        val rawId = (obj?.get("id") as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
        val title = listOf("title", "name").firstNotNullOfOrNull {
            (obj?.get(it) as? JsonPrimitive)?.contentOrNull
        }?.trim().orEmpty()

        val chapterUrl: String
        val displayFallback: String
        val siteLabel: String?
        if (!pages.isNullOrEmpty()) {
            chapterUrl = "pages:" + Base64.encodeToString(
                json.encodeToString(ListSerializer(String.serializer()), pages).toByteArray(),
                Base64.URL_SAFE or Base64.NO_WRAP,
            )
            displayFallback = "Chapter ${index + 1}"
            siteLabel = source
        } else {
            val site: SiteId
            val remoteId: String
            if (url.isNotEmpty()) {
                site = identifySite(url, source)
                remoteId = rawId.ifBlank { extractRemoteId(site, url) }
                chapterUrl = url
            } else if (rawId.isNotEmpty() && source != null) {
                site = identifySite("", source)
                remoteId = rawId
                chapterUrl = canonicalUrl(site, remoteId)
            } else {
                throw Exception("chapters.json entry $index needs a url, id+source, or pages array")
            }
            displayFallback = "${site.label()} $remoteId"
            siteLabel = source ?: site.label()
        }

        val display = title.ifBlank { displayFallback }
        val number = (obj?.get("number") as? JsonPrimitive)?.contentOrNull?.toFloatOrNull()
            ?: Regex("""(?:ch(?:apter)?|ep(?:isode)?|#)\s*(\d+(?:\.\d+)?)""", RegexOption.IGNORE_CASE)
                .find(display)?.groupValues?.get(1)?.toFloatOrNull()
            ?: Regex("""^\s*(\d+(?:\.\d+)?)""").find(display)?.groupValues?.get(1)?.toFloatOrNull()
            ?: (index + 1).toFloat()

        val date = (obj?.get("date") as? JsonPrimitive)?.contentOrNull?.let { parseDate(it) } ?: 0L
        val scanlator = listOf("scanlator", "group").firstNotNullOfOrNull {
            (obj?.get(it) as? JsonPrimitive)?.contentOrNull
        } ?: siteLabel

        ParsedChapter(
            title = display,
            number = number,
            url = chapterUrl,
            scanlator = scanlator,
            dateUpload = date,
        )
    }
}

private fun parseDate(value: String): Long {
    val asLong = value.toLongOrNull()
    if (asLong != null) {
        return if (asLong < 1_000_000_000_000L) asLong * 1000 else asLong
    }
    return runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
}
