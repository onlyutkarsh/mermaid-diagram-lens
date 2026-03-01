/**
 * Markdown-it Plugin for Mermaid Diagram Support
 * Transforms mermaid code blocks into renderable divs
 */

import type * as vscode from 'vscode';

/**
 * Creates a markdown-it plugin function for rendering mermaid blocks
 * @param context VS Code extension context
 * @returns Plugin function for markdown-it
 */
export function createMarkdownItPlugin() {
	return (md: any) => {
		console.log('[markdown-it plugin] Initializing plugin');
		// Store the default fence renderer
		const defaultRender =
			md.renderer.rules.fence ||
			((tokens: any[], idx: number) =>
				md.utils.escapeHtml(tokens[idx].content));

		// Override the fence rendering rule (backtick syntax: ```mermaid)
		md.renderer.rules.fence = (
			tokens: any[],
			idx: number,
			options: any,
			env: any,
			self: any,
		) => {
			const token = tokens[idx];

			// Check if this is a mermaid code block
			// token.info contains the language identifier (e.g., "mermaid")
			if (token.info === 'mermaid' || token.info.startsWith('mermaid')) {
				const code = token.content;

				// Output standard HTML structure that mermaidLoader.ts expects:
				// <pre><code class="language-mermaid">CODE</code></pre>
				const escapedCode = md.utils.escapeHtml(code);
				return `<pre><code class="language-mermaid">${escapedCode}</code></pre>\n`;
			}

			// For all other code blocks, use default renderer
			return defaultRender(tokens, idx, options, env, self);
		};

		// Add block rule for ADO wiki :::mermaid container syntax
		md.block.ruler.before(
			'fence',
			'mermaid_container',
			(state: any, startLine: number, endLine: number, silent: boolean) => {
				console.log(
					'[markdown-it] Checking line',
					startLine,
					'for ::: mermaid syntax',
				);
				let pos: number;
				let start = state.bMarks[startLine] + state.tShift[startLine];
				let max = state.eMarks[startLine];

				// Check first character - must be ':'
				if (state.src.charCodeAt(start) !== 0x3a /* : */) {
					console.log('[markdown-it] Line', startLine, 'does not start with :');
					return false;
				}

				// Count the ':' characters (must be at least 3)
				for (pos = start + 1; pos <= max; pos++) {
					if (state.src.charCodeAt(pos) !== 0x3a) {
						break;
					}
				}

				const markerCount = pos - start;
				if (markerCount < 3) {
					return false;
				}

				// Get params (everything after the ::: markers)
				const params = state.src.slice(pos, max);
				console.log('[markdown-it] Line', startLine, 'params:', params);

				// Check if first word is 'mermaid' (case insensitive)
				const firstWord = params.trim().split(' ')[0].toLowerCase();
				console.log('[markdown-it] Line', startLine, 'firstWord:', firstWord);
				if (firstWord !== 'mermaid') {
					console.log(
						'[markdown-it] Line',
						startLine,
						'first word is not mermaid',
					);
					return false;
				}

				if (silent) {
					return true;
				}

				// Find the closing :::
				const nextLine = startLine + 1;
				let found = false;
				while (nextLine < endLine) {
					start = state.bMarks[nextLine] + state.tShift[nextLine];
					max = state.eMarks[nextLine];

					if (state.src.charCodeAt(start) !== 0x3a) {
						continue;
					}

					// Count closing ::: markers
					for (pos = start + 1; pos <= max; pos++) {
						if (state.src.charCodeAt(pos) !== 0x3a) {
							break;
						}
					}

					// Must have at least as many markers as opening
					if (pos - start >= markerCount) {
						// Make sure rest of line is empty
						const rest = state.src.slice(pos, max).trim();
						if (rest === '') {
							found = true;
							break;
						}
					}
				}

				if (!found) {
					console.log('[markdown-it] Line', startLine, 'no closing ::: found');
					return false;
				}

				console.log(
					'[markdown-it] Found ::: mermaid block from line',
					startLine,
					'to',
					nextLine,
				);

				// Collect the content lines between the markers
				const contentLines: string[] = [];
				for (let i = startLine + 1; i < nextLine; i++) {
					contentLines.push(state.src.slice(state.bMarks[i], state.eMarks[i]));
				}

				console.log('[markdown-it] Content lines:', contentLines.length);

				const token = state.push('mermaid_container', 'div', 0);
				token.content = contentLines.join('\n');
				token.map = [startLine, nextLine + 1];
				token.markup = ':::';

				state.line = nextLine + 1;
				return true;
			},
			{ alt: ['paragraph', 'reference'] },
		);

		// Renderer for the ADO :::mermaid container
		md.renderer.rules['mermaid_container'] = (tokens: any[], idx: number) => {
			console.log('[markdown-it] Rendering mermaid_container token');
			const escapedCode = md.utils.escapeHtml(tokens[idx].content);
			const html = `<pre><code class="language-mermaid">${escapedCode}</code></pre>\n`;
			console.log('[markdown-it] Generated HTML:', html.substring(0, 100));
			return html;
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
