package eu.kanade.tachiyomi.extension.all.r2merge

import eu.kanade.tachiyomi.source.model.Page
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import java.io.IOException

/** 1-based inclusive page window. [end] null means through the last page. */
internal data class PageRange(
    val start: Int,
    val end: Int?,
) {
    fun spec(): String = when {
        end == null -> "$start-"
        start <= 1 -> end.toString()
        else -> "$start-$end"
    }
}

private val EMBEDDED_RANGE = Regex("""(?:#|&)r2p=([^&#]*)""")
private val RANGE_SPAN = Regex("""^(\d+)?-(\d+)?$""")

internal fun parsePageRangeSpec(raw: String?): PageRange? {
    val value = raw?.trim()?.replace(" ", "") ?: return null
    if (value.isEmpty()) return null
    RANGE_SPAN.matchEntire(value)?.let { match ->
        val start = match.groupValues[1].toIntOrNull()?.coerceAtLeast(1) ?: 1
        val end = match.groupValues[2].toIntOrNull()
        if (end != null && end < start) return null
        return PageRange(start, end)
    }
    val count = value.toIntOrNull() ?: return null
    if (count <= 0) return null
    return PageRange(1, count)
}

internal fun pageRangeFromJson(obj: JsonObject?): PageRange? {
    if (obj == null) return null
    listOf("pageRange", "pagerange", "pagesRange", "range").forEach { key ->
        val primitive = obj[key] as? JsonPrimitive ?: return@forEach
        primitive.contentOrNull?.let { parsePageRangeSpec(it) }?.let { return it }
        primitive.intOrNull?.let { parsePageRangeSpec(it.toString()) }?.let { return it }
    }
    val start = intField(obj, "pageStart", "fromPage", "startPage")
    val end = intField(obj, "pageEnd", "toPage", "endPage", "pageLimit", "maxPages")
    if (start == null && end == null) return null
    val from = (start ?: 1).coerceAtLeast(1)
    val to = end
    if (to != null && to < from) return null
    return PageRange(from, to)
}

internal fun encodePageRange(url: String, range: PageRange?): String {
    val clean = splitPageRange(url).first
    if (range == null) return clean
    val marker = "r2p=${range.spec()}"
    return if ('#' in clean) "$clean&$marker" else "$clean#$marker"
}

internal fun splitPageRange(url: String): Pair<String, PageRange?> {
    val match = EMBEDDED_RANGE.find(url) ?: return url to null
    val range = parsePageRangeSpec(match.groupValues[1])
    var clean = url.removeRange(match.range)
    if (clean.endsWith("#") || clean.endsWith("&")) {
        clean = clean.dropLast(1)
    }
    return clean to range
}

internal fun applyPageRange(pages: List<Page>, range: PageRange?): List<Page> {
    if (range == null) return pages
    if (pages.isEmpty()) return pages
    val from = (range.start - 1).coerceAtLeast(0)
    if (from >= pages.size) {
        throw IOException("pageRange ${range.spec()} is past ${pages.size} page(s)")
    }
    val to = (range.end ?: pages.size).coerceAtMost(pages.size)
    if (from >= to) {
        throw IOException("pageRange ${range.spec()} is empty for ${pages.size} page(s)")
    }
    return pages.subList(from, to).mapIndexed { index, page ->
        Page(index, url = page.url, imageUrl = page.imageUrl)
    }
}

internal fun ParsedChapter.readerUrl(): String = encodePageRange(url, pageRange)

private fun intField(obj: JsonObject, vararg keys: String): Int? {
    keys.forEach { key ->
        val value = (obj[key] as? JsonPrimitive)?.contentOrNull?.toIntOrNull()
            ?: (obj[key] as? JsonPrimitive)?.intOrNull
        if (value != null) return value
    }
    return null
}
