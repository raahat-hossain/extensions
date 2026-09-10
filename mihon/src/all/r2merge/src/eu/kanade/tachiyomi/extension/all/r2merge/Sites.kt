package eu.kanade.tachiyomi.extension.all.r2merge

internal enum class SiteId {
    Nhentai,
    HentaiRead,
    HentaiNexus,
    Hentai2Read,
    PandaChaika,
    EHentai,
    Hitomi,
    ;

    fun label(): String = when (this) {
        Nhentai -> "nhentai"
        HentaiRead -> "hentairead"
        HentaiNexus -> "hentainexus"
        Hentai2Read -> "hentai2read"
        PandaChaika -> "pandachaika"
        EHentai -> "ehentai"
        Hitomi -> "hitomi"
    }
}

internal const val CHAIKA_BASE = "https://panda.chaika.moe"
internal const val HITOMI_BASE = "https://hitomi.la"
internal const val HITOMI_CDN = "gold-usergeneratedcontent.net"
internal const val HITOMI_LTN = "https://ltn.$HITOMI_CDN"
internal const val EHENTAI_BASE = "https://e-hentai.org"
internal const val EXHENTAI_BASE = "https://exhentai.org"

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
        "pandachaika", "panda-chaika", "chaika", "panda", "panda.chaika.moe",
        "chaika.moe",
        -> SiteId.PandaChaika
        "ehentai", "e-hentai", "eh", "exhentai", "ex", "e-hentai.org", "exhentai.org" -> SiteId.EHentai
        "hitomi", "hitomi.la" -> SiteId.Hitomi
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
        h == "panda.chaika.moe" || h == "chaika.moe" || h.endsWith(".chaika.moe") -> SiteId.PandaChaika
        h == "e-hentai.org" || h == "exhentai.org" ||
            h.endsWith(".e-hentai.org") || h.endsWith(".exhentai.org") -> SiteId.EHentai
        h == "hitomi.la" || h.endsWith(".hitomi.la") ||
            h == HITOMI_CDN || h.endsWith(".$HITOMI_CDN") -> SiteId.Hitomi
        else -> null
    }
}

internal fun identifySite(url: String, explicit: String? = null): SiteId {
    normalizeSite(explicit)?.let { return it }
    siteFromHost(hostOf(url))?.let { return it }
    throw Exception(
        "Unknown chapter host \"${hostOf(url).ifBlank { url }}\". " +
            "Set source to nhentai, hentairead, hentainexus, hentai2read, " +
            "pandachaika, ehentai, or hitomi.",
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
        SiteId.PandaChaika ->
            Regex("""/archive/(\d+)""", RegexOption.IGNORE_CASE).find(trimmed)?.groupValues?.get(1)
                ?: Regex("""[?&]archive=(\d+)""", RegexOption.IGNORE_CASE).find(trimmed)
                    ?.groupValues?.get(1)
                ?: Regex("""\b(\d+)\b""").find(trimmed)?.groupValues?.get(1)
                ?: throw Exception("Could not parse pandachaika id from $trimmed")
        SiteId.EHentai -> {
            val gallery = Regex(
                """/g/(\d+)/([0-9a-f]+)""",
                RegexOption.IGNORE_CASE,
            ).find(trimmed)
            when {
                gallery != null -> "${gallery.groupValues[1]}/${gallery.groupValues[2]}"
                else -> Regex("""/g/(\d+)""", RegexOption.IGNORE_CASE).find(trimmed)
                    ?.groupValues?.get(1)
                    ?: throw Exception("Could not parse e-hentai gallery id/token from $trimmed")
            }
        }
        SiteId.Hitomi ->
            Regex("""/(?:galleries|reader)/(\d+)""", RegexOption.IGNORE_CASE)
                .find(trimmed)?.groupValues?.get(1)
                ?: Regex("""-(\d+)\.html?""", RegexOption.IGNORE_CASE).find(trimmed)
                    ?.groupValues?.get(1)
                ?: Regex("""/galleries/(\d+)\.js""", RegexOption.IGNORE_CASE).find(trimmed)
                    ?.groupValues?.get(1)
                ?: Regex("""\b(\d{3,})\b""").find(trimmed)?.groupValues?.get(1)
                ?: throw Exception("Could not parse hitomi id from $trimmed")
    }
}

