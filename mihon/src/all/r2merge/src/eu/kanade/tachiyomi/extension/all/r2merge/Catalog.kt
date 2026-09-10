package eu.kanade.tachiyomi.extension.all.r2merge

import android.util.Base64
import eu.kanade.tachiyomi.extension.all.r2merge.util.chapterNumberOf
import eu.kanade.tachiyomi.extension.all.r2merge.util.fileName
import eu.kanade.tachiyomi.extension.all.r2merge.util.isArchiveKey
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal class ParsedChapter(
    val title: String,
    val number: Float,
    val url: String,
    val scanlator: String? = null,
    val dateUpload: Long = 0L,
)

/**
 * Gallery URL, remote/local archive, folder, id+source, or explicit page list.
 * Relative paths are resolved against the series prefix.
 */
internal fun parseChaptersJson(
    body: String,
    json: Json,
    seriesPrefix: String = "",
): List<ParsedChapter> {
    val parsed = json.parseToJsonElement(body.trim().removePrefix("\uFEFF"))
    val list: JsonArray = when (parsed) {
        is JsonArray -> parsed
        is JsonObject -> parsed["chapters"] as? JsonArray ?: JsonArray(emptyList())
        else -> return emptyList()
    }

    return list.mapIndexedNotNull { index, entry ->
        val obj = entry as? JsonObject
        val rawUrl = when (entry) {
            is JsonPrimitive -> entry.content
            else -> listOf("url", "href", "link", "archive", "file", "key").firstNotNullOfOrNull {
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
            val site = tryIdentifySite(rawUrl, source)
            when {
                site != null -> {
                    val remoteId = rawId.ifBlank { extractRemoteId(site, rawUrl) }
                    chapterUrl = if (rawUrl.isNotEmpty()) rawUrl else canonicalUrl(site, remoteId)
                    displayFallback = "${site.label()} $remoteId"
                    siteLabel = source ?: site.label()
                }
                rawUrl.isNotEmpty() -> {
                    chapterUrl = resolveChapterTarget(rawUrl, seriesPrefix)
                    displayFallback = chapterUrl.fileName().substringBeforeLast('.')
                        .ifBlank { "Chapter ${index + 1}" }
                    siteLabel = source
                }
                rawId.isNotEmpty() && source != null && tryIdentifySite("", source) != null -> {
                    val resolved = identifySite("", source)
                    chapterUrl = canonicalUrl(resolved, rawId)
                    displayFallback = "${resolved.label()} $rawId"
                    siteLabel = source
                }
                rawId.isNotEmpty() -> {
                    chapterUrl = resolveChapterTarget(rawId, seriesPrefix)
                    displayFallback = chapterUrl.fileName().substringBeforeLast('.')
                        .ifBlank { "Chapter ${index + 1}" }
                    siteLabel = source
                }
                else -> return@mapIndexedNotNull null
            }
        }

        val display = title.ifBlank { displayFallback }
        val number = (obj?.get("number") as? JsonPrimitive)?.contentOrNull?.toFloatOrNull()
            ?: chapterNumberOf(display).takeIf { it >= 0f }
            ?: (index + 1).toFloat()
        val date = listOf("date", "date_upload").firstNotNullOfOrNull {
            (obj?.get(it) as? JsonPrimitive)?.contentOrNull
        }?.let { parseDate(it) } ?: 0L
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

internal fun resolveChapterTarget(raw: String, seriesPrefix: String): String {
    val trimmed = raw.trim()
    if (trimmed.startsWith("pages:") || isAbsoluteHttpUrl(trimmed)) return trimmed
    val prefix = seriesPrefix.trimEnd('/')
    val relative = trimmed.trimStart('/')
    return if (prefix.isEmpty()) relative else "$prefix/$relative"
}

internal fun isFolderChapter(url: String): Boolean = !isAbsoluteHttpUrl(url) && !url.startsWith("pages:") && url.endsWith("/")

internal fun isBucketArchive(url: String): Boolean = !isAbsoluteHttpUrl(url) && !url.startsWith("pages:") && isArchiveKey(url)

private fun parseDate(value: String): Long {
    val asLong = value.toLongOrNull()
    if (asLong != null) {
        return if (asLong < 1_000_000_000_000L) asLong * 1000 else asLong
    }
    return runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
}
