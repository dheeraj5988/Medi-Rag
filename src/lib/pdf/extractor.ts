import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (err) {
    console.warn('PDF worker setup error:', err);
  }
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PDFExtractionResult {
  pages: ExtractedPage[];
  totalPages: number;
  totalText: string;
  isScannedWarning: boolean;
}

/**
 * Extracts text from an ArrayBuffer of a PDF document page by page.
 * Detects if the PDF has virtually no extractable text (scanned PDF warning).
 */
export async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<PDFExtractionResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: true,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages: ExtractedPage[] = [];
  let fullText = '';

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);

    const pageText = pageStrings.join(' ');
    pages.push({
      pageNumber: i,
      text: pageText,
    });
    fullText += pageText + '\n\n';
  }

  const isScannedWarning = fullText.trim().length < 50 && numPages > 0;

  return {
    pages,
    totalPages: numPages,
    totalText: fullText.trim(),
    isScannedWarning,
  };
}
