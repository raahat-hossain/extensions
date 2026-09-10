package eu.kanade.tachiyomi.extension.all.r2merge

import android.text.InputType
import android.util.Base64
import androidx.preference.EditTextPreference
import androidx.preference.PreferenceScreen
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.asObservableSuccess
import eu.kanade.tachiyomi.source.ConfigurableSource
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import keiyoushi.annotation.Source
import keiyoushi.utils.getPreferencesLazy
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import okhttp3.Headers
import okhttp3.Request
import okhttp3.Response
import rx.Observable

@Source
class R2Merge(
    override val name: String,
    override val lang: String,
    override val baseUrl: String,
    override val id: Long,
) : HttpSource(),
    ConfigurableSource {

    override val supportsLatest = false

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    private val preferences by getPreferencesLazy()

    private var cachedNhServer: String? = null

    private fun config(): R2Config {
        val accountId = preferences.getString(PREF_ACCOUNT, "")!!.trim()
        val accessKeyId = preferences.getString(PREF_ACCESS_KEY, "")!!.trim()
        val secret = preferences.getString(PREF_SECRET, "")!!.trim()
        val bucket = preferences.getString(PREF_BUCKET, "")!!.trim()
        val endpointOverride = preferences.getString(PREF_ENDPOINT, "")!!.trim().trimEnd('/')
        val prefix = preferences.getString(PREF_PREFIX, "")!!.trim().trim('/')
        if (accountId.isEmpty() || accessKeyId.isEmpty() || secret.isEmpty() || bucket.isEmpty()) {
            throw Exception("Open R2 Merge settings and set Account ID, Access Key, Secret, and Bucket")
        }
        return R2Config(
            accountId = accountId,
            accessKeyId = accessKeyId,
            secretAccessKey = secret,
            bucket = bucket,
            endpoint = endpointOverride.ifBlank { "https://$accountId.r2.cloudflarestorage.com" },
            prefix = prefix,
        )
    }

    override fun headersBuilder(): Headers.Builder = super.headersBuilder()
        .set("Accept", "application/json, text/html, */*;q=0.8")

    private fun r2Get(config: R2Config, key: String? = null, query: Map<String, String> = emptyMap()): Request {
        val url = presignGet(config, key, query, expiresSeconds = 900)
        return GET(url, headers)
    }

    private fun listAllKeys(config: R2Config, prefix: String): List<String> {
        val keys = mutableListOf<String>()
        var token: String? = null
        do {
            val query = linkedMapOf(
                "list-type" to "2",
                "max-keys" to "1000",
                "prefix" to prefix,
            )
            if (token != null) query["continuation-token"] = token
            val page = client.newCall(r2Get(config, query = query)).execute().use { response ->
                if (!response.isSuccessful && response.code !in 200..299) {
                    throw Exception("R2 list failed (${response.code})")
                }
                parseObjectKeys(response.body.string())
            }
            keys += page.keys
            token = page.nextToken
        } while (token != null)
        return keys
    }

    private fun listTitles(config: R2Config): List<TitleEntry> {
        val prefix = rootPrefix(config.prefix)
        var entries = titlesFromKeys(listAllKeys(config, prefix), config.prefix)
        if (entries.isEmpty() && prefix.isNotEmpty()) {
            entries = titlesFromKeys(listAllKeys(config, ""), "")
        }
        return entries
    }

    private fun mangaStatus(raw: String?): Int = when (raw?.lowercase()) {
        "ongoing", "1" -> SManga.ONGOING
        "completed", "2" -> SManga.COMPLETED
        "licensed", "3" -> SManga.LICENSED
        "publishing_finished", "publishing-finished", "4" -> SManga.PUBLISHING_FINISHED
        "cancelled", "canceled", "5" -> SManga.CANCELLED
        "hiatus", "on_hiatus", "on-hiatus", "6" -> SManga.ON_HIATUS
        else -> SManga.UNKNOWN
    }

    private fun toSManga(config: R2Config, entry: TitleEntry, details: DetailsFile? = null): SManga = SManga.create().apply {
        url = entry.id
        title = details?.title ?: entry.id
        thumbnail_url = when {
            entry.coverKey != null -> presignGet(config, entry.coverKey, expiresSeconds = 3600)
            details?.cover?.startsWith("http") == true -> details.cover
            else -> null
        }
        author = details?.author
        artist = details?.artist
        description = details?.summary
        genre = details?.genre
        status = mangaStatus(details?.status)
        initialized = details != null
    }

    private fun loadLibrary(query: String = ""): MangasPage {
        val config = config()
        val needle = query.trim().lowercase()
        val mangas = listTitles(config).map { toSManga(config, it) }.filter {
            needle.isEmpty() ||
                it.title.lowercase().contains(needle) ||
                it.url.lowercase().contains(needle)
        }
        return MangasPage(mangas, false)
    }

    override fun fetchPopularManga(page: Int): Observable<MangasPage> {
        if (page > 1) return Observable.just(MangasPage(emptyList(), false))
        return Observable.fromCallable { loadLibrary() }
    }

    override fun popularMangaRequest(page: Int): Request {
        val config = config()
        return r2Get(
            config,
            query = mapOf(
                "list-type" to "2",
                "max-keys" to "1000",
                "prefix" to rootPrefix(config.prefix),
            ),
        )
    }

    override fun popularMangaParse(response: Response): MangasPage {
        val config = config()
        val page = parseObjectKeys(response.use { it.body.string() })
        val mangas = titlesFromKeys(page.keys, config.prefix).map { toSManga(config, it) }
        return MangasPage(mangas, page.nextToken != null)
    }

    override fun latestUpdatesRequest(page: Int) = throw UnsupportedOperationException()
    override fun latestUpdatesParse(response: Response) = throw UnsupportedOperationException()

    override fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> {
        if (page > 1) return Observable.just(MangasPage(emptyList(), false))
        return Observable.fromCallable { loadLibrary(query) }
    }

    override fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request = popularMangaRequest(page)

    override fun searchMangaParse(response: Response): MangasPage = popularMangaParse(response)

    override fun mangaDetailsRequest(manga: SManga): Request {
        val config = config()
        return r2Get(config, key = "${rootPrefix(config.prefix)}${manga.url}/details.json")
    }

    override fun fetchMangaDetails(manga: SManga): Observable<SManga> = Observable.fromCallable {
        val config = config()
        val prefix = rootPrefix(config.prefix)
        val folderPrefix = "$prefix${manga.url}/"
        val folderKeys = listAllKeys(config, folderPrefix)
        val entry = titlesFromKeys(folderKeys, config.prefix).firstOrNull { it.id == manga.url }

        val details = if (entry?.detailsKey != null) {
            client.newCall(r2Get(config, key = entry.detailsKey)).execute().use { response ->
                if (response.isSuccessful) parseDetailsJson(response.body.string(), json) else null
            }
        } else {
            client.newCall(r2Get(config, key = "${folderPrefix}details.json")).execute().use { response ->
                if (response.isSuccessful) parseDetailsJson(response.body.string(), json) else null
            }
        }

        manga.apply {
            title = details?.title ?: title.ifBlank { url }
            description = details?.summary ?: description
            author = details?.author ?: author
            artist = details?.artist ?: artist
            genre = details?.genre ?: genre
            status = details?.status?.let { mangaStatus(it) } ?: status
            thumbnail_url = when {
                entry?.coverKey != null -> presignGet(config, entry.coverKey, expiresSeconds = 3600)
                details?.cover?.startsWith("http") == true -> details.cover
                else -> thumbnail_url
            }
            initialized = true
        }
    }

    override fun mangaDetailsParse(response: Response): SManga {
        val details = parseDetailsJson(response.use { it.body.string() }, json)
        return SManga.create().apply {
            title = details.title ?: "Untitled"
            description = details.summary
            author = details.author
            artist = details.artist
            genre = details.genre
            status = mangaStatus(details.status)
            if (details.cover?.startsWith("http") == true) {
                thumbnail_url = details.cover
            }
            initialized = true
        }
    }

    override fun chapterListRequest(manga: SManga): Request {
        val config = config()
        return r2Get(config, key = "${rootPrefix(config.prefix)}${manga.url}/chapters.json")
    }

    override fun chapterListParse(response: Response): List<SChapter> {
        val chapters = parseChaptersJson(response.use { it.body.string() }, json)
        return chapters.map { chapter ->
            SChapter.create().apply {
                url = chapter.url
                name = chapter.title
                chapter_number = chapter.number
                scanlator = chapter.scanlator
                date_upload = chapter.dateUpload
            }
        }
    }

    override fun pageListRequest(chapter: SChapter): Request {
        val url = chapter.url
        if (url.startsWith("pages:")) {
            throw Exception("Static page chapters must be opened through fetchPageList")
        }
        val site = identifySite(url)
        val remoteId = extractRemoteId(site, url)
        val target = pageListUrl(site, remoteId, url)
        return GET(target, headers.newBuilder().set("Referer", siteReferer(site)).build())
    }

    override fun fetchPageList(chapter: SChapter): Observable<List<Page>> {
        if (chapter.url.startsWith("pages:")) {
            val raw = String(
                Base64.decode(chapter.url.removePrefix("pages:"), Base64.URL_SAFE),
                Charsets.UTF_8,
            )
            val urls = json.decodeFromString(ListSerializer(String.serializer()), raw)
            return Observable.just(urls.mapIndexed { index, pageUrl -> Page(index, imageUrl = pageUrl) })
        }
        return client.newCall(pageListRequest(chapter)).asObservableSuccess().map { pageListParse(it) }
    }

    override fun pageListParse(response: Response): List<Page> {
        val requestUrl = response.request.url.toString()
        val body = response.use { it.body.string() }
        val host = hostOf(requestUrl)
        return when {
            host.contains("nhentai.net") && requestUrl.contains("/api/v2/galleries/") -> {
                val server = cachedNhServer ?: run {
                    val cfg = runCatching {
                        client.newCall(
                            GET("https://nhentai.net/api/v2/config", headers),
                        ).execute().use { it.body.string() }
                    }.getOrNull()
                    (cfg?.let { pickNhServer(it, json) } ?: pickNhServer("{}", json)).also {
                        cachedNhServer = it
                    }
                }
                parseNhentaiPages(body, json, server)
            }
            host.contains("hentairead.com") -> parseHentaiReadPages(body, requestUrl, json)
            host.contains("hentainexus.com") -> parseHentaiNexusPages(body, json)
            host.contains("hentai2read.com") -> parseHentai2ReadPages(body)
            else -> throw Exception("Don't know how to parse pages from $host")
        }
    }

    override fun imageUrlParse(response: Response) = throw UnsupportedOperationException()

    override fun imageRequest(page: Page): Request {
        val url = page.imageUrl ?: throw Exception("Missing page URL")
        val builder = headers.newBuilder()
            .set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        refererForImage(url)?.let { builder.set("Referer", it) }
        return GET(url, builder.build())
    }

    override fun setupPreferenceScreen(screen: PreferenceScreen) {
        fun field(key: String, title: String, summary: String, default: String = "", secret: Boolean = false) {
            EditTextPreference(screen.context).apply {
                this.key = key
                this.title = title
                this.summary = summary
                setDefaultValue(default)
                if (secret) {
                    setOnBindEditTextListener { edit ->
                        edit.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    }
                }
            }.also(screen::addPreference)
        }

        field(PREF_ACCOUNT, "Account ID", "Cloudflare account id")
        field(PREF_ACCESS_KEY, "Access Key ID", "R2 API token access key id")
        field(PREF_SECRET, "Secret Access Key", "R2 API token secret", secret = true)
        field(PREF_BUCKET, "Bucket", "R2 bucket name", default = "manga")
        field(PREF_ENDPOINT, "S3 Endpoint (optional)", "Blank = https://<accountId>.r2.cloudflarestorage.com")
        field(PREF_PREFIX, "Root Prefix", "Empty if title folders sit at bucket root")
    }

    companion object {
        private const val PREF_ACCOUNT = "accountId"
        private const val PREF_ACCESS_KEY = "accessKeyId"
        private const val PREF_SECRET = "secretAccessKey"
        private const val PREF_BUCKET = "bucket"
        private const val PREF_ENDPOINT = "endpoint"
        private const val PREF_PREFIX = "prefix"
    }
}
