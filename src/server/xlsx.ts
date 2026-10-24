interface ExportData {
  students: { id: number; first_name: string; last_name: string }[];
  subjects: string[];
  grades: Record<string, { avg: number; all: string }>;
  finals: Record<string, number>;
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colLetter(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

const crcTable: number[] = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable.push(c >>> 0);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files: { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    const nameBytes = encoder.encode(files[i].name);
    const data = encoder.encode(files[i].text);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const head = new Uint8Array(46 + nameBytes.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(8, 0x0800, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0, true);
    hv.setUint16(14, 0x21, true);
    hv.setUint32(16, crc, true);
    hv.setUint32(20, data.length, true);
    hv.setUint32(24, data.length, true);
    hv.setUint16(28, nameBytes.length, true);
    hv.setUint32(42, offset, true);
    head.set(nameBytes, 46);

    parts.push(local);
    parts.push(data);
    central.push(head);
    offset += local.length + data.length;
  }

  let centralSize = 0;
  for (let i = 0; i < central.length; i++) centralSize += central[i].length;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = parts.concat(central).concat([end]);
  let total = 0;
  for (let i = 0; i < all.length; i++) total += all[i].length;
  const result = new Uint8Array(total);
  let pos = 0;
  for (let i = 0; i < all.length; i++) {
    result.set(all[i], pos);
    pos += all[i].length;
  }
  return result;
}

export function buildXlsx(className: string, data: ExportData): Uint8Array {
  const strings: string[] = [];

  function stringIndex(text: string): number {
    let found = strings.indexOf(text);
    if (found === -1) {
      strings.push(text);
      found = strings.length - 1;
    }
    return found;
  }

  const rows: string[][] = [];
  const header: string[] = ["Учень"];
  for (let i = 0; i < data.subjects.length; i++) {
    header.push(data.subjects[i] + " (всі оцінки)");
    header.push(data.subjects[i] + " (сер. бал)");
    header.push(data.subjects[i] + " (підсумкова)");
  }
  header.push("Загальний середній");
  rows.push(header);

  for (let s = 0; s < data.students.length; s++) {
    const st = data.students[s];
    const row: string[] = [st.last_name + " " + st.first_name];
    const avgs: number[] = [];

    for (let j = 0; j < data.subjects.length; j++) {
      const subject = data.subjects[j];
      const key = st.id + "|" + subject;
      const g = data.grades[key];
      if (g) {
        row.push(g.all);
        row.push(g.avg.toFixed(1));
        avgs.push(g.avg);
      } else {
        row.push("—");
        row.push("—");
      }
      if (data.finals[key] !== undefined) {
        row.push(String(data.finals[key]));
      } else {
        row.push("—");
      }
    }

    if (avgs.length > 0) {
      let sum = 0;
      for (let k = 0; k < avgs.length; k++) sum += avgs[k];
      row.push((sum / avgs.length).toFixed(1));
    } else {
      row.push("—");
    }
    rows.push(row);
  }

  let sheetRows = "";
  for (let r = 0; r < rows.length; r++) {
    let cells = "";
    for (let c = 0; c < rows[r].length; c++) {
      const value = rows[r][c];
      const ref = colLetter(c) + (r + 1);
      if (value !== "—" && value !== "" && !isNaN(Number(value))) {
        cells += '<c r="' + ref + '" t="n"><v>' + value + "</v></c>";
      } else {
        cells += '<c r="' + ref + '" t="s"><v>' + stringIndex(value) + "</v></c>";
      }
    }
    sheetRows += '<row r="' + (r + 1) + '">' + cells + "</row>";
  }

  const lastCol = colLetter(rows[0].length - 1);
  const dimension = "A1:" + lastCol + rows.length;
  const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const sheetXml =
    xmlHead +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<dimension ref="' + dimension + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    "<sheetData>" + sheetRows + "</sheetData></worksheet>";

  let sstXml =
    xmlHead +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">';
  for (let i = 0; i < strings.length; i++) {
    sstXml += '<si><t xml:space="preserve">' + xmlEscape(strings[i]) + "</t></si>";
  }
  sstXml += "</sst>";

  let sheetName = (className + " — Оцінки").replace(/[\\\/?*\[\]:]/g, "");
  if (sheetName.length > 31) sheetName = sheetName.slice(0, 31);

  const workbook =
    xmlHead +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<fileVersion appName="xl" lastEdited="4" lowestEdited="4"/><workbookPr/>' +
    '<sheets><sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';

  const workbookRels =
    xmlHead +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    "</Relationships>";

  const packageRels =
    xmlHead +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const contentTypes =
    xmlHead +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    "</Types>";

  return makeZip([
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: packageRels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRels },
    { name: "xl/worksheets/sheet1.xml", text: sheetXml },
    { name: "xl/sharedStrings.xml", text: sstXml },
  ]);
}
