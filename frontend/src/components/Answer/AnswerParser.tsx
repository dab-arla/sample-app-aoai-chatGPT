import { cloneDeep } from 'lodash'
import DOMPurify from 'dompurify'
import { AskResponse, Citation, AzureSqlServerCodeExecResult } from '../../api'

export type ParsedAnswer = {
  citations: Citation[]
  markdownFormatText: string,
  plotly_data: AzureSqlServerCodeExecResult | null
}

// Helper function to truncate long citation content for the tooltip
const truncateContent = (content: string, maxLength = 100) => {
  const cleanContent = content.replace(/\s+/g, ' ').trim(); // Remove unnecessary spaces
  if (cleanContent.length > maxLength) {
    return cleanContent.slice(0, maxLength) + '...';
  }
  return cleanContent;
};

export const enumerateCitations = (citations: Citation[]) => {
  const filepathMap = new Map()
  for (const citation of citations) {
    const { filepath } = citation
    let part_i = 1
    if (filepathMap.has(filepath)) {
      part_i = filepathMap.get(filepath) + 1
    }
    filepathMap.set(filepath, part_i)
    citation.part_index = part_i
  }
  return citations
}

export function parseAnswer(answer: AskResponse): ParsedAnswer {
  let answerText = answer.answer
  const citationLinks = answerText.match(/\[(doc\d\d?\d?)]/g)

  const lengthDocN = '[doc'.length

  let filteredCitations = [] as Citation[]
  let citationReindex = 0
  citationLinks?.forEach(link => {
    // Replacing the links/citations with number
    const citationIndex = link.slice(lengthDocN, link.length - 1)
    const citation = cloneDeep(answer.citations[Number(citationIndex) - 1]) as Citation;

    if (!filteredCitations.find((c) => c.id === citationIndex) && citation) {
      citationReindex += 1;

// Sanitize the content for safe display, trimming very long content
const sanitizedContent = DOMPurify.sanitize(citation.content || '').slice(0, 300); // Limit tooltip length
      // const truncatedContent = truncateContent(sanitizedContent);

      // Replace citation reference in the answer text with a styled clickable span
      answerText = answerText.replaceAll(
        link,
        `<span class="citationLink" style="color: blue; cursor: pointer;" data-citation-index="${citationReindex}" title="${sanitizedContent}">[${citationReindex}]</span>`
      );

      citation.id = citationIndex; // original doc index to de-dupe
      citation.reindex_id = citationReindex.toString(); // reindex from 1 for display
      citation.content = citation.content; // Store the content in filteredCitations
      filteredCitations.push(citation);
    }
  });

  filteredCitations = enumerateCitations(filteredCitations)

  // Replace citation markers with clickable URLs or filenames
  filteredCitations.forEach((citation, index) => {
    const citationDisplayIndex = `[${index + 1}]`;

    // If extracted_url exists, make it clickable
    if (citation.extracted_url) {
      answerText = answerText.replace(
        citationDisplayIndex,
        `<a href="${citation.extracted_url}" title="${DOMPurify.sanitize(citation.content || '').slice(0, 300)}..." style="color: blue;" target="_blank">${citationDisplayIndex}</a>`
      );
    } else {
      // For non-web citations, just display citation index (e.g., [1])
      answerText = answerText.replace(
        citationDisplayIndex,
        `<span title="${DOMPurify.sanitize(citation.content || '').slice(0, 300)}..." style="color: blue; cursor: pointer;">${citationDisplayIndex}</span>`
      );
    }
  });

  return {
    citations: filteredCitations,
    markdownFormatText: answerText,
    plotly_data: answer.plotly_data
  }
}
