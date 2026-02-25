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

		// Override the fence rendering rule
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
		const plugin = createMarkdownItPlugin();

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
