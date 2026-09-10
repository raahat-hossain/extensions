package eu.kanade.tachiyomi.extension.all.r2merge

import android.util.Base64
import eu.kanade.tachiyomi.source.model.Page
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jsoup.Jsoup

private val DEFAULT_NH_SERVERS = listOf(
    "https://i1.nhentai.net",
    "https://i2.nhentai.net",
    "https://i3.nhentai.net",
    "https://i4.nhentai.net",
)

private val HR_EXTRA = Regex("""= (\{[^;]+)""")
private val HR_PAGES = Regex(""".(ey\S+).\s""")
private val H2R_PAGES = Regex("""'images'\s*:\s*\["(.*?),?"]""")

internal fun parseNhentaiPages(body: String, json: Json, imageServer: String): List<Page> {
    val data = json.parseToJsonElement(body).jsonObject
    val pages = data["pages"]?.jsonArray.orEmpty()
    if (pages.isEmpty()) throw Exception("nhentai gallery has no pages")
    return pages.mapIndexed { index, page ->
        val path = page.jsonObject["path"]?.jsonPrimitive?.content
            ?: throw Exception("nhentai page $index has no path")
        Page(index, imageUrl = "$imageServer/$path")
    }
}

internal fun parseHentaiReadPages(html: String, pageUrl: String, json: Json): List<Page> {
    val document = Jsoup.parse(html, pageUrl)
    val pageBaseUrl = document.selectFirst("[id=single-chapter-js-extra]")?.data()
        ?.let { HR_EXTRA.find(it)?.groupValues?.get(1) }
        ?.let { json.parseToJsonElement(it).jsonObject["baseUrl"]?.jsonPrimitive?.content }
        .orEmpty()

    val encoded = document.selectFirst("[id=single-chapter-js-before]")?.data()
        ?.let { HR_PAGES.find(it)?.groupValues?.get(1) }
        ?: throw Exception("HentaiRead: failed to find page list")

    val decoded = String(Base64.decode(encoded, Base64.DEFAULT))
    val images = json.parseToJsonElement(decoded)
        .jsonObject["data"]?.jsonObject
        ?.get("chapter")?.jsonObject
        ?.get("images")?.jsonArray
        ?: throw Exception("HentaiRead: failed to find page list")

    return images.mapIndexed { index, page ->
        val src = page.jsonObject["src"]?.jsonPrimitive?.content.orEmpty()
        val url = when {
            src.startsWith("http") -> src
            pageBaseUrl.isNotEmpty() -> "${pageBaseUrl.trimEnd('/')}/${src.trimStart('/')}"
            else -> src
        }
        if (url.isBlank()) throw Exception("HentaiRead: empty image at $index")
        Page(index, imageUrl = url)
    }
}

internal fun parseHentaiNexusPages(html: String, json: Json): List<Page> {
    val encoded = Regex("""initReader\("([^"]+)"""").find(html)?.groupValues?.get(1)
        ?: throw Exception("Could not find initReader script; page structure may have changed")
    val decrypted = HentaiNexusDecrypt.decrypt(encoded)
    val images = json.parseToJsonElement(decrypted).jsonArray.filter {
        it.jsonObject["type"]?.jsonPrimitive?.content == "image"
    }
    if (images.isEmpty()) throw Exception("HentaiNexus: no pages")
    val field = when {
        images.first().jsonObject["image_fallback"] != null -> "image_fallback"
        images.first().jsonObject["image_avif"] != null -> "image_avif"
        else -> "image_source"
    }
    return images.mapIndexed { index, page ->
        val url = page.jsonObject[field]?.jsonPrimitive?.content
            ?: throw Exception("HentaiNexus: missing $field")
        Page(index, imageUrl = url)
    }
}

internal fun parseHentai2ReadPages(html: String): List<Page> {
    val pages = mutableListOf<Page>()
    H2R_PAGES.findAll(html).forEach { match ->
        match.groupValues[1].split(",").forEach { part ->
            val path = part.trim().trim('"').replace("\\/", "/")
            if (path.isNotEmpty()) {
                pages.add(
                    Page(pages.size, imageUrl = "https://static.hentaicdn.com/hentai$path"),
                )
            }
        }
    }
    if (pages.isEmpty()) throw Exception("Hentai2Read: no pages")
    return pages
}

internal fun pickNhServer(body: String, json: Json): String {
    val servers = runCatching {
        json.parseToJsonElement(body).jsonObject["image_servers"]?.jsonArray
            ?.map { it.jsonPrimitive.content }
            .orEmpty()
    }.getOrDefault(emptyList())
    val list = servers.ifEmpty { DEFAULT_NH_SERVERS }
    return list.random()
}
