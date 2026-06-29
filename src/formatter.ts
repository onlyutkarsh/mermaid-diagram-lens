// Conservative Mermaid formatter.
//
// Goals (intentionally limited so we never alter diagram semantics):
//  - Trim trailing whitespace from every line.
//  - Keep the diagram declaration (e.g. `sequenceDiagram`, `flowchart TD`) at
//    column 0 and indent the whole body one level beneath it, with structural
//    nesting indented further.
//  - Collapse runs of blank lines into a single blank line and drop
//    leading/trailing blank lines.
//
// Anything else on a line (arrows, labels, node text) is left untouched.
//
// IMPORTANT: re-indenting is opt-in per diagram type. Only the known
// structural types below are re-indented; every other type — mindmap/kanban/
// treemap (hierarchy from indentation), sankey (CSV where leading whitespace
// is part of a node name), and any unknown/future type — is left as-is except
// for trailing-whitespace trimming, so formatting can never corrupt a diagram
// whose indentation we don't understand.

const INDENT = '    ';

// Sequence-diagram block keywords. Only applied to sequenceDiagram so a
// flowchart node id like `loop` is never mistaken for a block opener.
const SEQ_OPENERS = /^(loop|alt|opt|par|critical|rect|box|break)\b/i;
const SEQ_MIDDLES = /^(else|and|option)\b/i;

// Known diagram types whose indentation is purely cosmetic, so re-indenting is
// safe. Anything not listed here is left un-indented (only trailing whitespace
// trimmed). Keyed by the lowercased first word of the diagram declaration.
const STRUCTURAL_TYPES = new Set([
	'graph',
	'flowchart',
	'sequencediagram',
	'classdiagram',
	'classdiagram-v2',
	'statediagram',
	'statediagram-v2',
	'erdiagram',
	'journey',
	'gantt',
	'timeline',
	'pie',
	'quadrantchart',
	'requirementdiagram',
	'gitgraph',
	'c4context',
	'c4container',
	'c4component',
	'c4dynamic',
	'c4deployment',
	'xychart-beta',
	'block',
	'block-beta',
	'architecture',
	'architecture-beta',
	'packet',
	'packet-beta',
	'radar',
	'radar-beta',
	'info',
]);

interface DiagramProfile {
	/** Indentation is meaningful; only trailing whitespace may be trimmed. */
	preserveIndent: boolean;
	isSequence: boolean;
	/** gantt / journey / timeline — `section` groups the lines beneath it. */
	isSectioned: boolean;
	/** block-beta — `block:id … end`. */
	isBlock: boolean;
	/** stateDiagram — multi-line `note … end note`. */
	isState: boolean;
}

function detectProfile(firstMeaningful: string): DiagramProfile {
	const firstWord = (
		firstMeaningful.match(/^[a-z0-9-]+/i)?.[0] ?? ''
	).toLowerCase();
	return {
		preserveIndent: !STRUCTURAL_TYPES.has(firstWord),
		isSequence: firstWord === 'sequencediagram',
		isSectioned:
			firstWord === 'gantt' ||
			firstWord === 'journey' ||
			firstWord === 'timeline',
		isBlock: firstWord === 'block' || firstWord === 'block-beta',
		isState: firstWord === 'statediagram' || firstWord === 'statediagram-v2',
	};
}

type LineKind = 'frontmatter' | 'blank' | 'content';

interface WalkedLine {
	raw: string;
	/** The corrected text this line should have. */
	expected: string;
	kind: LineKind;
}

