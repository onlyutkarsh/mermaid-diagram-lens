/**
 * Markdown-it Plugin for Mermaid Diagram Support
 * Closely follows https://github.com/mjbvz/vscode-markdown-mermaid
 */

import type * as vscode from 'vscode';

const mermaidLanguageId = 'mermaid';
const containerTokenName = 'mermaidContainer';

function preProcess(source: string): string {
	return source
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n+$/, '')
		.trimStart();
}

/**
 * Creates a markdown-it plugin function for rendering mermaid blocks.
 * Output format matches vscode-markdown-mermaid so mermaidLoader.ts
 * can find diagrams with the same selectors.
 */
export function createMarkdownItPlugin() {
	return (md: any) => {
		// Override the fence rendering rule (backtick syntax: ```mermaid)
		const highlight = md.options.highlight;
		md.options.highlight = (code: string, lang: string, attrs: string) => {
			if (lang && /^mermaid\b/i.test(lang.trim())) {
				return `<pre class="${mermaidLanguageId}" style="all: unset;">${preProcess(code)}</pre>`;
			}
			return highlight?.(code, lang, attrs) ?? code;
		};

		// Add block rule for ADO wiki :::mermaid container syntax.
		// Ported from the reference implementation in markdown-it-container.
		const minMarkers = 3;
		const markerStr = ':';
		const markerChar = markerStr.charCodeAt(0);
		const markerLen = markerStr.length;

		md.block.ruler.before(
			'fence',
			containerTokenName,
			(state: any, startLine: number, endLine: number, silent: boolean) => {
				try {
					let pos: number;
					let autoClosed = false;
					let start = state.bMarks[startLine] + state.tShift[startLine];
					let max = state.eMarks[startLine];

					// Quick check: first character must be ':'
					if (markerChar !== state.src.charCodeAt(start)) {
						return false;
					}

					// Count the marker characters
					for (pos = start + 1; pos <= max; pos++) {
						if (markerStr[(pos - start) % markerLen] !== state.src[pos]) {
							break;
						}
					}

					const markerCount = Math.floor((pos - start) / markerLen);
					if (markerCount < minMarkers) {
						return false;
					}
					pos -= (pos - start) % markerLen;

					const markup = state.src.slice(start, pos);
					const params = state.src.slice(pos, max);

					// Must start with 'mermaid' (case insensitive)
					if (params.trim().split(' ')[0].toLowerCase() !== 'mermaid') {
						return false;
					}

					if (silent) {
						return true;
					}

					// Search for the closing :::
					let nextLine = startLine;
					for (;;) {
						nextLine++;
						if (nextLine >= endLine) {
							// Auto-close at end of document / parent block
							break;
						}

						start = state.bMarks[nextLine] + state.tShift[nextLine];
						max = state.eMarks[nextLine];

						if (start < max && state.sCount[nextLine] < state.blkIndent) {
							// Non-empty line with negative indent stops the block
							break;
						}

						if (markerChar !== state.src.charCodeAt(start)) {
							continue;
						}

						if (state.sCount[nextLine] - state.blkIndent >= 4) {
							// Overly-indented closing fence — skip
							continue;
						}

						for (pos = start + 1; pos <= max; pos++) {
							if (markerStr[(pos - start) % markerLen] !== state.src[pos]) {
								break;
							}
						}

						// Closing marker must be at least as long as opening
						if (Math.floor((pos - start) / markerLen) < markerCount) {
							continue;
						}

						// Tail must be spaces only
						pos -= (pos - start) % markerLen;
						pos = state.skipSpaces(pos);
						if (pos < max) {
							continue;
						}

						autoClosed = true;
						break;
					}

					const old_parent = state.parentType;
					const old_line_max = state.lineMax;
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					state.parentType = 'container' as any;
					state.lineMax = nextLine;

					const containerToken = state.push(containerTokenName, 'div', 1);
					containerToken.markup = markup;
					containerToken.block = true;
					containerToken.info = params;
					containerToken.map = [startLine, nextLine];
					containerToken.content = state.getLines(
						startLine + 1,
						nextLine,
						state.blkIndent,
						true,
					);

					state.parentType = old_parent;
					state.lineMax = old_line_max;
					state.line = nextLine + (autoClosed ? 1 : 0);
					return true;
				} catch (e) {
					console.error('[mermaid-plugin] block rule error:', e);
					return false;
				}
			},
			// end rule
			{ alt: ['paragraph', 'reference', 'blockquote', 'list'] },
		);

		// Renderer for the ADO :::mermaid container - matches reference extension output
		md.renderer.rules[containerTokenName] = (tokens: any[], idx: number) => {
			const src = tokens[idx].content;
			return `<div class="${mermaidLanguageId}">${preProcess(src)}</div>`;
		};

		return md;
	};
}

/**
 * Registers the markdown-it plugin with VS Code's markdown preview system
 * This uses the undocumented but stable markdown preview plugin API
 *
 * @param context VS Code extension context
 * @param logger Logger instance for debugging
 */
export async function registerMarkdownPlugin(
	context: vscode.ExtensionContext,
): Promise<void> {
	try {
		// Create the plugin
		const _plugin = createMarkdownItPlugin();

		// The markdown.registerMarkdownItPlugin API is available but not officially documented
		// It's used by other popular extensions (e.g., markdown-mermaid)
		// The plugin gets automatically picked up by VS Code when:
		// 1. We declare "markdown.markdownItPlugins": true in package.json
		// 2. We export the plugin from our extension

		// Store plugin reference if needed for cleanup
		context.subscriptions.push({
			dispose: () => {
				// Plugin cleanup if needed
			},
		});
	} catch (error) {
		console.error('Failed to register markdown-it plugin:', error);
		throw error;
	}
}
