package eu.kanade.tachiyomi.extension.all.r2merge

import kotlinx.serialization.Serializable

@Serializable
internal class ChaikaZipImage(
    val url: String,
    val name: String,
    val offset: Long,
    val compressedSize: Long,
    val method: Int,
)

internal val CHAIKA_IMAGE_EXT = setOf("jpg", "jpeg", "png", "webp", "gif", "avif", "bmp")

internal fun isChaikaImageEntry(name: String): Boolean {
    if (name.endsWith("/")) return false
    if (name.startsWith("__MACOSX/") || name.split('/').any { it.startsWith('.') }) return false
    val ext = name.substringAfterLast('.', missingDelimiterValue = "").lowercase()
    return ext in CHAIKA_IMAGE_EXT
}
