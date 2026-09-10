package eu.kanade.tachiyomi.extension.all.r2merge

internal enum class SiteId {
    Nhentai,
    HentaiRead,
    HentaiNexus,
    Hentai2Read,
    ;

    fun label(): String = when (this) {
        Nhentai -> "nhentai"
        HentaiRead -> "hentairead"
        HentaiNexus -> "hentainexus"
        Hentai2Read -> "hentai2read"
    }
}

internal fun hostOf(url: String): String {
    val match = Regex("""^https?://([^/?#]+)""", RegexOption.IGNORE_CASE).find(url.trim())
    return (match?.groupValues?.get(1) ?: "").lowercase().removePrefix("www.")
}

internal fun normalizeSite(value: String?): SiteId? {
    if (value.isNullOrBlank()) return null
    return when (value.trim().lowercase().replace(Regex("""\s+"""), "-")) {
        "nhentai", "nh", "n-hentai", "nhentai.net" -> SiteId.Nhentai
        "hentairead", "hr", "hentai-read", "hentairead.com" -> SiteId.HentaiRead
        "hentainexus", "hn", "nexus", "hentai-nexus", "hentainexus.com" -> SiteId.HentaiNexus
        "hentai2read", "h2r", "hentai-2-read", "hentai2read.com" -> SiteId.Hentai2Read
        else -> null
    }
}

internal fun siteFromHost(host: String): SiteId? {
    val h = host.lowercase().removePrefix("www.")
    return when {
        h == "nhentai.net" || h.endsWith(".nhentai.net") -> SiteId.Nhentai
        h == "hentairead.com" || h.endsWith(".hentairead.com") ||
            h == "hencover.xyz" || h == "henread.xyz" -> SiteId.HentaiRead
        h == "hentainexus.com" || h.endsWith(".hentainexus.com") -> SiteId.HentaiNexus
        h == "hentai2read.com" || h.endsWith(".hentai2read.com") ||
            h.endsWith(".hentaicdn.com") -> SiteId.Hentai2Read
        else -> null
    }
}

internal fun identifySite(url: String, explicit: String? = null): SiteId {
    normalizeSite(explicit)?.let { return it }
    siteFromHost(hostOf(url))?.let { return it }
    throw Exception(
        "Unknown chapter host \"${hostOf(url).ifBlank { url }}\". " +
            "Set source to nhentai, hentairead, hentainexus, or hentai2read.",
    )
}

internal fun extractRemoteId(site: SiteId, url: String): String {
    val trimmed = url.trim()
    return when (site) {
        SiteId.Nhentai ->
            Regex("""/g/(\d+)""", RegexOption.IGNORE_CASE).find(trimmed)?.groupValues?.get(1)
                ?: Regex("""\b(\d{4,})\b""").find(trimmed)?.groupValues?.get(1)
                ?: throw Exception("Could not parse nhentai id from $trimmed")
        SiteId.HentaiRead ->
            Regex("""/hentai/([^/?#]+)""", RegexOption.IGNORE_CASE).find(trimmed)
                ?.groupValues?.get(1)
                ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
                ?: java.net.URLDecoder.decode(lastPathSegment(trimmed), "UTF-8")
                    .ifBlank { throw Exception("Could not parse hentairead slug from $trimmed") }
        SiteId.HentaiNexus ->
            Regex("""/(?:view|read)/(\d+)""", RegexOption.IGNORE_CASE).find(trimmed)
                ?.groupValues?.get(1)
                ?: Regex("""\b(\d+)\b""").find(trimmed)?.groupValues?.get(1)
                ?: throw Exception("Could not parse hentainexus id from $trimmed")
        SiteId.Hentai2Read -> {
            val path = trimmed.replace(Regex("""[?#].*$"""), "").trimEnd('/')
                .replace(Regex("""^https?://[^/]+""", RegexOption.IGNORE_CASE), "")
                .trim('/')
            path.ifBlank { throw Exception("Could not parse hentai2read path from $trimmed") }
        }
    }
}

internal fun canonicalUrl(site: SiteId, remoteId: String): String = when (site) {
    SiteId.Nhentai -> "https://nhentai.net/g/$remoteId/"
    SiteId.HentaiRead -> "https://hentairead.com/hentai/$remoteId/"
    SiteId.HentaiNexus -> "https://hentainexus.com/view/$remoteId"
    SiteId.Hentai2Read -> "https://hentai2read.com/${remoteId.trimStart('/')}/"
}

internal fun refererForImage(url: String): String? = when (siteFromHost(hostOf(url))) {
    SiteId.Nhentai -> "https://nhentai.net/"
    SiteId.HentaiRead -> "https://hentairead.com/"
    SiteId.HentaiNexus -> "https://hentainexus.com/"
    SiteId.Hentai2Read -> "https://hentai2read.com/"
    null -> null
}

internal fun hentaiReadLanguageFromUrl(url: String): String? {
    val lang = Regex(
        """/hentai/[^/]+/([^/?#]+)/(?:p/\d+)?/?$""",
        RegexOption.IGNORE_CASE,
    ).find(url)?.groupValues?.get(1)?.lowercase()
    return if (lang == null || lang == "p" || lang.toIntOrNull() != null) null else lang
}

internal fun pageListUrl(site: SiteId, remoteId: String, originalUrl: String): String = when (site) {
    SiteId.Nhentai -> "https://nhentai.net/api/v2/galleries/$remoteId"
    SiteId.HentaiRead -> {
        val language = hentaiReadLanguageFromUrl(originalUrl) ?: "english"
        "https://hentairead.com/hentai/$remoteId/$language/p/1/"
    }
    SiteId.HentaiNexus -> "https://hentainexus.com/read/$remoteId"
    SiteId.Hentai2Read -> {
        val path = if (remoteId.contains("/")) remoteId else "$remoteId/1"
        "https://hentai2read.com/${path.trimStart('/')}/"
    }
}

internal fun siteReferer(site: SiteId): String = when (site) {
    SiteId.Nhentai -> "https://nhentai.net/"
    SiteId.HentaiRead -> "https://hentairead.com/"
    SiteId.HentaiNexus -> "https://hentainexus.com/"
    SiteId.Hentai2Read -> "https://hentai2read.com/"
}

private fun lastPathSegment(url: String): String {
    val cleaned = url.replace(Regex("""[?#].*$"""), "").trimEnd('/')
    return cleaned.substringAfterLast('/')
}
