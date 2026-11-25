package com.bspsms.android

import java.io.OutputStream
import java.nio.charset.StandardCharsets
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.math.roundToInt

data class SummativeTermMarks(
    val ben: String = "",
    val eng: String = "",
    val evs: String = "",
    val math: String = "",
    val health: String = "",
    val art: String = "",
    val total: String = ""
)

data class StudentSummativeResultRow(
    val rollNo: String,
    val studentName: String,
    val term1: SummativeTermMarks,
    val term2: SummativeTermMarks,
    val term3: SummativeTermMarks,
    val benTotal: String,
    val engTotal: String,
    val evsTotal: String,
    val mathTotal: String,
    val healthTotal: String,
    val artTotal: String,
    val grandTotal: String,
    val percentage: String,
    var position: String = ""
) {
    fun grandTotalNumeric(): Double {
        return grandTotal.toDoubleOrNull() ?: 0.0
    }
}

object ResultXlsxExporter {

    private val COLUMN_HEADERS = listOf(
        "ROLL NO",
        "STUDENT NAME",
        // 1ST SUMETIVE (20) -> indices 2..8
        "BEN", "ENG", "EVS", "MATH", "HEALTH", "ART", "TOTAL",
        // 2ND SUMETIVE (30) -> indices 9..15
        "BEN", "ENG", "EVS", "MATH", "HEALTH", "ART", "TOTAL",
        // 3RD SUMETIVE (50) -> indices 16..22
        "BEN", "ENG", "EVS", "MATH", "HEALTH", "ART", "TOTAL",
        // TOTAL -> indices 23..28
        "BN TOTAL", "EN TOTAL", "EV TOTAL", "MA TOTAL", "HE TOTAL", "AR TOTAL",
        // Summary -> indices 29..31
        "GRAND TOTAL",
        "PERSENTAGE",
        "POSITION"
    )

    fun recalculatePositions(rows: List<StudentSummativeResultRow>): List<StudentSummativeResultRow> {
        val ranked = rows
            .mapIndexed { idx, row -> idx to row.grandTotalNumeric() }
            .sortedByDescending { it.second }

        val result = rows.map { it.copy() }
        var currentRank = 0
        var lastScore = Double.NaN
        ranked.forEachIndexed { sortedPos, (origIdx, score) ->
            if (score <= 0.0) {
                if (result[origIdx].position.isBlank()) {
                    result[origIdx].position = ""
                }
            } else {
                if (lastScore.isNaN() || score != lastScore) {
                    currentRank = sortedPos + 1
                    lastScore = score
                }
                result[origIdx].position = currentRank.toString()
            }
        }
        return result
    }

    fun writeWorkbook(
        rowsInput: List<StudentSummativeResultRow>,
        sheetTitle: String = "Summative Evaluation",
        outStream: OutputStream
    ) {
        val rows = recalculatePositions(rowsInput)
        val cleanTitle = sheetTitle
            .replace(Regex("[:\\\\/?*\\[\\]]"), " ")
            .trim()
            .take(31)
            .ifBlank { "Summative Result" }

        ZipOutputStream(outStream).use { zip ->
            writeZipEntry(zip, "[Content_Types].xml", CONTENT_TYPES_XML)
            writeZipEntry(zip, "_rels/.rels", ROOT_RELS_XML)
            writeZipEntry(zip, "xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML)
            writeZipEntry(zip, "xl/workbook.xml", buildWorkbookXml(cleanTitle))
            writeZipEntry(zip, "xl/styles.xml", STYLES_XML)
            writeZipEntry(zip, "xl/worksheets/sheet1.xml", buildSheetXml(rows))
            zip.finish()
            zip.flush()
        }
    }

    private fun writeZipEntry(zip: ZipOutputStream, name: String, content: String) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(content.toByteArray(StandardCharsets.UTF_8))
        zip.closeEntry()
    }

    private fun buildWorkbookXml(sheetName: String): String {
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"""
    }

    private fun buildSheetXml(rows: List<StudentSummativeResultRow>): String {
        val sb = StringBuilder(16384)
        sb.append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        sb.append("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")

        // Freeze top 2 header rows + first 2 identity columns
        sb.append("""<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="2" ySplit="2" topLeftCell="C3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>""")

        // Column widths across 32 columns (A..AF)
        sb.append("<cols>")
        sb.append("""<col min="1" max="1" width="11" customWidth="1"/>""") // ROLL NO
        sb.append("""<col min="2" max="2" width="26" customWidth="1"/>""") // STUDENT NAME
        sb.append("""<col min="3" max="23" width="9" customWidth="1"/>""") // Term marks
        sb.append("""<col min="24" max="29" width="10.5" customWidth="1"/>""") // Subject totals
        sb.append("""<col min="30" max="32" width="13.5" customWidth="1"/>""") // Grand Total, Percentage, Position
        sb.append("</cols>")

        sb.append("<sheetData>")

        // Row 1: Grouped Super-Headers
        sb.append("""<row r="1" ht="24" customHeight="1">""")
        for (cIdx in 0 until 32) {
            val ref = "${colLetter(cIdx)}1"
            val (label, styleIdx) = when (cIdx) {
                0 -> "STUDENT DETAILS" to 1
                1 -> "" to 1
                2 -> "1ST SUMETIVE (20)" to 2
                in 3..8 -> "" to 2
                9 -> "2ND SUMETIVE (30)" to 3
                in 10..15 -> "" to 3
                16 -> "3RD SUMETIVE (50)" to 4
                in 17..22 -> "" to 4
                23 -> "TOTAL" to 5
                in 24..28 -> "" to 5
                29 -> "FINAL RESULT" to 1
                else -> "" to 1
            }
            sb.append(stringCell(ref, label, styleIdx))
        }
        sb.append("</row>")

