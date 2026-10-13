import { DEFAULT_CHUNK_SIZE_WORDS, DEFAULT_CHUNK_OVERLAP_WORDS } from '../../constants';

export interface ChunkOutput {
  text: string;
  wordCount: number;
  page: number;
}

/**
 * Clean raw text by normalizing unicode quotes, removing strange control characters,
 * and consolidating multiple blank lines.
 */
export function cleanText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t\f]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\n\u00A0-\u024F\u0900-\u097F]/g, ' ') // preserves Latin & Devanagari Hindi
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Paragraph-aware chunking with word count target and overlap.
 * Splits text into paragraphs, builds chunks up to targetWords, and carries over
 * overlapWords to ensure continuity across boundaries.
 */
export function chunkText(
  text: string,
  targetWords: number = DEFAULT_CHUNK_SIZE_WORDS,
  overlapWords: number = DEFAULT_CHUNK_OVERLAP_WORDS,
  pageNumber: number = 1
): ChunkOutput[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: ChunkOutput[] = [];
  let currentChunkWords: string[] = [];

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean);

    // If paragraph itself is longer than targetWords, break it into sentence-aware blocks
    if (paraWords.length > targetWords * 1.5) {
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [para];
      for (const sent of sentences) {
        const sentWords = sent.trim().split(/\s+/).filter(Boolean);
        if (currentChunkWords.length + sentWords.length > targetWords && currentChunkWords.length >= targetWords * 0.7) {
          chunks.push({
            text: currentChunkWords.join(' '),
            wordCount: currentChunkWords.length,
            page: pageNumber,
          });
          // Retain overlap from end of chunk
          currentChunkWords = currentChunkWords.slice(-overlapWords).concat(sentWords);
        } else {
          currentChunkWords.push(...sentWords);
        }
      }
    } else {
      if (currentChunkWords.length + paraWords.length > targetWords && currentChunkWords.length >= targetWords * 0.7) {
        chunks.push({
          text: currentChunkWords.join(' '),
          wordCount: currentChunkWords.length,
          page: pageNumber,
        });
        currentChunkWords = currentChunkWords.slice(-overlapWords).concat(paraWords);
      } else {
        currentChunkWords.push(...paraWords);
      }
    }
  }

  // Final remaining chunk
  if (currentChunkWords.length > 0) {
    chunks.push({
      text: currentChunkWords.join(' '),
      wordCount: currentChunkWords.length,
      page: pageNumber,
    });
  }

  return chunks;
}
