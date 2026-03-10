---
description: VS Code extension architecture patterns and best practices
applyTo: "src/**/*.ts,package.json"
---

# VS Code Extensions Memory

Patterns and lessons learned building VS Code extensions effectively.

## Dual-Interface Architecture Pattern

When building extensions that work with multiple file types, implement a separation of concerns:

1. **Default Preview for Markdown Files** - Use markdown-it plugin contribution (`extendMarkdownIt`) to render diagrams inline in VS Code's native markdown preview. This provides seamless integration without custom UI.

2. **Code Lens for Custom Preview Option** - Add CodeLens above diagram blocks to offer users "Preview Diagram | Copy Mermaid Code" actions. Clicking "Preview Diagram" opens just that mermaid diagram in a custom webview panel. This respects the default preview as primary while allowing power users to inspect a focused diagram.

3. **Custom Panel for Full-Document Preview** - Keep a full custom panel available for both Markdown and Mermaid files via commands (`showPreview` / `showPreviewToSide`). For Mermaid files, this is the primary preview experience; for Markdown files, this is an optional alternate view.

**Example (mermaid-viewer):**
- `.md` files → render in default markdown preview (via markdown-it plugin) + optional CodeLens + optional full-panel preview commands
- `.mmd` files → open custom Mermaid Viewer panel for full preview + top-of-file CodeLens actions

**Benefits:**
- Respects VS Code's native markdown experience
- Provides advanced features without disrupting default behavior
- Users have choice without friction
- Clear separation between content types

## Markdown Preview Reliability Pattern (Critical)

For Markdown preview correctness (especially `::: mermaid` container syntax), use a plugin-first rendering contract with controlled fallbacks:

1. **Primary parsing phase (extension host):** `extendMarkdownIt` converts supported syntax to stable markers (`.mermaid` blocks).
2. **Primary rendering phase (preview script):** loader renders parsed markers deterministically.
3. **Fallback phase (preview script):** if plugin markers are absent, loader converts VS Code default HTML shapes:
	- `code.language-mermaid` fenced blocks
	- paragraph-shaped `::: mermaid` containers

### Required contract

- Ensure `activate()` returns an API object with `extendMarkdownIt(...)` for markdown plugin integration.
- Keep `extendMarkdownIt` exported as needed, but treat the `activate()` return contract as mandatory for reliability.
- Keep loader behavior idempotent (recompute from source markers and avoid duplicate conversions on refresh).
- Refresh markdown previews on activation when needed so parser output and render script stay in sync.

### Anti-patterns to avoid

- Do **not** rely on fallback heuristics as the primary path; plugin output should remain the first-class source.
- Do **not** make fallbacks destructive when container closing markers are missing; preserve original markdown text in ambiguous cases.
- Do **not** broaden fallback selectors beyond supported syntax (`mermaid`) without matching parser support.

### Why this matters

- Plugin parsing keeps syntax support explicit and maintainable.
- Controlled fallbacks keep preview resilient when markdown-it hook timing or host behavior differs.
- Deterministic rendering prevents duplicate nodes and hard-to-debug race conditions.

## Code Lens Implementation for Multiple Block Syntaxes

When providing CodeLens for diagram blocks, search for ALL syntax variations supported:

```typescript
function findDiagramStartLines(document: vscode.TextDocument): number[] {
	const text = document.getText();
	const fencedRegex = /```mermaid[^\S\r\n]*(?:\r?\n)/g;    // Fenced blocks
	const adoRegex = /:::\s*mermaid[^\S\r\n]*(?:\r?\n)/gm;  // ADO container blocks
	const lines: number[] = [];
	
	// Search both syntaxes
	let match = fencedRegex.exec(text);
	while (match !== null) {
		lines.push(document.positionAt(match.index).line);
		match = fencedRegex.exec(text);
	}
	
	match = adoRegex.exec(text);
	while (match !== null) {
		lines.push(document.positionAt(match.index).line);
		match = adoRegex.exec(text);
	}
	
	// Return unique, sorted line numbers
	return [...new Set(lines)].sort((a, b) => a - b);
}
```

Also update block extraction to handle both syntaxes:

```typescript
function getBlockAtLine(document, line): string | undefined {
	const text = document.getText();
	
	// Try fenced blocks first
	const fencedRegex = /```mermaid[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)?```/g;
	let match = fencedRegex.exec(text);
	while (match !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);
		if (line >= startPos.line && line <= endPos.line) {
			return match[1]?.trim();
		}
		match = fencedRegex.exec(text);
	}
	
	// Then try ADO blocks
	const adoRegex = /:::\s*mermaid\s*\r?\n([\s\S]*?)\r?\n:::/g;
	match = adoRegex.exec(text);
	while (match !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);
		if (line >= startPos.line && line <= endPos.line) {
			return match[1]?.trim();
		}
		match = adoRegex.exec(text);
	}
	
	return undefined;
}
```

## File Type Filtering for Commands

Restrict extension commands to appropriate file types early in the command handler:

✅ **Good:**
```typescript
const showPreviewCommand = vscode.commands.registerCommand('ext.showPreview', () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	
	// Check file type FIRST, exit early if wrong type
	if (
		editor.document.languageId !== 'markdown' &&
		editor.document.languageId !== 'mermaid'
	) {
		vscode.window.showInformationMessage(
			'Mermaid Viewer only works with Markdown and Mermaid files.',
		);
		return;
	}
	
	// Proceed with command logic
	MermaidPreviewPanel.createOrShow(...);
});
```

❌ **Avoid:**
Accepting unrelated file types or mixing unsupported-language handling deep in command logic.

**Pattern:** Explicitly allow only the intended set (`markdown`, `mermaid`) and fail fast with one consistent message.

## Webview Codicon Packaging Pattern

When a webview uses Codicons, bundle Codicon assets into extension output and load from `out/` paths.

1. Copy `codicon.css` and `codicon.ttf` into `out/codicons` as part of `compile` and `vscode:prepublish` scripts.
2. Resolve webview stylesheet URI from `out/codicons/codicon.css`.
3. Keep `.vscodeignore` free to exclude `node_modules`; runtime webview assets should not depend on `node_modules`.

**Why this matters:** packaged `.vsix` files usually exclude `node_modules`, so codicon glyphs can disappear if the webview points to source dependency paths.

## Discoverable Hover Controls Pattern

For diagram viewers with immersive canvas interaction, prefer hidden controls with explicit discoverability:

1. Place a floating controls panel in the bottom-right corner.
2. Reveal it from a bounded hotspot (`.hover-hotspot`) instead of full-canvas hover.
3. Keep a subtle persistent hint (`.hover-presence-hint`) to signal controls are available.
4. Exclude controls/hotspot from pan start logic so click interactions stay reliable.
5. Use theme tokens for badge text (`var(--vscode-editor-foreground)`) instead of hard-coded light colors.

**Why this matters:** this preserves clean diagram focus while keeping controls discoverable, accessible, and readable in both light and dark themes.
