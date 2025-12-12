import * as vscode from 'vscode';
import { Logger } from './util/logger';

export class MermaidPreviewPanel {
    public static currentPanel: MermaidPreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _logger: Logger;
    private _disposables: vscode.Disposable[] = [];
    private _updateTimeout: NodeJS.Timeout | undefined;
    private _currentDocument: vscode.TextDocument | undefined;

    public static createOrShow(
        extensionUri: vscode.Uri,
        document: vscode.TextDocument,
        viewColumn: vscode.ViewColumn
    ) {
        // If we already have a panel, show it
        if (MermaidPreviewPanel.currentPanel) {
            MermaidPreviewPanel.currentPanel._panel.reveal(viewColumn);
            MermaidPreviewPanel.currentPanel.updateContent(document);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'mermaidPreview',
            'Mermaid Preview',
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        MermaidPreviewPanel.currentPanel = new MermaidPreviewPanel(
            panel,
            extensionUri,
            document
        );
    }

    public static createOrShowSingle(
        extensionUri: vscode.Uri,
        document: vscode.TextDocument,
        lineNumber: number,
        viewColumn: vscode.ViewColumn
    ) {
        // Create a new panel for single diagram
        const panel = vscode.window.createWebviewPanel(
            'mermaidPreview',
            'Mermaid Diagram Preview',
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        const instance = new MermaidPreviewPanel(
            panel,
            extensionUri,
            document
        );
        instance.updateContentAtLine(document, lineNumber);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        document: vscode.TextDocument
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentDocument = document;
        this._logger = Logger.instance;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                this._logger.logDebug('WebviewMessage', `Received ${message.command}`, message);
                switch (message.command) {
                    case 'changeTheme':
                        this._handleThemeChange(message.theme);
                        break;
                    case 'saveThemePreference':
                        this._saveThemePreference(message.theme);
                        break;
                    case 'exportDiagram':
                        this._logger.logDebug('Export', 'Received export request from webview', {
                            format: message.format,
                            index: message.index,
                            dataLength: message.data?.length
                        });
                        this._handleExportDiagram(message.data, message.format, message.index);
                        break;
                    case 'exportError':
                        this._logger.logError('Webview reported export error', message.error ?? 'Unknown error');
                        vscode.window.showErrorMessage(`Failed to export diagram: ${message.error ?? 'Unknown error'}`);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public updateContent(document: vscode.TextDocument) {
        this._currentDocument = document;

        // Clear existing timeout
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }

        // Get refresh delay from config
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        const delay = config.get<number>('refreshDelay', 500);

        // Debounce updates
        this._updateTimeout = setTimeout(() => {
            this._update();
        }, delay);
    }

    public updateContentAtLine(document: vscode.TextDocument, lineNumber: number) {
        this._currentDocument = document;
        const mermaidCode = this._extractMermaidCodeAtLine(document, lineNumber);

        if (!mermaidCode) {
            this._panel.webview.html = this._getErrorHtml('No Mermaid diagram found at this position.');
            return;
        }

        // Get theme from config
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        const useVSCodeTheme = config.get<boolean>('useVSCodeTheme', false);
        const configuredTheme = config.get<string>('theme', 'default');

        let theme = configuredTheme;

        // If useVSCodeTheme is enabled, determine theme based on VSCode theme
        if (useVSCodeTheme) {
            const colorTheme = vscode.window.activeColorTheme;
            theme = colorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'default';
        }

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, mermaidCode, theme);
    }

    private _handleThemeChange(theme: string) {
        // Just update the preview, don't save to settings
        this._update(theme);
    }

    private _saveThemePreference(theme: string) {
        // Save to workspace or global settings
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        config.update('theme', theme, vscode.ConfigurationTarget.Global);
    }

    private async _handleExportDiagram(data: string, format: string, index: number) {
        this._logger.logDebug('Export', 'Handling export request', { format, index, dataLength: data?.length });

        // Show save dialog
        const filters: { [name: string]: string[] } = {};
        if (format === 'svg') {
            filters['SVG Image'] = ['svg'];
        } else if (format === 'png') {
            filters['PNG Image'] = ['png'];
        } else if (format === 'jpg') {
            filters['JPEG Image'] = ['jpg', 'jpeg'];
        }

        this._logger.logDebug('Export', 'Showing save dialog', { filters });
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`mermaid-diagram-${index + 1}.${format}`),
            filters: filters
        });

        this._logger.logInfo('Export dialog closed', { path: uri?.fsPath ?? 'cancelled' });

        if (!uri) {
            return; // User cancelled
        }

