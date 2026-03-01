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

				// Wrap in div with class that mermaidLoader.ts will find and render
				// Escape the HTML to prevent code injection
				const escapedCode = md.utils.escapeHtml(code);
				return `<div class="mermaid-block"><pre class="language-mermaid">${escapedCode}</pre></div>\n`;
			}

			// For all other code blocks, use default renderer
			return defaultRender(tokens, idx, options, env, self);
		};

		// Add block rule for ADO wiki :::mermaid container syntax
		md.block.ruler.before(
			'fence',
			'mermaid_container',
			(state: any, startLine: number, endLine: number, silent: boolean) => {
				const startPos = state.bMarks[startLine] + state.tShift[startLine];
				const startMax = state.eMarks[startLine];

				if (state.tShift[startLine] < 0) {
					return false;
				}

				const marker = state.src.slice(startPos, startMax).trim();
				const normalizedMarker = marker.replace(/\s+/g, ' ');
				if (
					normalizedMarker !== ':::mermaid' &&
					!normalizedMarker.startsWith(':::mermaid ')
				) {
					return false;
				}

				if (silent) {
					return true;
				}

				// Find the closing :::
				let nextLine = startLine + 1;
				let found = false;
				while (nextLine < endLine) {
					const linePos = state.bMarks[nextLine] + state.tShift[nextLine];
					const lineMax = state.eMarks[nextLine];
					const line = state.src.slice(linePos, lineMax).trim();
					if (line === ':::') {
						found = true;
						break;
					}
					nextLine++;
				}

				if (!found) {
					return false;
				}

				// Collect the content lines between the markers
				const contentLines: string[] = [];
				for (let i = startLine + 1; i < nextLine; i++) {
					contentLines.push(state.src.slice(state.bMarks[i], state.eMarks[i]));
				}

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
			const escapedCode = md.utils.escapeHtml(tokens[idx].content);
			return `<div class="mermaid-block"><pre class="language-mermaid">${escapedCode}</pre></div>\n`;
		};
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