        // Row 2: Exact Requested Column Headers
        sb.append("""<row r="2" ht="22" customHeight="1">""")
        COLUMN_HEADERS.forEachIndexed { cIdx, header ->
            val styleIdx = when (cIdx) {
                in 2..8 -> 2
                in 9..15 -> 3
                in 16..22 -> 4
                in 23..28 -> 5
                else -> 1
            }
            sb.append(stringCell("${colLetter(cIdx)}2", header, styleIdx))
        }
        sb.append("</row>")

        // Student rows (Row 3+)
        rows.forEachIndexed { idx, row ->
            val rNum = idx + 3
            sb.append("""<row r="$rNum" ht="19" customHeight="1">""")
            val vals = listOf(
                row.rollNo,
                row.studentName,
                row.term1.ben, row.term1.eng, row.term1.evs, row.term1.math, row.term1.health, row.term1.art, row.term1.total,
                row.term2.ben, row.term2.eng, row.term2.evs, row.term2.math, row.term2.health, row.term2.art, row.term2.total,
                row.term3.ben, row.term3.eng, row.term3.evs, row.term3.math, row.term3.health, row.term3.art, row.term3.total,
                row.benTotal, row.engTotal, row.evsTotal, row.mathTotal, row.healthTotal, row.artTotal,
                row.grandTotal,
                row.percentage,
                row.position
            )
            vals.forEachIndexed { cIdx, v ->
                val ref = "${colLetter(cIdx)}$rNum"
                val isBoldCol = cIdx == 8 || cIdx == 15 || cIdx == 22 || cIdx >= 29
                val style = if (cIdx == 1) 7 else if (isBoldCol) 8 else 6
                // Keep Roll No as text if zero-padded (e.g. "001") so Excel preserves leading zeros
                if (cIdx == 0 || cIdx == 1) {
                    sb.append(stringCell(ref, v, style))
                } else {
                    sb.append(autoNumericOrStringCell(ref, v, style))
                }
            }
            sb.append("</row>")
        }

        sb.append("</sheetData>")

        // Merged cells for super-header row 1
        sb.append("""<mergeCells count="6">""")
        sb.append("""<mergeCell ref="A1:B1"/>""")
        sb.append("""<mergeCell ref="C1:I1"/>""")
        sb.append("""<mergeCell ref="J1:P1"/>""")
        sb.append("""<mergeCell ref="Q1:W1"/>""")
        sb.append("""<mergeCell ref="X1:AC1"/>""")
        sb.append("""<mergeCell ref="AD1:AF1"/>""")
        sb.append("</mergeCells>")

        sb.append("</worksheet>")
        return sb.toString()
    }

    private fun stringCell(ref: String, value: String, style: Int): String {
        return """<c r="$ref" s="$style" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>"""
    }

    private fun autoNumericOrStringCell(ref: String, raw: String, style: Int): String {
        val clean = raw.trim()
        if (clean.isEmpty()) {
            return """<c r="$ref" s="$style" t="inlineStr"><is><t></t></is></c>"""
        }
        val num = clean.removeSuffix("%").trim().toDoubleOrNull()
        return if (num != null && num.isFinite() && !clean.endsWith("%")) {
            val formatted = if (num == num.roundToInt().toDouble()) {
                num.roundToInt().toString()
            } else {
                String.format(java.util.Locale.US, "%.2f", num)
            }
            """<c r="$ref" s="$style"><v>$formatted</v></c>"""
        } else {
            stringCell(ref, clean, style)
        }
    }

    private fun colLetter(index0: Int): String {
        var idx = index0
        val sb = StringBuilder()
        while (idx >= 0) {
            sb.insert(0, ('A' + (idx % 26)))
            idx = (idx / 26) - 1
        }
        return sb.toString()
    }

    private fun escapeXml(input: String): String {
        val sb = StringBuilder(input.length)
        for (ch in input) {
            when (ch) {
                '&' -> sb.append("&amp;")
                '<' -> sb.append("&lt;")
                '>' -> sb.append("&gt;")
                '"' -> sb.append("&quot;")
                '\'' -> sb.append("&apos;")
                else -> if (ch.code >= 0x20 || ch == '\n' || ch == '\r' || ch == '\t') {
                    sb.append(ch)
                }
            }
        }
        return sb.toString()
    }

    private const val CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

    private const val ROOT_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

    private const val WORKBOOK_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

    // Styles:
    // 0: default
    // 1: Dark Blue Header (#123B70, white bold, center)
    // 2: 1st Summative Header (#1D4ED8, white bold, center)
    // 3: 2nd Summative Header (#047857, white bold, center)
    // 4: 3rd Summative Header (#6D28D9, white bold, center)
    // 5: Subject Totals Header (#B45309, white bold, center)
    // 6: Data cell centered
    // 7: Data cell left-aligned (Student Name)
    // 8: Bold total/summary data cell centered
    private const val STYLES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF123B70"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF047857"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF6D28D9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
</styleSheet>"""
}
