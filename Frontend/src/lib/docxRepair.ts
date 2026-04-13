import JSZip from 'jszip';

/**
 * Detects and repairs DOCX structure issues that cause selection/formatting problems.
 * Common issues:
 * - Empty paragraphs with no text runs
 * - Malformed paragraph nesting
 * - Text runs outside of paragraphs
 * - Excessive hidden paragraph breaks
 */

interface DocxRepairResult {
  repaired: boolean;
  issues: string[];
  originalSize: number;
  repairedSize: number;
}

/**
 * Fixes missing spaces between text runs in DOCX documents.
 * This is a common issue where consecutive text runs (words) are not separated by space runs.
 * Pattern: <w:r><w:t>Word1</w:t></w:r><w:r><w:t>Word2</w:t></w:r>
 * Fixed to: <w:r><w:t>Word1</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>Word2</w:t></w:r>
 */
function fixMissingSpacesBetweenRuns(docContent: string): { content: string; spacesAdded: number } {
  let spacesAdded = 0;
  
  // Strategy 1: Fix text runs that are directly adjacent (most common case)
  // This handles: </w:t></w:r><w:r><w:t>NextWord
  const directRunPattern = /(<w:t(?:\s[^>]*)?>(?:[^<])*?<\/w:t><\/w:r>)(<w:r>(?![\s\S]*?<w:br\/?>)[\s\S]*?<w:t(?:\s[^>]*)?>)/g;
  
  // Check if the next run is not starting with punctuation that shouldn't have space
  docContent = docContent.replace(directRunPattern, (match, closeRun, openRun) => {
    // Extract the first character of the next text content
    const nextCharMatch = openRun.match(/<w:t[^>]*>([^\s])/);
    if (!nextCharMatch) return match;
    
    const nextChar = nextCharMatch[1];
    
    // Don't add space before these punctuation marks
    const noSpaceBefore = /[.,;:!?)\]}-\u2014]/;
    
    if (!noSpaceBefore.test(nextChar)) {
      spacesAdded++;
      return `${closeRun}<w:r><w:t xml:space="preserve"> </w:t></w:r>${openRun}`;
    }
    
    return match;
  });
  
  return { content: docContent, spacesAdded };
}

export async function repairDocxStructure(blob: Blob): Promise<{ blob: Blob; result: DocxRepairResult }> {
  const result: DocxRepairResult = {
    repaired: false,
    issues: [],
    originalSize: blob.size,
    repairedSize: 0,
  };

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    const documentFile = zip.file('word/document.xml');
    if (!documentFile) {
      result.issues.push('Missing word/document.xml');
      return { blob, result };
    }

    let docContent = await documentFile.async('text');
    let hasRepairs = false;

    // CRITICAL FIX: Fix missing spaces between consecutive text runs (HIGH PRIORITY)
    const spaceFixResult = fixMissingSpacesBetweenRuns(docContent);
    if (spaceFixResult.spacesAdded > 0) {
      docContent = spaceFixResult.content;
      result.issues.push(`✓ Restored ${spaceFixResult.spacesAdded} missing spaces between words`);
      hasRepairs = true;
      console.log(`[docxRepair] Fixed ${spaceFixResult.spacesAdded} missing spaces`);
    }

    // Issue 2: Empty paragraphs with no text runs (LOWER PRIORITY)
    // Only remove EXCESSIVE empty paragraphs (more than 10% of total)
    const emptyParagraphPattern = /<w:p>(\s*<w:pPr>[\s\S]*?<\/w:pPr>)?\s*<\/w:p>/g;
    const totalParagraphs = (docContent.match(/<w:p>/g) || []).length;
    const emptyMatches = docContent.match(emptyParagraphPattern) || [];
    
    // Only repair if MORE than 50% are empty (very excessive)
    if (emptyMatches.length > totalParagraphs * 0.5 && totalParagraphs > 20) {
      result.issues.push(`Found ${emptyMatches.length}/${totalParagraphs} empty paragraphs (${((emptyMatches.length / totalParagraphs) * 100).toFixed(1)}%)`);
      // Only remove the most excessive cases
      let removeCount = 0;
      const maxRemove = Math.floor(emptyMatches.length * 0.3); // Only remove 30% of empty paragraphs
      docContent = docContent.replace(emptyParagraphPattern, () => {
        if (removeCount < maxRemove) {
          removeCount++;
          return ''; // Remove only most excessive ones
        }
        return emptyMatches[0] || ''; // Keep the rest
      });
      hasRepairs = true;
    }

    // Regenerate DOCX if any repairs were made
    if (hasRepairs) {
      zip.file('word/document.xml', docContent);

      const newArrayBuffer = await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const newBlob = new Blob([newArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      result.repairedSize = newBlob.size;
      result.issues.push(`Repaired document (size: ${(result.originalSize / 1024).toFixed(2)}KB → ${(result.repairedSize / 1024).toFixed(2)}KB)`);
      result.repaired = true;

      return { blob: newBlob, result };
    }

    // No repairs needed
    result.repairedSize = blob.size;
    return { blob, result };
  } catch (error) {
    result.issues.push(`Repair failed: ${error instanceof Error ? error.message : String(error)}`);
    return { blob, result };
  }
}

export function logRepairResult(filename: string, result: DocxRepairResult): void {
  if (result.issues.length === 0) {
    console.log(`✓ ${filename}: No structure issues found`);
    return;
  }

  console.group(`📋 Document Structure Analysis: ${filename}`);
  result.issues.forEach((issue) => {
    if (result.repaired && issue.includes('Repaired')) {
      console.log(`✓ ${issue}`);
    } else if (issue.includes('WARNING')) {
      console.warn(`⚠️ ${issue}`);
    } else {
      console.log(`ℹ️ ${issue}`);
    }
  });
  if (result.repaired) {
    console.log(`Status: Document was repaired`);
    console.log(`Original size: ${(result.originalSize / 1024).toFixed(2)} KB`);
    console.log(`Repaired size: ${(result.repairedSize / 1024).toFixed(2)} KB`);
  } else {
    console.log(`Status: No repairs applied`);
  }
  console.groupEnd();
}
