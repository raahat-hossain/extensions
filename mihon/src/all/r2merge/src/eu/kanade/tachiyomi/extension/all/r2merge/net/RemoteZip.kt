package eu.kanade.tachiyomi.extension.all.r2merge.net

import okhttp3.CacheControl
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.zip.Inflater

data class RemoteZipEntry(
    val name: String,
    val method: Int,
    val compressedSize: Long,
    val size: Long,
    val headerOffset: Long,
)

/**
 * Reads a ZIP/CBZ that lives in object storage without downloading the whole
 * file: HTTP range requests pull the central directory, then just the bytes of
 * whichever entry is being displayed.
 *
 * One instance is bound to one object and caches its directory, so paging
 * through a chapter costs a single range request per image.
 */
class RemoteZip(
    private val client: OkHttpClient,
    private val url: HttpUrl,
) {
    @Volatile
    private var cachedEntries: List<RemoteZipEntry>? = null

    /**
     * Set when the host ignores `Range` and hands back the whole archive. Keeping
     * it means the rest of the chapter is served from memory instead of
     * re-downloading the file once per page.
     */
    @Volatile
    private var wholeFile: ByteArray? = null

    @Synchronized
    fun entries(): List<RemoteZipEntry> {
        cachedEntries?.let { return it }

        val tail = fetchTail(TAIL_BYTES)
        val eocdIndex = findEndOfCentralDirectory(tail.bytes)
            ?: throw IOException(
                "Not a valid zip/cbz archive (no end-of-central-directory record found).",
            )

        var totalEntries = tail.bytes.u16(eocdIndex + 10).toLong()
        var directorySize = tail.bytes.u32(eocdIndex + 12)
        var directoryOffset = tail.bytes.u32(eocdIndex + 16)

        if (totalEntries == 0xFFFFL || directoryOffset == 0xFFFFFFFFL || directorySize == 0xFFFFFFFFL) {
            val zip64 = readZip64(tail, eocdIndex)
            totalEntries = zip64.first
            directorySize = zip64.second
            directoryOffset = zip64.third
        }

        if (directorySize <= 0 || directorySize > MAX_DIRECTORY_BYTES) {
            throw IOException("Unsupported archive: central directory is $directorySize bytes.")
        }

        // The directory usually sits inside the tail we already downloaded.
        val directory = tail.slice(directoryOffset, directorySize.toInt())
            ?: fetchRange(directoryOffset, directoryOffset + directorySize - 1)

        val entries = parseDirectory(directory, totalEntries)
        cachedEntries = entries
        return entries
    }

    fun read(entry: RemoteZipEntry): ByteArray {
        if (entry.compressedSize > MAX_ENTRY_BYTES || entry.size > MAX_ENTRY_BYTES) {
            throw IOException("Archive entry ${entry.name} is too large to display.")
        }

        // Grab the local header and the payload in one request. The local extra
        // field is a different length from the central one, so a little slack is
        // read past the header and the real data offset is resolved from it.
        val nameLength = entry.name.toByteArray(Charsets.UTF_8).size
        val optimisticLength = LOCAL_HEADER_BYTES + nameLength + LOCAL_EXTRA_SLACK + entry.compressedSize
        val head = fetchRange(entry.headerOffset, entry.headerOffset + optimisticLength - 1)

        if (head.size < LOCAL_HEADER_BYTES || head.u32(0) != LOCAL_HEADER_SIGNATURE) {
            throw IOException("Corrupt archive: bad local header for ${entry.name}.")
        }

        val localNameLength = head.u16(26)
        val localExtraLength = head.u16(28)
        val dataStart = LOCAL_HEADER_BYTES + localNameLength + localExtraLength
        val dataEnd = dataStart + entry.compressedSize

        val compressed = if (dataEnd <= head.size) {
            head.copyOfRange(dataStart, dataEnd.toInt())
        } else {
            // Unusually large local extra field; fetch the exact range instead.
            val absoluteStart = entry.headerOffset + dataStart
            fetchRange(absoluteStart, absoluteStart + entry.compressedSize - 1)
        }

        return when (entry.method) {
            METHOD_STORED -> compressed
            METHOD_DEFLATED -> inflate(compressed, entry.size)
            else -> throw IOException(
                "Archive entry ${entry.name} uses unsupported compression method ${entry.method}.",
            )
        }
    }

    private fun readZip64(tail: Tail, eocdIndex: Int): Triple<Long, Long, Long> {
        val locatorIndex = eocdIndex - ZIP64_LOCATOR_BYTES
        if (locatorIndex < 0 || tail.bytes.u32(locatorIndex) != ZIP64_LOCATOR_SIGNATURE) {
            throw IOException("Corrupt archive: zip64 marker present but locator is missing.")
        }
        val zip64Offset = tail.bytes.u64(locatorIndex + 8)

        val record = tail.slice(zip64Offset, ZIP64_EOCD_BYTES)
            ?: fetchRange(zip64Offset, zip64Offset + ZIP64_EOCD_BYTES - 1)
        if (record.size < ZIP64_EOCD_BYTES || record.u32(0) != ZIP64_EOCD_SIGNATURE) {
            throw IOException("Corrupt archive: bad zip64 end-of-central-directory record.")
        }

        return Triple(record.u64(32), record.u64(40), record.u64(48))
    }

    private fun parseDirectory(directory: ByteArray, totalEntries: Long): List<RemoteZipEntry> {
        val entries = ArrayList<RemoteZipEntry>(totalEntries.coerceIn(0, 4096).toInt())
        var offset = 0

        while (offset + CENTRAL_HEADER_BYTES <= directory.size &&
            directory.u32(offset) == CENTRAL_HEADER_SIGNATURE
        ) {
            val method = directory.u16(offset + 10)
            var compressedSize = directory.u32(offset + 20)
            var size = directory.u32(offset + 24)
            val nameLength = directory.u16(offset + 28)
            val extraLength = directory.u16(offset + 30)
            val commentLength = directory.u16(offset + 32)
            var headerOffset = directory.u32(offset + 42)

            val nameStart = offset + CENTRAL_HEADER_BYTES
            if (nameStart + nameLength > directory.size) break
            val name = String(directory, nameStart, nameLength, Charsets.UTF_8)

            if (compressedSize == 0xFFFFFFFFL || size == 0xFFFFFFFFL || headerOffset == 0xFFFFFFFFL) {
                val zip64 = readZip64Extra(
                    directory,
                    nameStart + nameLength,
                    extraLength,
                    needSize = size == 0xFFFFFFFFL,
                    needCompressed = compressedSize == 0xFFFFFFFFL,
                    needOffset = headerOffset == 0xFFFFFFFFL,
                )
                zip64.size?.let { size = it }
                zip64.compressedSize?.let { compressedSize = it }
                zip64.headerOffset?.let { headerOffset = it }
            }

            if (!name.endsWith("/")) {
                entries += RemoteZipEntry(name, method, compressedSize, size, headerOffset)
            }
            offset = nameStart + nameLength + extraLength + commentLength
        }
        return entries
    }

    private class Zip64Extra(
        val size: Long?,
        val compressedSize: Long?,
        val headerOffset: Long?,
    )

    private fun readZip64Extra(
        buffer: ByteArray,
        extraStart: Int,
        extraLength: Int,
        needSize: Boolean,
        needCompressed: Boolean,
        needOffset: Boolean,
    ): Zip64Extra {
        var cursor = extraStart
        val end = minOf(extraStart + extraLength, buffer.size)

        while (cursor + 4 <= end) {
            val headerId = buffer.u16(cursor)
            val fieldLength = buffer.u16(cursor + 2)
            val fieldStart = cursor + 4
            if (headerId == ZIP64_EXTRA_ID) {
                // Present in a fixed order, but only for the fields that overflowed.
                var field = fieldStart
                var size: Long? = null
                var compressed: Long? = null
                var offset: Long? = null
                if (needSize && field + 8 <= end) {
                    size = buffer.u64(field)
                    field += 8
                }
                if (needCompressed && field + 8 <= end) {
                    compressed = buffer.u64(field)
                    field += 8
                }
                if (needOffset && field + 8 <= end) {
                    offset = buffer.u64(field)
                }
                return Zip64Extra(size, compressed, offset)
            }
            cursor = fieldStart + fieldLength
        }
        return Zip64Extra(null, null, null)
    }

    private fun inflate(compressed: ByteArray, expectedSize: Long): ByteArray {
        val inflater = Inflater(true)
        try {
            inflater.setInput(compressed)
            val out = ByteArrayOutputStream(
                expectedSize.coerceIn(1024, MAX_ENTRY_BYTES).toInt(),
            )
            val buffer = ByteArray(32 * 1024)
            while (!inflater.finished()) {
                val produced = inflater.inflate(buffer)
                if (produced == 0 && (inflater.needsInput() || inflater.needsDictionary())) break
                out.write(buffer, 0, produced)
            }
            return out.toByteArray()
        } finally {
            inflater.end()
        }
    }

    private class Tail(val bytes: ByteArray, val start: Long) {
        /** Returns the requested absolute range if it is already in this buffer. */
        fun slice(absoluteOffset: Long, length: Int): ByteArray? {
            val relative = absoluteOffset - start
            if (relative < 0 || relative + length > bytes.size) return null
            return bytes.copyOfRange(relative.toInt(), (relative + length).toInt())
        }
    }

    private fun fetchTail(maxBytes: Int): Tail {
        val request = Request.Builder()
            .url(url)
            .header("Range", "bytes=-$maxBytes")
            .cacheControl(CacheControl.FORCE_NETWORK)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Could not read archive (HTTP ${response.code}).")
            }
            if (response.code == 200) {
                // Range ignored: this is the whole archive, not the tail.
                rejectIfTooLargeToHold(response.body!!.contentLength())
                val bytes = response.body!!.bytes()
                rejectIfTooLargeToHold(bytes.size.toLong())
                wholeFile = bytes
                return Tail(bytes, 0L)
            }
            val bytes = response.body!!.bytes()
            val start = response.header("Content-Range")
                ?.substringAfter("bytes ", "")
                ?.substringBefore('-', "")
                ?.trim()
                ?.toLongOrNull()
                ?: 0L
            return Tail(bytes, start)
        }
    }

    private fun fetchRange(start: Long, endInclusive: Long): ByteArray {
        wholeFile?.let { return it.sliceRange(start, endInclusive) }

        val request = Request.Builder()
            .url(url)
            .header("Range", "bytes=$start-$endInclusive")
            .cacheControl(CacheControl.FORCE_NETWORK)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Could not read archive range (HTTP ${response.code}).")
            }
            val bytes = response.body!!.bytes()
            if (response.code != 206) {
                // Range ignored again; slice locally and keep it for the rest.
                rejectIfTooLargeToHold(bytes.size.toLong())
                wholeFile = bytes
                return bytes.sliceRange(start, endInclusive)
            }
            return bytes
        }
    }

    private fun ByteArray.sliceRange(start: Long, endInclusive: Long): ByteArray {
        val from = start.coerceIn(0L, size.toLong()).toInt()
        val to = (endInclusive + 1).coerceIn(from.toLong(), size.toLong()).toInt()
        return copyOfRange(from, to)
    }

    private fun rejectIfTooLargeToHold(bytes: Long) {
        if (bytes in 1..MAX_WHOLE_FILE_BYTES) return
        if (bytes <= 0) return // length unknown; the size check after reading covers it
        throw IOException(
            "The host serving this archive ignores range requests, so the whole " +
                "${bytes / 1024 / 1024} MB would have to be downloaded to show a single page. " +
                "Host it somewhere that supports range requests, or unpack it into a " +
                "folder of images.",
        )
    }

    private companion object {
        const val TAIL_BYTES = 128 * 1024
        const val MAX_DIRECTORY_BYTES = 32L * 1024 * 1024
        const val MAX_ENTRY_BYTES = 128L * 1024 * 1024

        /** How much of a range-less host's archive is worth holding in memory. */
        const val MAX_WHOLE_FILE_BYTES = 24L * 1024 * 1024

        const val EOCD_SIGNATURE = 0x06054B50L
        const val CENTRAL_HEADER_SIGNATURE = 0x02014B50L
        const val LOCAL_HEADER_SIGNATURE = 0x04034B50L
        const val ZIP64_LOCATOR_SIGNATURE = 0x07064B50L
        const val ZIP64_EOCD_SIGNATURE = 0x06064B50L

        const val CENTRAL_HEADER_BYTES = 46
        const val EOCD_MIN_BYTES = 22
        const val LOCAL_HEADER_BYTES = 30
        const val ZIP64_LOCATOR_BYTES = 20
        const val ZIP64_EOCD_BYTES = 56
        const val ZIP64_EXTRA_ID = 0x0001
        const val LOCAL_EXTRA_SLACK = 512

        const val METHOD_STORED = 0
        const val METHOD_DEFLATED = 8

        fun ByteArray.u16(offset: Int): Int = (this[offset].toInt() and 0xFF) or ((this[offset + 1].toInt() and 0xFF) shl 8)

        fun ByteArray.u32(offset: Int): Long = u16(offset).toLong() or (u16(offset + 2).toLong() shl 16)

        fun ByteArray.u64(offset: Int): Long = u32(offset) or (u32(offset + 4) shl 32)

        /**
         * Locates the end-of-central-directory record, scanning backwards from
         * the end of the file.
         *
         * The signature can also occur by chance inside the archive comment
         * that follows the record, so a candidate is only accepted when its
         * declared comment length runs exactly to the end of the file. The last
         * candidate found is kept as a fallback for archives whose comment
         * length is wrong.
         */
        fun findEndOfCentralDirectory(buffer: ByteArray): Int? {
            var fallback: Int? = null
            for (index in buffer.size - EOCD_MIN_BYTES downTo 0) {
                if (buffer.u32(index) != EOCD_SIGNATURE) continue
                if (fallback == null) fallback = index
                val commentLength = buffer.u16(index + 20)
                if (index + EOCD_MIN_BYTES + commentLength == buffer.size) return index
            }
            return fallback
        }
    }
}
