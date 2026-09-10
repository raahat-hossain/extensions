package eu.kanade.tachiyomi.extension.all.r2merge.util

/**
 * `details.json` `"cover": "Chapter 1_1"` → chapter name + 1-based page index.
 * Legacy Suwatte form `"chapter 4_24.png"` → chapter name + page filename.
 */
internal data class CoverPageRef(
    val chapter: String,
    val page: String,
)

internal fun parseCoverPageRef(value: String): CoverPageRef? {
    val trimmed = value.trim()
    if (trimmed.isEmpty() || trimmed.contains('/') || trimmed.contains('\\')) return null
    if (trimmed.startsWith("http://", ignoreCase = true) ||
        trimmed.startsWith("https://", ignoreCase = true) ||
        trimmed.startsWith("data:", ignoreCase = true)
    ) {
        return null
    }
    val separator = trimmed.lastIndexOf('_')
    if (separator <= 0 || separator == trimmed.lastIndex) return null
    val chapter = trimmed.substring(0, separator).trim()
    val page = trimmed.substring(separator + 1).trim()
    if (chapter.isEmpty() || page.isEmpty()) return null
    if (!page.all { it.isDigit() } && !isImageKey(page)) return null
    return CoverPageRef(chapter, page)
}

internal fun chapterLabel(keyOrPrefix: String): String {
    val name = keyOrPrefix.fileName()
    return if (isArchiveKey(name)) name.substringBeforeLast('.') else name
}

internal fun <T> findChapterByName(
    items: List<T>,
    needle: String,
    labelOf: (T) -> String,
): T? {
    val matches = items.filter { chapterNameMatches(labelOf(it), needle) }
    if (matches.isEmpty()) return null
    if (matches.size == 1) return matches.first()
    return matches.minWithOrNull(
        compareBy<T> { chapterMatchRank(labelOf(it), needle) }
            .thenBy(NaturalOrder) { chapterLabel(labelOf(it)) },
    )
}

internal fun <T> pickCoverPage(
    items: List<T>,
    page: String,
    preserveOrder: Boolean = false,
    nameOf: (T) -> String,
): T? {
    if (items.isEmpty()) return null
    val ordered = if (preserveOrder) {
        items
    } else {
        items.sortedWith(compareBy(NaturalOrder) { nameOf(it) })
    }
    if (page.all { it.isDigit() }) {
        val index = page.toInt()
        if (index > 0) ordered.getOrNull(index - 1)?.let { return it }
    }
    return ordered.firstOrNull { pageNameMatches(nameOf(it).fileName(), page) }
}

internal fun chapterNameMatches(label: String, needle: String): Boolean {
    val have = chapterLabel(label).trim()
    val want = needle.trim()
    if (have.isEmpty() || want.isEmpty()) return false
    if (have.equals(want, ignoreCase = true)) return true
    val haveLower = have.lowercase()
    val wantLower = want.lowercase()
    val stripped = LEADING_INDEX.replace(haveLower, "").trim()
    if (stripped == wantLower || haveLower.endsWith(wantLower)) return true
    val wantNum = chapterNumberOf(want)
    val haveNum = chapterNumberOf(have)
    return wantNum >= 0f && haveNum >= 0f && wantNum == haveNum
}

internal fun pageNameMatches(fileName: String, token: String): Boolean {
    if (fileName.equals(token, ignoreCase = true)) return true
    val fileStem = fileName.substringBeforeLast('.')
    val tokenStem = if ('.' in token) token.substringBeforeLast('.') else token
    if (fileStem.equals(tokenStem, ignoreCase = true)) return true
    if (fileStem.all { it.isDigit() } && tokenStem.all { it.isDigit() }) {
        return fileStem.trimStart('0').ifEmpty { "0" } ==
            tokenStem.trimStart('0').ifEmpty { "0" }
    }
    return false
}

private fun chapterMatchRank(label: String, needle: String): Int {
    val have = chapterLabel(label).trim()
    val want = needle.trim()
    val stripped = LEADING_INDEX.replace(have.lowercase(), "").trim()
    return when {
        have.equals(want, ignoreCase = true) -> 0
        stripped == want.lowercase() -> 1
        have.endsWith(want, ignoreCase = true) -> 2
        else -> 3
    }
}

private val LEADING_INDEX = Regex("""^\d+(?:\.\d+)?\s*[-._:)\]\s]+""")
