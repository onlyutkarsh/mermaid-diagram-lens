/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import mermaid from 'mermaid';

// Logging helper for webview context
const LOG_PREFIX = '[Mermaid Loader]';
const log = {
	info: (...args: unknown[]) => console.log(LOG_PREFIX, ...args),
	warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
	error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
};

(async () => {
	// Only run in webview context (markdown preview)
	if (typeof window === 'undefined') {
		return;
	}

	log.info('Starting initialization with bundled mermaid library');

	try {
		log.info('Mermaid library loaded successfully');

		// Configure mermaid
		mermaid.initialize({
			startOnLoad: false,
			theme: 'default',
			securityLevel: 'loose',
			flowchart: {
				useMaxWidth: true,
			},
			sequence: {
				useMaxWidth: true,
			},
			gitGraph: {
				useMaxWidth: true,
			},
		});

		log.info('Mermaid configured with default settings');

		// Get stored theme preference (light or dark)
		function getStoredTheme(): string {
			return localStorage.getItem('mermaid-preview-theme') || 'light';
		}

		function setStoredTheme(theme: string) {
			localStorage.setItem('mermaid-preview-theme', theme);
		}

		// Create toolbar for a diagram
		function createToolbar(diagramId: string): HTMLElement {
			const toolbar = document.createElement('div');
			toolbar.className = 'mermaid-toolbar-container';
			toolbar.setAttribute('data-diagram-id', diagramId);

			toolbar.innerHTML = `
				<button class="mermaid-theme-btn active" data-theme="light" title="Light theme">☼</button>
				<button class="mermaid-theme-btn" data-theme="dark" title="Dark theme">☾</button>
			`;

			const lightBtn = toolbar.querySelector(
				'[data-theme="light"]',
			) as HTMLButtonElement;
			const darkBtn = toolbar.querySelector(
				'[data-theme="dark"]',
			) as HTMLButtonElement;

			// Set initial active button based on stored theme
			const currentTheme = getStoredTheme();
			if (currentTheme === 'dark') {
				lightBtn.classList.remove('active');
				darkBtn.classList.add('active');
				toolbar.classList.add('dark-theme');
			}

			// Handle theme switching
			lightBtn.addEventListener('click', () => {
				setTheme('light', lightBtn, darkBtn, toolbar);
			});

			darkBtn.addEventListener('click', () => {
				setTheme('dark', darkBtn, lightBtn, toolbar);
			});

			return toolbar;
		}

		// Switch theme for a diagram
		function setTheme(
			theme: string,
			activeBtn: HTMLButtonElement,
			inactiveBtn: HTMLButtonElement,
			toolbar: HTMLElement,
		) {
			// Update button states
			activeBtn.classList.add('active');
			inactiveBtn.classList.remove('active');

			// Update toolbar theme
			if (theme === 'dark') {
				toolbar.classList.add('dark-theme');
			} else {
				toolbar.classList.remove('dark-theme');
			}

			// Store preference
			setStoredTheme(theme);

			// Apply theme to ALL diagrams on the page
			const allWrappers = document.querySelectorAll(
				'.mermaid-preview-wrapper',
			) as NodeListOf<HTMLElement>;
			const allToolbars = document.querySelectorAll(
				'.mermaid-toolbar-container',
			) as NodeListOf<HTMLElement>;

			allWrappers.forEach((w) => {
				if (theme === 'dark') {
					w.classList.add('dark-theme');
				} else {
					w.classList.remove('dark-theme');
				}
			});

			allToolbars.forEach((t) => {
				const lightBtn = t.querySelector(
					'[data-theme="light"]',
				) as HTMLButtonElement;
				const darkBtn = t.querySelector(
					'[data-theme="dark"]',
				) as HTMLButtonElement;

				if (lightBtn && darkBtn) {
					if (theme === 'dark') {
						lightBtn.classList.remove('active');
						darkBtn.classList.add('active');
						t.classList.add('dark-theme');
					} else {
						lightBtn.classList.add('active');
						darkBtn.classList.remove('active');
						t.classList.remove('dark-theme');
					}
				}
			});
		}

		// Function to find and render mermaid code blocks
		async function processMermaidBlocks() {
			// Find all pre > code blocks with language-mermaid class
			const codeBlocks = document.querySelectorAll(
				'pre > code.language-mermaid',
			);

			log.info(`Found ${codeBlocks.length} standard mermaid code block(s)`);

			let rendered = 0;
			const currentTheme = getStoredTheme();

			// Process standard ```mermaid blocks
			for (const block of codeBlocks) {
				// Skip if already processed
				if (block.hasAttribute('data-mermaid-processed')) {
					continue;
				}

				const code = block.textContent || '';
				if (!code.trim()) {
					block.setAttribute('data-mermaid-processed', 'empty');
					continue;
				}

				try {
					block.setAttribute('data-mermaid-processed', 'true');

					const pre = block.parentElement;
					if (!pre) continue;

					const diagramId = `mermaid-${Math.random().toString(36).substring(7)}`;
					log.info(`Rendering diagram: ${diagramId}`);

					// Render diagram to SVG
					const renderedDiagram = await mermaid.render(diagramId, code);
					const svgContent =
						typeof renderedDiagram === 'string'
							? renderedDiagram
							: (renderedDiagram as any).svg;

					// Create wrapper with light background
					const wrapper = document.createElement('div');
					wrapper.className = 'mermaid-preview-wrapper';
					if (currentTheme === 'dark') {
						wrapper.classList.add('dark-theme');
					}

					const content = document.createElement('div');
					content.className = 'mermaid-preview-content';
					content.innerHTML = svgContent;
					wrapper.appendChild(content);

					// Create toolbar
					const toolbar = createToolbar(diagramId);
					wrapper.appendChild(toolbar);

					// Create container for wrapper
					const container = document.createElement('div');
					container.className = 'mermaid-block';
					container.appendChild(wrapper);

					// Replace pre element with container
					pre.replaceWith(container);
					rendered++;

					log.info(`Successfully rendered diagram: ${diagramId}`);
				} catch (error) {
					log.error('Failed to render diagram:', error);
					block.setAttribute('data-mermaid-processed', 'error');
				}
			}

			// Process ADO :::mermaid syntax
			await processAdoMermaidBlocks();

			log.info(`Total diagrams rendered: ${rendered}`);
		}

		// Function to find and render ADO-style :::mermaid blocks
		async function processAdoMermaidBlocks() {
			const currentTheme = getStoredTheme();

			// Find all text nodes that might contain :::mermaid
			const walker = document.createTreeWalker(
				document.body,
				NodeFilter.SHOW_TEXT,
				null,
			);

			const textNodes: Node[] = [];
			let node: Node | null = walker.nextNode();
			while (node) {
				const text = node.textContent || '';
				// Match both :::mermaid and ::: mermaid (with space)
				if (text.includes(':::') && /:::\s*mermaid/i.test(text)) {
					textNodes.push(node);
				}
				node = walker.nextNode();
			}

			for (const textNode of textNodes) {
				const parentElement = textNode.parentElement;
				if (
					!parentElement ||
					parentElement.hasAttribute('data-mermaid-processed')
				) {
					continue;
				}

				const text = parentElement.textContent || '';
				// Match both :::mermaid and ::: mermaid (with optional space)
				const adoPattern = /:::\s*mermaid\s*\n([\s\S]*?)\n:::/gi;
				const matches = [...text.matchAll(adoPattern)];

				if (matches.length === 0) continue;

				parentElement.setAttribute('data-mermaid-processed', 'true');

				for (const match of matches) {
					const code = match[1].trim();
					if (!code) continue;

					try {
						const diagramId = `mermaid-ado-${Math.random().toString(36).substring(7)}`;
						log.info(`Rendering ADO diagram: ${diagramId}`);

						// Render diagram to SVG
						const renderedDiagram = await mermaid.render(diagramId, code);
						const svgContent =
							typeof renderedDiagram === 'string'
								? renderedDiagram
								: (renderedDiagram as any).svg;

						// Create wrapper with light background
						const wrapper = document.createElement('div');
						wrapper.className = 'mermaid-preview-wrapper';
						if (currentTheme === 'dark') {
							wrapper.classList.add('dark-theme');
						}

						const content = document.createElement('div');
						content.className = 'mermaid-preview-content';
						content.innerHTML = svgContent;
						wrapper.appendChild(content);

						// Create toolbar
						const toolbar = createToolbar(diagramId);
						wrapper.appendChild(toolbar);

						// Create container for wrapper
						const container = document.createElement('div');
						container.className = 'mermaid-block';
						container.appendChild(wrapper);

						// Replace the parent element's content with the rendered diagram
						parentElement.innerHTML = '';
						parentElement.appendChild(container);

						log.info(`Successfully rendered ADO diagram: ${diagramId}`);
					} catch (error) {
						log.error('Failed to render ADO diagram:', error);
					}
				}
			}
		}

		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			await new Promise((resolve) =>
				document.addEventListener('DOMContentLoaded', resolve),
			);
		}

		// Process initial page
		await processMermaidBlocks();

		// Watch for DOM changes (markdown preview refresh)
		let debounceTimer: NodeJS.Timeout;
		const observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				const unprocessed = document.querySelectorAll(
					'pre > code.language-mermaid:not([data-mermaid-processed])',
				);
				if (unprocessed.length > 0) {
					log.info(
						`New content detected: ${unprocessed.length} unprocessed block(s)`,
					);
					await processMermaidBlocks();
				}
			}, 300);
		});

		observer.observe(document, {
			childList: true,
			subtree: true,
		});

		log.info('Initialization complete - watching for content changes');
	} catch (error) {
		log.error('Fatal initialization error:', error);

		// Show error in the page
		const errorDiv = document.createElement('div');
		errorDiv.style.padding = '20px';
		errorDiv.style.color = '#d32f2f';
		errorDiv.style.fontFamily = 'monospace';
		errorDiv.style.whiteSpace = 'pre-wrap';
		errorDiv.style.backgroundColor = '#ffebee';
		errorDiv.style.borderRadius = '4px';
		errorDiv.style.margin = '10px';
		errorDiv.style.fontSize = '12px';
		const msg = error instanceof Error ? error.stack : String(error);
		errorDiv.innerHTML = `<strong>Mermaid Loader Error:</strong><br/>${msg}`;
		document.body.insertAdjacentElement('afterbegin', errorDiv);
	}
})();
