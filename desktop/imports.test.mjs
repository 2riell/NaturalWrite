import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import imports from './imports.cjs';

const { extractDocument, MAX_TEXT_LENGTH } = imports;
let directory;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'naturalwrite-import-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
async function fixture(name, contents) {
  const file = path.join(directory, name);
  await writeFile(file, contents);
  return file;
}

// A tiny ZIP fixture builder avoids requiring a test-only archiving dependency.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(filename), bytes = Buffer.from(value), checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(checksum, 16); entry.writeUInt32LE(bytes.length, 20);
    entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42); central.push(entry, name);
    offset += header.length + name.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function pdf(text = 'A personal writing sample.') {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return result;
}

describe('document import', () => {
  it('normalizes UTF-8 TXT and Markdown without discarding paragraphs or Unicode', async () => {
    for (const extension of ['TXT', 'md', 'markdown']) {
      const filename = await fixture(`sample.${extension}`, '\uFEFFMy own words — café.\r\n\r\nAnother paragraph.\r\n');
      expect(await extractDocument(filename)).toEqual({ name: `sample.${extension}`, text: 'My own words — café.\n\nAnother paragraph.' });
    }
  });
  it('extracts real DOCX paragraphs', async () => {
    const file = await fixture('sample.docx', zip({
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>My first paragraph.</w:t></w:r></w:p><w:p><w:r><w:t>My next paragraph.</w:t></w:r></w:p></w:body></w:document>',
    }));
    expect((await extractDocument(file)).text).toBe('My first paragraph.\n\nMy next paragraph.');
  });
  it('extracts actual PDF text without the optional native canvas package', async () => {
    const file = await fixture('sample.pdf', pdf());
    const originalLoad = Module._load;
    let nativeCanvasWasBlocked = false;
    Module._load = function(name, ...rest) {
      if (name === '@napi-rs/canvas') {
        nativeCanvasWasBlocked = true;
        throw new Error('Native canvas deliberately unavailable');
      }
      return originalLoad.call(this, name, ...rest);
    };
    try {
      expect((await extractDocument(file)).text).toBe('A personal writing sample.');
      expect(nativeCanvasWasBlocked).toBe(true);
    } finally {
      Module._load = originalLoad;
    }
  });
  it('explains why scanned or empty PDFs cannot be imported', async () => {
    const file = await fixture('scanned.pdf', pdf(''));
    await expect(extractDocument(file)).rejects.toThrow(/OCR/);
  });
  it('rejects unsupported, malformed, empty, non-UTF8 and oversized text inputs', async () => {
    await expect(extractDocument(await fixture('image.png', 'image'))).rejects.toThrow(/Unsupported/);
    await expect(extractDocument(await fixture('broken.docx', 'not a zip'))).rejects.toThrow(/could not be read/);
    await expect(extractDocument(await fixture('broken.pdf', 'not a PDF'))).rejects.toThrow(/could not be read/);
    await expect(extractDocument(await fixture('empty.txt', ' \n '))).rejects.toThrow(/empty/);
    await expect(extractDocument(await fixture('legacy.txt', Buffer.from([0xff, 0xfe, 0x41])))).rejects.toThrow(/UTF-8/);
    await expect(extractDocument(await fixture('long.txt', 'a'.repeat(MAX_TEXT_LENGTH + 1)))).rejects.toThrow(/too much text/);
  });
});
