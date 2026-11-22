import React from 'react';

export interface EditorialBlock {
  type: 'h2' | 'h3' | 'p';
  text: string;
}

/**
 * Parses editorial plain text / lightweight markdown headings (`##`, `###`) into
 * structured blocks so React escapes all text nodes natively without raw HTML injection.
 */
export function parseEditorialBlocks(body: string): EditorialBlock[] {
  if (!body || typeof body !== 'string') return [];

  const normalized = body.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks: EditorialBlock[] = [];
  const paragraphs = normalized.split(/\n{2,}/);

  for (const rawBlock of paragraphs) {
    const lines = rawBlock.split('\n');
    let currentParagraphLines: string[] = [];

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        blocks.push({ type: 'p', text: currentParagraphLines.join('\n') });
        currentParagraphLines = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) {
        flushParagraph();
        blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      } else if (trimmed.startsWith('## ')) {
        flushParagraph();
        blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      } else {
        currentParagraphLines.push(line);
      }
    }

    flushParagraph();
  }

  return blocks;
}

interface SafeEditorialBodyProps {
  body: string;
}

export function SafeEditorialBody({ body }: SafeEditorialBodyProps) {
  const blocks = parseEditorialBlocks(body);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'h2') {
          return (
            <h2
              key={`h2-${index}`}
              className="font-editorial text-2xl font-bold text-[#111111] mt-8 mb-4"
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === 'h3') {
          return (
            <h3
              key={`h3-${index}`}
              className="font-editorial text-xl font-bold text-[#111111] mt-6 mb-3"
            >
              {block.text}
            </h3>
          );
        }

        const lines = block.text.split('\n');
        return (
          <p key={`p-${index}`} className="font-body text-base leading-relaxed text-[#111111]">
            {lines.map((line, lineIdx) => (
              <React.Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