        // Write the file
        try {
            const buffer = Buffer.from(data, 'base64');
            await vscode.workspace.fs.writeFile(uri, buffer);
            vscode.window.showInformationMessage(`Diagram exported to ${uri.fsPath}`);
            this._logger.logInfo('Diagram exported successfully', { path: uri.fsPath });
        } catch (error) {
            this._logger.logError('Failed to export diagram', error instanceof Error ? error : new Error(String(error)));
            vscode.window.showErrorMessage(`Failed to export diagram: ${error}`);
        }
    }

    private _update(overrideTheme?: string) {
        const webview = this._panel.webview;

        if (!this._currentDocument) {
            webview.html = this._getErrorHtml('No document to preview');
            return;
        }

        const mermaidCode = this._extractMermaidCode(this._currentDocument);

        if (!mermaidCode) {
            webview.html = this._getErrorHtml(
                'No Mermaid diagram found. Wrap your diagram in ```mermaid code blocks.'
            );
            return;
        }

        // Get theme from config or override
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        const useVSCodeTheme = config.get<boolean>('useVSCodeTheme', false);
        const configuredTheme = config.get<string>('theme', 'default');

        let theme = overrideTheme || configuredTheme;

        // If useVSCodeTheme is enabled, determine theme based on VSCode theme
        if (useVSCodeTheme && !overrideTheme) {
            const colorTheme = vscode.window.activeColorTheme;
            theme = colorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'default';
        }

        webview.html = this._getHtmlForWebview(webview, mermaidCode, theme);
    }

    private _extractMermaidCode(document: vscode.TextDocument): string | null {
        const text = document.getText();
        this._logger.logDebug('MermaidDetection', 'Document snapshot', {
            length: text.length,
            preview: text.substring(0, 200)
        });

        // More flexible regex that handles:
        // - Optional whitespace after 'mermaid'
        // - Both Unix (\n) and Windows (\r\n) line endings
        // - Optional trailing newline before closing fence
        const mermaidRegex = /```mermaid[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)?```/g;
        const matches = [...text.matchAll(mermaidRegex)];
        this._logger.logDebug('MermaidDetection', 'Number of matches found', { count: matches.length });

        if (matches.length === 0) {
            // Try alternative patterns to help debug
            const hasTripleBacktick = text.includes('```');
            const hasMermaidKeyword = text.includes('mermaid');
            this._logger.logDebug('MermaidDetection', 'Fallback flags', {
                hasTripleBacktick,
                hasMermaidKeyword
            });

            // Check for the pattern without newline requirements
            const simpleRegex = /```mermaid/g;
            const simpleMatches = [...text.matchAll(simpleRegex)];
            this._logger.logDebug('MermaidDetection', 'Simple pattern matches', { count: simpleMatches.length });

            return null;
        }

        // Extract all mermaid blocks and validate they have content
        const diagrams = matches
            .map(match => match[1].trim())
            .filter(code => code.length > 0);

        this._logger.logDebug('MermaidDetection', 'Valid diagrams detected', { count: diagrams.length });

        if (diagrams.length === 0) {
            return null;
        }

        // Return all diagrams as a JSON array string
        return JSON.stringify(diagrams);
    }

    private _extractMermaidCodeAtLine(document: vscode.TextDocument, lineNumber: number): string | null {
        const text = document.getText();
        const mermaidRegex = /```mermaid[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)?```/g;

        let match;
        while ((match = mermaidRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            // Check if the lineNumber falls within this mermaid block
            if (lineNumber >= startPos.line && lineNumber <= endPos.line) {
                const diagramCode = match[1].trim();
                if (diagramCode.length > 0) {
                    // Return as a JSON array with single diagram
                    return JSON.stringify([diagramCode]);
                }
            }
        }

        return null;
    }

    private _getHtmlForWebview(
        webview: vscode.Webview,
        mermaidCode: string,
        theme: string
    ): string {
        // mermaidCode is now a JSON string array of diagrams
        const diagrams = JSON.parse(mermaidCode);

        // Escape each diagram for safe embedding
        const escapedDiagrams = diagrams.map((code: string) =>
            code.replace(/\\/g, '\\\\')
                .replace(/`/g, '\\`')
                .replace(/\$/g, '\\$')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid Preview</title>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

        const vscode = acquireVsCodeApi();
        let currentZoom = 1.0;
        const diagrams = ${JSON.stringify(escapedDiagrams)};

        mermaid.initialize({
            startOnLoad: false,
            theme: '${theme}',
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true }
        });

        async function renderAllDiagrams() {
            const container = document.getElementById('diagrams-container');
            container.innerHTML = '';

            for (let i = 0; i < diagrams.length; i++) {
                const diagramWrapper = document.createElement('div');
                diagramWrapper.className = 'diagram-wrapper';
                diagramWrapper.innerHTML = \`
                    <div class="diagram-header">
                        <span class="diagram-title">Diagram \${i + 1} of \${diagrams.length}</span>
                        <div class="diagram-actions">
                            <div class="export-dropdown">
                                <button class="action-btn export-btn" onclick="toggleExportMenu(\${i})">
                                    Export ▾
                                </button>
                                <div class="export-menu" id="export-menu-\${i}">
                                    <button onclick="exportDiagram(\${i}, 'svg'); closeExportMenu(\${i})">SVG</button>
                                    <button onclick="exportDiagram(\${i}, 'png'); closeExportMenu(\${i})">PNG</button>
                                    <button onclick="exportDiagram(\${i}, 'jpg'); closeExportMenu(\${i})">JPG</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="diagram-content" id="diagram-\${i}">Loading...</div>
                \`;
                container.appendChild(diagramWrapper);

                try {
                    const { svg } = await mermaid.render('mermaid-' + i + '-' + Date.now(), diagrams[i]);
                    document.getElementById('diagram-' + i).innerHTML = svg;
                } catch (error) {
                    document.getElementById('diagram-' + i).innerHTML =
                        '<div class="error">Error: ' + error.message + '</div>';
                }
            }

            applyZoom();
        }

        function applyZoom() {
            document.querySelectorAll('.diagram-content').forEach(el => {
                el.style.transform = \`scale(\${currentZoom})\`;
            });
            document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
        }

        window.zoomIn = function() {
            currentZoom = Math.min(currentZoom + 0.1, 3.0);
            applyZoom();
        };

        window.zoomOut = function() {
            currentZoom = Math.max(currentZoom - 0.1, 0.3);
            applyZoom();
        };

        window.zoomReset = function() {
            currentZoom = 1.0;
            applyZoom();
        };

        window.handleThemeChange = function(newTheme) {
            mermaid.initialize({
                startOnLoad: false,
                theme: newTheme,
                securityLevel: 'loose',
                flowchart: { useMaxWidth: true, htmlLabels: true }
            });
            renderAllDiagrams();
        };

        function getSvgDimensions(svgEl) {
            const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
            if (viewBox && viewBox.width && viewBox.height) {
                return { width: viewBox.width, height: viewBox.height };
            }

            const widthAttr = parseFloat(svgEl.getAttribute('width') || '');
            const heightAttr = parseFloat(svgEl.getAttribute('height') || '');
            if (!isNaN(widthAttr) && !isNaN(heightAttr)) {
                return { width: widthAttr, height: heightAttr };
            }

            try {
                const bbox = svgEl.getBBox();
                if (bbox.width && bbox.height) {
                    return { width: bbox.width, height: bbox.height };
                }
            } catch (err) {
                console.warn('getBBox failed, falling back to client dimensions', err);
            }

            return {
                width: svgEl.clientWidth || 800,
                height: svgEl.clientHeight || 600
            };
        }

        function loadImage(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = url;
            });
        }

        function canvasToBase64(canvas, mimeType) {
            return new Promise((resolve, reject) => {
                if (canvas.toBlob) {
                    canvas.toBlob(blob => {
                        if (!blob) {
                            reject(new Error('Failed to create image blob'));
                            return;
                        }

                        const reader = new FileReader();
                        reader.onloadend = () => {
                            if (typeof reader.result === 'string') {
                                resolve(reader.result.split(',')[1]);
                            } else {
                                reject(new Error('Unexpected reader result type'));
                            }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    }, mimeType, 0.95);
                    return;
                }

                try {
                    const dataUrl = canvas.toDataURL(mimeType, 0.95);
                    resolve(dataUrl.split(',')[1]);
                } catch (error) {
                    reject(error);
                }
            });
        }

        async function rasterizeSvg(svgEl, format) {
            const { width, height } = getSvgDimensions(svgEl);
            const clonedSvg = svgEl.cloneNode(true);
            clonedSvg.setAttribute('width', String(width));
            clonedSvg.setAttribute('height', String(height));

            const svgData = new XMLSerializer().serializeToString(clonedSvg);
            const encodedSvg = encodeURIComponent(svgData);
            const imgSrc = \`data:image/svg+xml;charset=utf-8,\${encodedSvg}\`;

            const img = await loadImage(imgSrc);
            const canvas = document.createElement('canvas');
            const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 4);
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                throw new Error('Unable to acquire canvas context');
            }

            ctx.setTransform(scale, 0, 0, scale, 0, 0);

            if (format === 'jpg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
            } else {
                ctx.clearRect(0, 0, width, height);
            }

            ctx.drawImage(img, 0, 0, width, height);
            return await canvasToBase64(canvas, format === 'jpg' ? 'image/jpeg' : 'image/png');
        }

        function notifyExportError(message, format) {
            vscode.postMessage({
                command: 'exportError',
                format,
                error: message
            });
        }

        window.exportDiagram = async function(index, format) {
            const diagramEl = document.getElementById('diagram-' + index);
            const svgEl = diagramEl.querySelector('svg');
            if (!svgEl) {
                console.error('SVG element not found');
                return;
            }

            try {
                // Clone the SVG to avoid modifying the original
                const clonedSvg = svgEl.cloneNode(true);

                if (format === 'svg') {
                    // SVG export
                    const svgData = new XMLSerializer().serializeToString(clonedSvg);
                    const base64Data = btoa(unescape(encodeURIComponent(svgData)));

                    console.log('Sending SVG export message to extension');
                    vscode.postMessage({
                        command: 'exportDiagram',
                        format: 'svg',
                        data: base64Data,
                        index: index
                    });
                } else {
                    try {
                        console.log('Rasterizing SVG for', format, 'export');
                        const base64Data = await rasterizeSvg(svgEl, format);
                        vscode.postMessage({
                            command: 'exportDiagram',
                            format: format,
                            data: base64Data,
                            index: index
                        });
                    } catch (rasterError) {
                        console.error('Rasterization failed:', rasterError);
                        notifyExportError(rasterError instanceof Error ? rasterError.message : String(rasterError), format);
                    }
                }
            } catch (error) {
                console.error('Export failed:', error);
                notifyExportError(error instanceof Error ? error.message : String(error), format);
            }
        };

        window.toggleExportMenu = function(index) {
            const menu = document.getElementById('export-menu-' + index);
            const allMenus = document.querySelectorAll('.export-menu');

            // Close all other menus
            allMenus.forEach(m => {
                if (m !== menu) {
                    m.classList.remove('show');
                }
            });

            // Toggle current menu
            menu.classList.toggle('show');
        };

        window.closeExportMenu = function(index) {
            const menu = document.getElementById('export-menu-' + index);
            menu.classList.remove('show');
        };

        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.export-dropdown')) {
                document.querySelectorAll('.export-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });

        window.addEventListener('load', renderAllDiagrams);
    </script>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }

        .toolbar {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .toolbar-group {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 8px;
            border-right: 1px solid var(--vscode-editorWidget-border);
        }

        .toolbar-group:last-child { border-right: none; }

        .toolbar button, .action-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }

        .toolbar button:hover, .action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        #zoom-level {
            min-width: 45px;
            text-align: center;
            font-size: 12px;
            font-weight: 600;
        }

        #diagrams-container {
            padding: 20px;
        }

        .diagram-wrapper {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
            margin-bottom: 24px;
            overflow: hidden;
        }

        .diagram-header {
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            padding: 10px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }

        .diagram-title {
            font-weight: 600;
            font-size: 13px;
        }

        .diagram-actions {
            display: flex;
            gap: 6px;
        }

        .export-dropdown {
            position: relative;
            display: inline-block;
        }

        .export-btn {
            padding: 6px 12px;
            font-size: 12px;
        }

        .export-menu {
            display: none;
            position: absolute;
            right: 0;
            top: 100%;
            margin-top: 4px;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 3px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            min-width: 100px;
        }

        .export-menu.show {
            display: block;
        }

        .export-menu button {
            width: 100%;
            text-align: left;
            padding: 8px 16px;
            background: transparent;
            color: var(--vscode-menu-foreground);
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
        }

        .export-menu button:hover {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .diagram-content {
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            transform-origin: top center;
            transition: transform 0.2s ease;
        }

        .diagram-content svg {
            max-width: 100%;
            height: auto;
        }

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 16px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-group">
            <button onclick="zoomOut()">−</button>
            <span id="zoom-level">100%</span>
            <button onclick="zoomIn()">+</button>
            <button onclick="zoomReset()">Reset</button>
        </div>
        <div class="toolbar-group">
            <label for="theme-select">Theme:</label>
            <select id="theme-select" onchange="handleThemeChange(this.value)">
                <option value="default" ${theme === 'default' ? 'selected' : ''}>Default</option>
                <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
                <option value="forest" ${theme === 'forest' ? 'selected' : ''}>Forest</option>
                <option value="neutral" ${theme === 'neutral' ? 'selected' : ''}>Neutral</option>
                <option value="base" ${theme === 'base' ? 'selected' : ''}>Base</option>
            </select>
        </div>
    </div>
    <div id="diagrams-container"></div>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid Preview - Error</title>
    <style>
        body {
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .error-container {
            text-align: center;
            max-width: 500px;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .error-message {
            color: var(--vscode-errorForeground);
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-message">${message}</div>
    </div>
</body>
</html>`;
    }

    public dispose() {
        MermaidPreviewPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
