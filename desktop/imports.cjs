'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_LENGTH = 200_000;
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.docx', '.pdf']);
let pdfModulePromise;

function cleanText(text) {
  return text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
}

function checkLength(text) {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error('This document contains too much text. Import a sample of up to 200,000 characters.');
  }
}

async function readPdf(bytes) {
  // Text extraction does not need a native canvas. Supply the pure-JavaScript
  // matrix class so the same package runs on Windows, Intel Macs and Apple silicon.
  if (!globalThis.DOMMatrix) {
    const matrix = await import('@thednp/dommatrix');
    globalThis.DOMMatrix = matrix.default;
  }
  pdfModulePromise ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfModulePromise;
  const pdfDirectory = path.dirname(require.resolve('pdfjs-dist/package.json'));
  let loadingTask;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      useWorkerFetch: false,
      cMapUrl: path.join(pdfDirectory, 'cmaps').replaceAll('\\', '/') + '/',
      cMapPacked: true,
      standardFontDataUrl: path.join(pdfDirectory, 'standard_fonts').replaceAll('\\', '/') + '/',
      wasmUrl: path.join(pdfDirectory, 'wasm').replaceAll('\\', '/') + '/',
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    if (document.numPages > 500) {
      throw new Error('This PDF is too long. Import a sample of up to 500 pages.');
    }
    const pages = [];
    let totalLength = 0;
    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex++) {
      const page = await document.getPage(pageIndex);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      pageText = pageText.replace(/[ \t]+\n/g, '\n').trim();
      totalLength += pageText.length + 2;
      if (totalLength > MAX_TEXT_LENGTH) {
        throw new Error('This document contains too much text. Import a sample of up to 200,000 characters.');
      }
      pages.push(pageText);
      page.cleanup();
    }
    const text = pages.join('\n\n').trim();
    if (!text) {
      throw new Error('No readable text was found in this PDF. Scanned PDFs need OCR before import; NaturalWrite does not perform OCR.');
    }
    return text;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('This PDF is password protected. Save an unlocked copy before importing it.');
    }
    if (error?.name === 'InvalidPDFException' || error?.name === 'UnknownErrorException') {
      throw new Error('This PDF could not be read. Check that it opens correctly in a PDF reader.');
    }
    throw error;
  } finally {
    if (loadingTask) await loadingTask.destroy();
  }
}

async function extractDocument(filePath) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('Choose a document to import.');
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported document. Choose a PDF, DOCX, TXT or Markdown file.');
  }
  const info = await fs.stat(filePath);
  if (!info.isFile()) throw new Error('Choose a document file to import.');
  if (info.size > MAX_FILE_BYTES) throw new Error('This file is too large. Import a document smaller than 15 MB.');
  const bytes = await fs.readFile(filePath);
  let text;
  if (extension === '.pdf') {
    text = await readPdf(bytes);
  } else if (extension === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value;
    } catch {
      throw new Error('This DOCX file could not be read. Save a valid .docx copy in your word processor and try again.');
    }
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('This text file is not UTF-8. Save it with UTF-8 encoding and try again.');
    }
  }
  text = cleanText(text);
  checkLength(text);
  if (!text) throw new Error('This document is empty. Add some writing before importing it.');
  return { name: path.basename(filePath), text };
}

module.exports = { extractDocument, MAX_FILE_BYTES, MAX_TEXT_LENGTH };