internal fun canonicalUrl(site: SiteId, remoteId: String): String = when (site) {
    SiteId.Nhentai -> "https://nhentai.net/g/$remoteId/"
    SiteId.HentaiRead -> "https://hentairead.com/hentai/$remoteId/"
    SiteId.HentaiNexus -> "https://hentainexus.com/view/$remoteId"
    SiteId.Hentai2Read -> "https://hentai2read.com/${remoteId.trimStart('/')}/"
    SiteId.PandaChaika -> "$CHAIKA_BASE/archive/$remoteId"
    SiteId.EHentai -> ehentaiGalleryUrl(remoteId, EHENTAI_BASE)
    SiteId.Hitomi -> "$HITOMI_BASE/galleries/$remoteId.html"
}

internal fun refererForImage(url: String): String? = when (siteFromHost(hostOf(url))) {
    SiteId.Nhentai -> "https://nhentai.net/"
    SiteId.HentaiRead -> "https://hentairead.com/"
    SiteId.HentaiNexus -> "https://hentainexus.com/"
    SiteId.Hentai2Read -> "https://hentai2read.com/"
    SiteId.PandaChaika -> "$CHAIKA_BASE/"
    SiteId.EHentai -> {
        val host = hostOf(url)
        if (host.contains("exhentai")) "$EXHENTAI_BASE/" else "$EHENTAI_BASE/"
    }
    SiteId.Hitomi -> "$HITOMI_BASE/"
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
    SiteId.PandaChaika -> "$CHAIKA_BASE/api?archive=$remoteId"
    SiteId.EHentai -> {
        val origin = if (hostOf(originalUrl).contains("exhentai")) EXHENTAI_BASE else EHENTAI_BASE
        ehentaiGalleryUrl(remoteId, origin)
    }
    SiteId.Hitomi -> "$HITOMI_LTN/galleries/$remoteId.js"
}

internal fun siteReferer(site: SiteId): String = when (site) {
    SiteId.Nhentai -> "https://nhentai.net/"
    SiteId.HentaiRead -> "https://hentairead.com/"
    SiteId.HentaiNexus -> "https://hentainexus.com/"
    SiteId.Hentai2Read -> "https://hentai2read.com/"
    SiteId.PandaChaika -> "$CHAIKA_BASE/"
    SiteId.EHentai -> "$EHENTAI_BASE/"
    SiteId.Hitomi -> "$HITOMI_BASE/"
}

internal fun ehentaiGalleryUrl(remoteId: String, origin: String): String {
    val parts = remoteId.trim('/').split('/')
    val path = if (parts.size >= 2) {
        "/g/${parts[0]}/${parts[1]}/"
    } else {
        "/g/${parts[0]}/"
    }
    return "${origin.trimEnd('/')}$path?nw=always"
}

internal fun chaikaDownloadUrl(download: String): String {
    val trimmed = download.trim()
    val absolute = when {
        trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true) -> trimmed
        else -> CHAIKA_BASE + if (trimmed.startsWith("/")) trimmed else "/$trimmed"
    }
    val noQuery = absolute.substringBefore('?').trimEnd('/')
    return if (noQuery.endsWith("/download")) "$noQuery/" else "$noQuery/download/"
}

internal fun isEHentaiHost(host: String): Boolean {
    val h = host.lowercase().removePrefix("www.")
    return h == "e-hentai.org" || h == "exhentai.org" ||
        h.endsWith(".e-hentai.org") || h.endsWith(".exhentai.org")
}

internal fun isChaikaLoopback(url: String): Boolean = url.startsWith("https://127.0.0.1/#") || url.startsWith("http://127.0.0.1/#")

private fun lastPathSegment(url: String): String {
    val cleaned = url.replace(Regex("""[?#].*$"""), "").trimEnd('/')
    return cleaned.substringAfterLast('/')
}
