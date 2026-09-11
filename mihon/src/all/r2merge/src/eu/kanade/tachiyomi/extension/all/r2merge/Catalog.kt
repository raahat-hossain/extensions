package eu.kanade.tachiyomi.extension.all.r2merge

import android.util.Base64
import eu.kanade.tachiyomi.extension.all.r2merge.util.chapterNumberOf
import eu.kanade.tachiyomi.extension.all.r2merge.util.fileName
import eu.kanade.tachiyomi.extension.all.r2merge.util.isArchiveKey
import eu.kanade.tachiyomi.extension.all.r2merge.util.overlayChapterNumber
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
    /** JSON `number` or a `Chapter N` title — safe to replace a folder/cbz with this number. */
    val explicitNumber: Boolean = false,
)

internal class JsonChapterListing(
    val overlay: Boolean,
    val chapters: List<ParsedChapter>,
)

/**
 * JSON chapters with an explicit number replace every bucket chapter that already
 * uses that number; any other JSON chapter is appended. URL fingerprints still
 * drop exact duplicates. Without [overlay], callers should concat + distinctBy url.
 */
internal fun mergeChapterLists(
    base: List<ParsedChapter>,
    overlay: List<ParsedChapter>,
): List<ParsedChapter> {
    val merged = base.toMutableList()
    val seen = merged.map { it.url }.toMutableSet()
    for (chapter in overlay) {
        val replace = chapter.explicitNumber && chapter.number > 0f
        if (replace) {
            val targets = merged.indices.filter { merged[it].number == chapter.number }
            if (targets.isNotEmpty()) {
                val keep = targets.first()
                for (index in targets.asReversed()) {
                    seen.remove(merged[index].url)
                    if (index == keep) {
                        merged[index] = chapter
                        seen += chapter.url
                    } else {
                        merged.removeAt(index)
                    }
                }
                continue
            }
        }
        if (chapter.url in seen) continue
        merged += chapter
        seen += chapter.url
    }
    return merged
}

internal fun overlayFlag(body: String, json: Json): Boolean {
    val parsed = runCatching {
        json.parseToJsonElement(body.trim().removePrefix("\uFEFF"))
    }.getOrNull() as? JsonObject ?: return false
    return listOf("chaptersOverlay", "overlay").any { key ->
        (parsed[key] as? JsonPrimitive)?.contentOrNull.equals("true", true)
    }
}

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
        val jsonNumber = (obj?.get("number") as? JsonPrimitive)?.contentOrNull?.toFloatOrNull()
        val titleNumber = overlayChapterNumber(display)
        val explicitNumber = jsonNumber != null || titleNumber != null
        val number = jsonNumber
            ?: titleNumber
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
            explicitNumber = explicitNumber,
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