// Single source of truth for the formatting rules: walk each source line and
// compute the text it should have. Both the formatter and the per-line issue
// detector build on this, so they can never disagree about what "formatted"
// means.
function walkMermaidLines(code: string): WalkedLine[] {
	const lines = code.replace(/\r\n?/g, '\n').split('\n');

	// Detect a leading YAML frontmatter block (--- ... ---).
	const firstNonBlank = lines.findIndex((line) => line.trim() !== '');
	let frontmatterEnd = -1;
	if (firstNonBlank !== -1 && lines[firstNonBlank].trim() === '---') {
		for (let i = firstNonBlank + 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				frontmatterEnd = i;
				break;
			}
		}
	}

	const bodyStart = frontmatterEnd === -1 ? 0 : frontmatterEnd + 1;
	let firstMeaningful = '';
	for (let i = bodyStart; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (trimmed !== '' && !trimmed.startsWith('%%')) {
			firstMeaningful = trimmed;
			break;
		}
	}
	const profile = detectProfile(firstMeaningful);

	const walked: WalkedLine[] = [];
	let level = 0;
	let seenHeader = false;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const trimmed = raw.trim();

		if (frontmatterEnd !== -1 && i >= firstNonBlank && i <= frontmatterEnd) {
			walked.push({
				raw,
				expected: raw.replace(/\s+$/, ''),
				kind: 'frontmatter',
			});
			continue;
		}

		if (trimmed === '') {
			walked.push({ raw, expected: '', kind: 'blank' });
			continue;
		}

		// Indentation-sensitive diagrams: keep leading whitespace untouched.
		if (profile.preserveIndent) {
			walked.push({ raw, expected: raw.replace(/\s+$/, ''), kind: 'content' });
			continue;
		}

		// The first non-comment line is the diagram declaration. It stays at
		// column 0; everything after it is indented at least one level.
		const isHeaderLine = !seenHeader && !trimmed.startsWith('%%');
		const isMiddle =
			(profile.isSequence && SEQ_MIDDLES.test(trimmed)) ||
			(profile.isSectioned && /^section\b/i.test(trimmed));

		if (!isHeaderLine) {
			const isCloser =
				trimmed === 'end' || trimmed === '}' || trimmed === 'end note';
			if (isCloser || isMiddle) {
				level = Math.max(seenHeader ? 1 : 0, level - 1);
			}
		}

		walked.push({
			raw,
			expected: level > 0 ? INDENT.repeat(level) + trimmed : trimmed,
			kind: 'content',
		});

		if (isHeaderLine) {
			seenHeader = true;
			level = 1;
			continue;
		}

		const opensBlock =
			/^subgraph\b/i.test(trimmed) ||
			trimmed.endsWith('{') ||
			(profile.isSequence && SEQ_OPENERS.test(trimmed)) ||
			(profile.isBlock && /^block\s*:/i.test(trimmed)) ||
			(profile.isState && /^note\b/i.test(trimmed) && !trimmed.includes(':'));
		if (opensBlock || isMiddle) {
			level++;
		}
	}

	return walked;
}

export function formatMermaidCode(code: string): string {
	const out: string[] = [];
	let emittedContent = false;
	let pendingBlank = false;

	for (const line of walkMermaidLines(code)) {
		if (line.kind === 'frontmatter') {
			out.push(line.expected);
			continue;
		}
		if (line.kind === 'blank') {
			if (emittedContent) {
				pendingBlank = true;
			}
			continue;
		}
		if (pendingBlank) {
			out.push('');
			pendingBlank = false;
		}
		out.push(line.expected);
		emittedContent = true;
	}

	return out.join('\n');
}

// Whole-file canonical form: the formatted body plus a single trailing newline
// (matching the near-universal "final newline" convention). Empty input stays
// empty. Use this for standalone .mmd/.mermaid documents; use formatMermaidCode
// for inline blocks embedded in Markdown.
export function formatMermaidDocument(text: string): string {
	const body = formatMermaidCode(text);
	return body === '' ? '' : `${body}\n`;
}

export interface MermaidFormatIssue {
	/** 0-based line index within `code`. */
	line: number;
	/** The corrected text the line should have. */
	expected: string;
}

// Per-line formatting problems (indentation and trailing/whitespace). Each
// issue is independently applicable: replacing the line's text with `expected`
// fixes only that line and never changes the line count, so fixing one issue
// does not shift the positions of the others. Blank-line collapsing and the
// final newline are whole-document concerns handled by formatMermaidDocument,
// not reported here.
export function findMermaidFormatIssues(code: string): MermaidFormatIssue[] {
	const issues: MermaidFormatIssue[] = [];
	walkMermaidLines(code).forEach((line, index) => {
		if (line.raw !== line.expected) {
			issues.push({ line: index, expected: line.expected });
		}
	});
	return issues;
}
