package eu.kanade.tachiyomi.extension.all.r2merge

import eu.kanade.tachiyomi.network.GET
import okhttp3.Headers
import okhttp3.OkHttpClient

/**
 * Hitomi `gg.js` subdomain / path helpers.
 *
 * Always emit webp (`wN` hosts). AVIF (`aN`) is what Yūzōnō uses for stills,
 * but TachiManga/iOS is flaky with it — same choice as the Suwatte port.
 */
internal class HitomiGg {
    @Volatile
    private var fetchedAt = 0L
    private var subdomainOffsetDefault = 0
    private val subdomainOffsetMap = mutableMapOf<Int, Int>()
    private var commonImageId = ""

    @Synchronized
    fun imageUrl(client: OkHttpClient, headers: Headers, hash: String): String {
        refresh(client, headers)
        val imageId = imageIdFromHash(hash)
        val offset = subdomainOffsetMap[imageId] ?: subdomainOffsetDefault
        return "https://w${offset + 1}.$HITOMI_CDN/$commonImageId$imageId/$hash.webp"
    }

    private fun refresh(client: OkHttpClient, headers: Headers) {
        val now = System.currentTimeMillis()
        if (fetchedAt != 0L && now - fetchedAt < 60_000) return

        val script = client.newCall(
            GET("$HITOMI_LTN/gg.js?_=$now", headers),
        ).execute().use { response ->
            if (!response.isSuccessful) throw Exception("Hitomi gg.js failed (${response.code})")
            response.body.string()
        }

        val defaultOffset = Regex("""var o = (\d)""").find(script)?.groupValues?.get(1)?.toIntOrNull()
            ?: throw Exception("Failed to parse Hitomi gg.js")
        val caseOffset = Regex("""o = (\d); break;""").find(script)?.groupValues?.get(1)?.toIntOrNull()
            ?: throw Exception("Failed to parse Hitomi gg.js")
        val commonId = Regex("""b: '(.+)'""").find(script)?.groupValues?.get(1)
            ?: throw Exception("Failed to parse Hitomi gg.js")

        subdomainOffsetDefault = defaultOffset
        subdomainOffsetMap.clear()
        Regex("""case (\d+):""").findAll(script).forEach { match ->
            subdomainOffsetMap[match.groupValues[1].toInt()] = caseOffset
        }
        commonImageId = commonId
        fetchedAt = now
    }

    companion object {
        fun imageIdFromHash(hash: String): Int {
            val match = Regex("""(..)(.)$""").find(hash)
                ?: throw Exception("Invalid Hitomi hash: $hash")
            return (match.groupValues[2] + match.groupValues[1]).toInt(16)
        }
    }
}
