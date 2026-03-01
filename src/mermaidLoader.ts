/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import mermaid from 'mermaid';

if (typeof window !== 'undefined') {
	let currentController: AbortController | undefined;

	function getStoredTheme(): 'light' | 'dark' | null {
		const theme = localStorage.getItem('mermaid-preview-theme');
		if (theme === 'light' || theme === 'dark') {
			return theme;
		}
		return null;
	}

	function setStoredTheme(theme: 'light' | 'dark'): void {
		localStorage.setItem('mermaid-preview-theme', theme);
	}

	function getEffectiveTheme(): 'light' | 'dark' {
		const stored = getStoredTheme();
		if (stored) {
			return stored;
		}
		const vscodeDark =
			document.body.classList.contains('vscode-dark') ||
			document.body.classList.contains('vscode-high-contrast');
		return vscodeDark ? 'dark' : 'light';
	}

	function isDark(): boolean {
		return getEffectiveTheme() === 'dark';
	}

	function applyThemeToAll(theme: 'light' | 'dark'): void {
		setStoredTheme(theme);
		void init();
	}

	function createToolbar(): HTMLElement {
		const toolbar = document.createElement('div');
		toolbar.className = 'mermaid-toolbar-container';
		toolbar.innerHTML = `
			<button class="mermaid-theme-btn" data-theme="light" title="Light theme">☼</button>
			<button class="mermaid-theme-btn" data-theme="dark" title="Dark theme">☾</button>
		`;

		const lightBtn = toolbar.querySelector(
			'[data-theme="light"]',
		) as HTMLButtonElement;
		const darkBtn = toolbar.querySelector(
			'[data-theme="dark"]',
		) as HTMLButtonElement;
		const currentTheme: 'light' | 'dark' = getEffectiveTheme();
		lightBtn.classList.toggle('active', currentTheme === 'light');
		darkBtn.classList.toggle('active', currentTheme === 'dark');
		toolbar.classList.toggle('dark-theme', currentTheme === 'dark');

		lightBtn.addEventListener('click', () => applyThemeToAll('light'));
		darkBtn.addEventListener('click', () => applyThemeToAll('dark'));

		return toolbar;
	}

	/**
	 * Finds all .mermaid elements OR falls back when extendMarkdownIt hasn't run.
	 *
	 * Two fallbacks:
	 * 1. <pre><code class="language-mermaid">  — VS Code default for ```mermaid
	 * 2. :::mermaid blocks rendered as paragraphs — VS Code default for :::mermaid
	 *    a) single <p> containing ":::mermaid\ncontent\n:::" (no blank lines)
	 *    b) separate <p>:::mermaid</p> ... <p>:::</p> (blank lines in source)
	 */
	function collectMermaidElements(): HTMLElement[] {
		// Primary: our extendMarkdownIt plugin produced .mermaid elements
		const primary = Array.from(
			document.querySelectorAll<HTMLElement>('.mermaid'),
		);
		if (primary.length > 0) {
			console.log(
				'[ML] found',
				primary.length,
				'.mermaid element(s) via plugin',
			);
			return primary;
		}

		const result: HTMLElement[] = [];

		// Fallback 1: <pre><code class="language-mermaid"> — VS Code default for ```mermaid
		for (const code of Array.from(
			document.querySelectorAll<HTMLElement>('code[class*="language-mermaid"]'),
		)) {
			const pre = code.parentElement;
			if (!pre || pre.tagName !== 'PRE') {
				continue;
			}
			const source = (code.textContent || '').trim();
			if (!source) {
				continue;
			}
			const div = document.createElement('div');
			div.className = 'mermaid';
			div.textContent = source;
			div.dataset.mermaidSource = source;
			pre.replaceWith(div);
			result.push(div);
		}

		// Fallback 2: :::mermaid blocks rendered as paragraph(s).
		// Handles all shapes:
		// - single paragraph: ":::mermaid\ncontent\n:::"
		// - opener+content in first paragraph, closer later
		// - opener-only paragraph with content in following paragraphs
		const paras = Array.from(document.body.querySelectorAll<HTMLElement>('p'));
		for (let i = 0; i < paras.length; i++) {
			const p = paras[i];
			const text = p.textContent || '';

			// Case 1: full container in one paragraph:
			// ::: mermaid\n...diagram...\n:::
			const singleBlock = text.match(
				/^:::+\s*mermaid\s*\n([\s\S]*?)\n:::+\s*$/i,
			);
			if (singleBlock) {
				const source = (singleBlock[1] || '').trim();
				if (source) {
					const div = document.createElement('div');
					div.className = 'mermaid';
					div.textContent = source;
					div.dataset.mermaidSource = source;
					p.replaceWith(div);
					result.push(div);
				}
				continue;
			}

			// Detect opener, allowing content to continue in same paragraph.
			// Examples matched:
			//   :::mermaid
			//   ::: mermaid
			//   :::mermaid\nsequenceDiagram\nautonumber
			const opener = text.match(/^:::+\s*mermaid\s*(?:\n([\s\S]*))?$/i);
			if (!opener) {
				continue;
			}

			const chunks: string[] = [];
			const firstChunk = (opener[1] || '').trim();
			if (firstChunk) {
				chunks.push(firstChunk);
			}

			let foundCloser = false;
			let j = i + 1;
			while (j < paras.length) {
				const next = paras[j];
				const nextTextRaw = next.textContent || '';
				const nextText = nextTextRaw.trim();

				// Closer-only paragraph
				if (/^:::+\s*$/.test(nextText)) {
					next.remove();
					foundCloser = true;
					i = j; // skip consumed range
					break;
				}

				// Paragraph that ends with closer, with content before it
				const endsWithCloser = nextTextRaw.match(/^([\s\S]*?)\n:::+\s*$/);
				if (endsWithCloser) {
					const beforeCloser = (endsWithCloser[1] || '').trim();
					if (beforeCloser) {
						chunks.push(beforeCloser);
					}
					next.remove();
					foundCloser = true;
					i = j; // skip consumed range
					break;
				}

				chunks.push(nextTextRaw.trim());
				next.remove();
				j++;
			}

			const source = chunks
				.join('\n')
				.split('\n')
				.map((line) => line.trimEnd())
				.filter((line) => !/^:::+\s*$/.test(line.trim()))
				.join('\n')
				.trim();
			if (foundCloser && source) {
				const div = document.createElement('div');
				div.className = 'mermaid';
				div.textContent = source;
				div.dataset.mermaidSource = source;
				p.replaceWith(div);
				result.push(div);
			} else {
				// No valid closer found; leave as-is to avoid destroying markdown text.
			}
		}

		if (result.length > 0) {
			console.log('[ML] fallback: converted', result.length, 'element(s)');
		}
		return result;
	}

	async function init(): Promise<void> {
		currentController?.abort();
		currentController = new AbortController();
		const signal = currentController.signal;

		const els = collectMermaidElements();
		console.log('[ML] init: total elements to render:', els.length);

		if (els.length === 0) {
			return;
		}

		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'loose',
			theme: (isDark() ? 'dark' : 'default') as any,
		});

		for (const el of els) {
			el.removeAttribute('data-processed');
		}

		const renderPromises = els.map(async (el, index) => {
			const source = (el.dataset.mermaidSource || el.textContent || '').trim();
			if (!source) {
				return;
			}
			el.dataset.mermaidSource = source;

			const id = `mermaid-${Date.now()}-${index}`;
			try {
				await mermaid.parse(source);
				if (signal.aborted) {
					return;
				}

				const result = await mermaid.render(id, source);
				if (signal.aborted) {
					return;
				}

				const wrapper = document.createElement('div');
				wrapper.className = 'mermaid-preview-wrapper';
				wrapper.classList.toggle('dark-theme', isDark());

				const content = document.createElement('div');
				content.className = 'mermaid-preview-content';
				content.innerHTML = result.svg;
				wrapper.appendChild(content);

				const toolbar = createToolbar();
				wrapper.appendChild(toolbar);

				const block = document.createElement('div');
				block.className = 'mermaid-block';
				block.appendChild(wrapper);

				el.innerHTML = '';
				el.appendChild(block);
				result.bindFunctions?.(content);
			} catch (err) {
				console.error('[ML] render error on block', index, err);
				const message =
					err instanceof Error
						? err.message
						: typeof err === 'object' && err !== null && 'str' in err
							? String((err as { str?: unknown }).str)
							: String(err);
				const preview = source.split('\n').slice(0, 4).join('\n');
				el.innerHTML = `<pre class="mermaid-error" style="color:#c0392b;background:#fdf2f2;border:1px solid #e74c3c;padding:8px;border-radius:4px;font-size:12px;white-space:pre-wrap;">Mermaid render error:\n${message}\n\nSource preview:\n${preview}</pre>`;
			}
		});

		await Promise.all(renderPromises);
		if (signal.aborted) {
			return;
		}
		console.log('[ML] done');
	}

	window.addEventListener('vscode.markdown.updateContent', () => {
		void init();
	});

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			void init();
		});
	} else {
		void init();
	}
}
