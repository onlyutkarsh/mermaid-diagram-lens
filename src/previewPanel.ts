import * as vscode from 'vscode';
import { Logger } from './util/logger';

type PreviewAppearance = 'matchVSCode' | 'light' | 'dark';
type PreviewMode = 'all' | 'single';

export class MermaidPreviewPanel {
    public static currentPanel: MermaidPreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _logger: Logger;
    private _disposables: vscode.Disposable[] = [];
    private _updateTimeout: NodeJS.Timeout | undefined;
    private _currentDocument: vscode.TextDocument | undefined;
    private _mode: PreviewMode = 'all';
    private _singleLine: number | undefined;

    public static createOrShow(
        extensionUri: vscode.Uri,
        document: vscode.TextDocument,
        viewColumn: vscode.ViewColumn
    ) {
        // If we already have a panel, show it
        if (MermaidPreviewPanel.currentPanel) {
            MermaidPreviewPanel.currentPanel._switchToAllMode(document);
            MermaidPreviewPanel.currentPanel._panel.reveal(viewColumn);
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
            document,
            'all'
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

        new MermaidPreviewPanel(
            panel,
            extensionUri,
            document,
            'single',
            lineNumber
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        document: vscode.TextDocument,
        mode: PreviewMode,
        singleLine?: number
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentDocument = document;
        this._logger = Logger.instance;
        this._mode = mode;
        this._singleLine = singleLine;

        // Set the webview's initial html content
        this._render();

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
                    case 'changeAppearance':
                        this._handleAppearanceChange(message.appearance as PreviewAppearance);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private _setMode(mode: PreviewMode, lineNumber?: number) {
        this._mode = mode;
        this._singleLine = lineNumber;
    }

    private _switchToAllMode(document: vscode.TextDocument) {
        this._currentDocument = document;
        this._setMode('all');
        this._render();
    }

    private _switchToSingleMode(document: vscode.TextDocument, lineNumber: number) {
        this._currentDocument = document;
        this._setMode('single', lineNumber);
        this._renderSingle(lineNumber);
    }

    private _render(overrideTheme?: string) {
        if (this._mode === 'single' && this._singleLine !== undefined) {
            this._renderSingle(this._singleLine, overrideTheme);
        } else {
            this._renderAll(overrideTheme);
        }
    }

    public updateContent(document: vscode.TextDocument) {
        this._currentDocument = document;

        if (this._mode !== 'all') {
            return;
        }

        // Clear existing timeout
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }

        // Get refresh delay from config
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        const delay = config.get<number>('refreshDelay', 500);

        // Debounce updates
        this._updateTimeout = setTimeout(() => {
            this._render();
        }, delay);
    }

    public updateContentAtLine(document: vscode.TextDocument, lineNumber: number) {
        this._switchToSingleMode(document, lineNumber);
    }

    private _handleThemeChange(theme: string) {
        // Persist the selection and update the preview
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        config.update('useVSCodeTheme', false, vscode.ConfigurationTarget.Global);
        config.update('theme', theme, vscode.ConfigurationTarget.Global);
        this._render(theme);
    }

    private _saveThemePreference(theme: string) {
        // Save to workspace or global settings
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        config.update('theme', theme, vscode.ConfigurationTarget.Global);
    }

    private async _handleAppearanceChange(appearance: PreviewAppearance) {
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        await config.update('previewAppearance', appearance, vscode.ConfigurationTarget.Global);
        this.refreshAppearance();
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

    private _renderAll(overrideTheme?: string) {
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

        const { theme, appearance } = this._resolveTheme(overrideTheme);
        webview.html = this._getHtmlForWebview(webview, mermaidCode, theme, appearance);
    }

    private _renderSingle(lineNumber: number, overrideTheme?: string) {
        const webview = this._panel.webview;

        if (!this._currentDocument) {
            webview.html = this._getErrorHtml('No document to preview');
            return;
        }

        const mermaidCode = this._extractMermaidCodeAtLine(this._currentDocument, lineNumber);

        if (!mermaidCode) {
            webview.html = this._getErrorHtml('No Mermaid diagram found at this position.');
            return;
        }

        const { theme, appearance } = this._resolveTheme(overrideTheme);
        webview.html = this._getHtmlForWebview(webview, mermaidCode, theme, appearance);
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

    private _resolveTheme(overrideTheme?: string): { theme: string; appearance: PreviewAppearance } {
        const config = vscode.workspace.getConfiguration('mermaidPreview');
        const useVSCodeTheme = config.get<boolean>('useVSCodeTheme', false);
        const configuredTheme = config.get<string>('theme', 'default');
        const appearance = config.get<PreviewAppearance>('previewAppearance', 'matchVSCode');

        let theme = overrideTheme || configuredTheme;

        if (useVSCodeTheme && !overrideTheme) {
            if (appearance === 'light') {
                theme = 'default';
            } else if (appearance === 'dark') {
                theme = 'dark';
            } else {
                const colorTheme = vscode.window.activeColorTheme;
                theme = colorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'default';
            }
        }

        return { theme, appearance };
    }

    private _getAppearanceClass(appearance: PreviewAppearance): string {
        switch (appearance) {
            case 'light':
                return 'appearance-light';
            case 'dark':
                return 'appearance-dark';
            default:
                return 'appearance-match';
        }
    }

    private _getHtmlForWebview(
        webview: vscode.Webview,
        mermaidCode: string,
        theme: string,
        appearance: PreviewAppearance
    ): string {
        const diagrams = JSON.parse(mermaidCode);
        const escapedDiagrams = diagrams.map((code: string) =>
            code.replace(/\\/g, '\\\\')
                .replace(/`/g, '\\`')
                .replace(/\$/g, '\\$')
        );
        const appearanceClass = this._getAppearanceClass(appearance);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid Preview</title>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

        const vscode = acquireVsCodeApi();
        const diagrams = ${JSON.stringify(escapedDiagrams)};
        let currentZoom = 1.0;
        let panX = 0;
        let panY = 0;
        let isPanning = false;
        let lastPanX = 0;
        let lastPanY = 0;
        let panInitialized = false;
        let activeDiagramIndex = 0;
        let currentTheme = '${theme}';
        let currentAppearance = '${appearance}';
        let stageEl = null;
        let pendingTransform = null;
        let pendingZoomUpdate = null;
        const THEME_LABELS = {
            default: 'Default',
            dark: 'Dark',
            forest: 'Forest',
            neutral: 'Neutral',
            base: 'Base'
        };
        const APPEARANCE_LABELS = {
            matchVSCode: 'Match VS Code',
            light: 'Light',
            dark: 'Dark'
        };

        mermaid.initialize({
            startOnLoad: false,
            theme: currentTheme,
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true }
        });

        function initializePanAndZoom() {
            if (panInitialized) {
                return;
            }
            panInitialized = true;
            const viewport = document.getElementById('diagram-viewport');
            viewport.addEventListener('pointerdown', startPan);
            viewport.addEventListener('pointermove', panMove);
            viewport.addEventListener('pointerup', endPan);
            viewport.addEventListener('pointerleave', endPan);
            viewport.addEventListener('pointercancel', endPan);
            viewport.addEventListener('wheel', handleWheel, { passive: false });
        }

        async function renderAllDiagrams() {
            const container = document.getElementById('diagrams-container');
            container.innerHTML = '';

            for (let i = 0; i < diagrams.length; i++) {
                const shell = document.createElement('div');
                shell.className = 'diagram-shell';
                shell.dataset.index = i.toString();
                shell.innerHTML = '<div class="diagram-content" id="diagram-' + i + '">Loading...</div>';
                container.appendChild(shell);

                try {
                    const { svg } = await mermaid.render('mermaid-' + i + '-' + Date.now(), diagrams[i]);
                    document.getElementById('diagram-' + i).innerHTML = svg;
                } catch (error) {
                    document.getElementById('diagram-' + i).innerHTML =
                        '<div class="error">Error: ' + error.message + '</div>';
                }

                shell.addEventListener('click', () => focusDiagram(i));
            }

            scheduleTransform();
            setActiveDiagram(activeDiagramIndex);
            updateDiagramIndicator();
            initializePanAndZoom();
        }

        function scheduleTransform() {
            if (pendingTransform) {
                return;
            }
            pendingTransform = requestAnimationFrame(applyTransform);
        }

        function scheduleZoomUpdate() {
            if (pendingZoomUpdate) {
                return;
            }
            pendingZoomUpdate = requestAnimationFrame(applyZoomScale);
        }

        function applyTransform() {
            pendingTransform = null;
            if (!stageEl) {
                return;
            }
            const roundedPanX = Math.round(panX);
            const roundedPanY = Math.round(panY);
            stageEl.style.transform = 'translate(' + roundedPanX + 'px, ' + roundedPanY + 'px)';
        }

        function applyZoomScale() {
            pendingZoomUpdate = null;
            document.querySelectorAll('.diagram-content').forEach(el => {
                el.style.transform = 'scale(' + currentZoom + ')';
            });
            document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
        }

        window.zoomIn = function() {
            currentZoom = Math.min(currentZoom + 0.1, 5.0);
            scheduleZoomUpdate();
        };

        window.zoomOut = function() {
            currentZoom = Math.max(currentZoom - 0.1, 0.5);
            scheduleZoomUpdate();
        };

        window.zoomReset = function() {
            currentZoom = 1.0;
            panX = 0;
            panY = 0;
            scheduleTransform();
            scheduleZoomUpdate();
        };

        function startPan(event) {
            if (event.target.closest('.dropdown')) {
                return;
            }
            isPanning = true;
            lastPanX = event.clientX;
            lastPanY = event.clientY;
            event.target.setPointerCapture(event.pointerId);
            document.body.classList.add('is-panning');
        }

        function panMove(event) {
            if (!isPanning) {
                return;
            }
            event.preventDefault();
            const dx = event.clientX - lastPanX;
            const dy = event.clientY - lastPanY;
            lastPanX = event.clientX;
            lastPanY = event.clientY;
            panX += dx / currentZoom;
            panY += dy / currentZoom;
            scheduleTransform();
        }

        function endPan(event) {
            if (!isPanning) {
                return;
            }
            isPanning = false;
            try {
                event.target.releasePointerCapture(event.pointerId);
            } catch (err) {
                // ignore
            }
            document.body.classList.remove('is-panning');
        }

        function handleWheel(event) {
            if (!event.ctrlKey) {
                return;
            }
            event.preventDefault();
            if (event.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }

        function updateDiagramIndicator() {
            const indicator = document.getElementById('diagram-indicator');
            const controls = document.getElementById('diagram-controls');
            if (!indicator || !controls) {
                return;
            }
            const hasMultiple = diagrams.length > 1;
            indicator.textContent = hasMultiple
                ? 'Diagram ' + (activeDiagramIndex + 1) + ' of ' + diagrams.length
                : '';
            controls.style.display = hasMultiple ? 'flex' : 'none';
        }

        function setActiveDiagram(index) {
            if (!diagrams.length) {
                return;
            }
            activeDiagramIndex = Math.max(0, Math.min(diagrams.length - 1, index));
            document.querySelectorAll('.diagram-shell').forEach((shell, idx) => {
                shell.classList.toggle('active', idx === activeDiagramIndex);
            });
            updateDiagramIndicator();
        }

        function focusDiagram(index) {
            setActiveDiagram(index);
            const target = document.getElementById('diagram-' + index);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        window.navigateDiagram = function(delta) {
            if (!diagrams.length) {
                return;
            }
            const next = (activeDiagramIndex + delta + diagrams.length) % diagrams.length;
            focusDiagram(next);
        };

        function getAppearanceClass(appearance) {
            if (appearance === 'light') {
                return 'appearance-light';
            }
            if (appearance === 'dark') {
                return 'appearance-dark';
            }
            return 'appearance-match';
        }

        function setBodyAppearance(appearance) {
            const classList = document.body.classList;
            classList.remove('appearance-light', 'appearance-dark', 'appearance-match');
            classList.add(getAppearanceClass(appearance));
            currentAppearance = appearance;
            updateDropdownSelection('dropdown-appearance', appearance);
            updateAppearanceButtonLabel(appearance);
        }

        function updateDropdownSelection(menuId, value) {
            document.querySelectorAll('#' + menuId + ' button').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.value === value);
            });
        }

        function updateThemeButtonLabel(theme) {
            const button = document.getElementById('theme-button');
            if (button) {
                const label = THEME_LABELS[theme] || 'Custom';
                button.textContent = 'Theme: ' + label + ' ▾';
            }
        }

        function updateAppearanceButtonLabel(appearance) {
            const button = document.getElementById('appearance-button');
            if (button) {
                const label = APPEARANCE_LABELS[appearance] || 'Custom';
                button.textContent = 'Appearance: ' + label + ' ▾';
            }
        }

        function closeAllDropdowns(exceptId) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                if (menu.id === exceptId) {
                    return;
                }
                menu.classList.remove('show');
            });
        }

        window.toggleDropdown = function(name) {
            const menu = document.getElementById('dropdown-' + name);
            const isOpen = menu.classList.contains('show');
            closeAllDropdowns(isOpen ? undefined : menu.id);
            if (!isOpen) {
                menu.classList.add('show');
            }
        };

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.dropdown')) {
                closeAllDropdowns();
            }
        });

        window.handleThemeChange = function(newTheme) {
            currentTheme = newTheme;
            updateDropdownSelection('dropdown-theme', newTheme);
            updateThemeButtonLabel(newTheme);
            mermaid.initialize({
                startOnLoad: false,
                theme: newTheme,
                securityLevel: 'loose',
                flowchart: { useMaxWidth: true, htmlLabels: true }
            });
            renderAllDiagrams();
            vscode.postMessage({
                command: 'changeTheme',
                theme: newTheme
            });
        };

        window.handleAppearanceChange = function(newAppearance) {
            setBodyAppearance(newAppearance);
            vscode.postMessage({
                command: 'changeAppearance',
                appearance: newAppearance
            });
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
            const imgSrc = 'data:image/svg+xml;charset=utf-8,' + encodedSvg;

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

        window.exportActiveDiagram = async function(format) {
            exportDiagram(activeDiagramIndex, format);
        };

        async function exportDiagram(index, format) {
            const diagramEl = document.getElementById('diagram-' + index);
            const svgEl = diagramEl?.querySelector('svg');
            if (!svgEl) {
                console.error('SVG element not found');
                return;
            }

            try {
                const clonedSvg = svgEl.cloneNode(true);

                if (format === 'svg') {
                    const svgData = new XMLSerializer().serializeToString(clonedSvg);
                    const base64Data = btoa(unescape(encodeURIComponent(svgData)));
                    vscode.postMessage({
                        command: 'exportDiagram',
                        format: 'svg',
                        data: base64Data,
                        index: index
                    });
                } else {
                    try {
                        const base64Data = await rasterizeSvg(svgEl, format);
                        vscode.postMessage({
                            command: 'exportDiagram',
                            format: format,
                            data: base64Data,
                            index: index
                        });
                    } catch (rasterError) {
                        notifyExportError(rasterError instanceof Error ? rasterError.message : String(rasterError), format);
                    }
                }
            } catch (error) {
                notifyExportError(error instanceof Error ? error.message : String(error), format);
            }
        }

        window.addEventListener('load', () => {
            stageEl = document.getElementById('diagram-stage');
            setBodyAppearance(currentAppearance);
            updateDropdownSelection('dropdown-theme', currentTheme);
            updateDropdownSelection('dropdown-appearance', currentAppearance);
            updateThemeButtonLabel(currentTheme);
            renderAllDiagrams();
            scheduleZoomUpdate();
            scheduleTransform();
        });
    </script>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        body.appearance-match {
            /* VS Code theme defaults */
        }

        body.appearance-light {
            --vscode-editor-background: #ffffff;
            --vscode-editor-foreground: #1f1f1f;
            --vscode-editorWidget-background: #f3f3f3;
            --vscode-editorWidget-border: #dcdcdc;
            --vscode-editorGroupHeader-tabsBackground: #f8f8f8;
            --vscode-button-background: #0067c0;
            --vscode-button-foreground: #ffffff;
            --vscode-button-hoverBackground: #0058a6;
            --vscode-menu-background: #ffffff;
            --vscode-menu-border: #dcdcdc;
            --vscode-menu-foreground: #1f1f1f;
            --vscode-menu-selectionBackground: #e6f2ff;
            --vscode-menu-selectionForeground: #1f1f1f;
            --vscode-errorForeground: #a1260d;
            --vscode-inputValidation-errorBackground: #f8d7da;
            --vscode-inputValidation-errorBorder: #f5c6cb;
        }

        body.appearance-dark {
            --vscode-editor-background: #1e1e1e;
            --vscode-editor-foreground: #f3f3f3;
            --vscode-editorWidget-background: #252526;
            --vscode-editorWidget-border: #3c3c3c;
            --vscode-editorGroupHeader-tabsBackground: #2c2c2c;
            --vscode-button-background: #0e639c;
            --vscode-button-foreground: #ffffff;
            --vscode-button-hoverBackground: #1177bb;
            --vscode-menu-background: #252526;
            --vscode-menu-border: #3c3c3c;
            --vscode-menu-foreground: #f3f3f3;
            --vscode-menu-selectionBackground: #094771;
            --vscode-menu-selectionForeground: #ffffff;
            --vscode-errorForeground: #f48771;
            --vscode-inputValidation-errorBackground: #5a1d1d;
            --vscode-inputValidation-errorBorder: #be1100;
        }

        body.is-panning {
            cursor: grabbing;
        }

        .toolbar {
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            padding: 10px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            z-index: 2;
        }

        .toolbar-group {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 8px;
            border-right: 1px solid var(--vscode-editorWidget-border);
        }

        .toolbar-group:last-child {
            border-right: none;
        }

        .toolbar button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }

        .toolbar button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .toolbar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        #zoom-level {
            min-width: 45px;
            text-align: center;
            font-size: 12px;
            font-weight: 600;
        }

        #diagram-viewport {
            flex: 1;
            overflow: auto;
            background-color: var(--vscode-editor-background);
        }

        #diagram-stage {
            width: 100%;
            min-height: 100%;
            transform-origin: center center;
            will-change: transform;
        }

        #diagrams-container {
            padding: 32px 48px;
            display: flex;
            flex-direction: column;
            gap: 32px;
        }

        .diagram-shell {
            padding: 0;
        }

        .diagram-shell.active {
            box-shadow: none;
            background-color: transparent;
        }

        .diagram-content {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            transform-origin: top left;
            transition: transform 0.1s ease-out;
            cursor: grab;
        }

        .diagram-content svg {
            width: 100%;
            height: auto;
        }

        body.is-panning .diagram-content {
            cursor: grabbing;
        }

        .dropdown {
            position: relative;
        }

        .action-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
        }

        .dropdown-menu {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            min-width: 140px;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 4px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.18);
            z-index: 10;
        }

        .dropdown-menu.show {
            display: block;
        }

        .dropdown-menu button {
            width: 100%;
            padding: 8px 14px;
            background: transparent;
            color: var(--vscode-menu-foreground);
            border: none;
            text-align: left;
            font-size: 12px;
            cursor: pointer;
        }

        .dropdown-menu button:hover,
        .dropdown-menu button.selected {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .diagram-indicator {
            font-size: 12px;
            font-weight: 600;
            min-width: 140px;
            text-align: center;
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
<body class="${appearanceClass}">
    <div class="toolbar">
        <div class="toolbar-group">
            <button onclick="zoomOut()">−</button>
            <span id="zoom-level">100%</span>
            <button onclick="zoomIn()">+</button>
            <button onclick="zoomReset()">Reset</button>
        </div>
        <div class="toolbar-group" id="diagram-controls">
            <button id="prev-diagram" onclick="navigateDiagram(-1)">◀</button>
            <span id="diagram-indicator"></span>
            <button id="next-diagram" onclick="navigateDiagram(1)">▶</button>
        </div>
        <div class="toolbar-group dropdown">
            <button class="action-btn" id="theme-button" onclick="toggleDropdown('theme')">Theme ▾</button>
            <div class="dropdown-menu" id="dropdown-theme">
                <button data-value="default" onclick="handleThemeChange('default')">Default</button>
                <button data-value="dark" onclick="handleThemeChange('dark')">Dark</button>
                <button data-value="forest" onclick="handleThemeChange('forest')">Forest</button>
                <button data-value="neutral" onclick="handleThemeChange('neutral')">Neutral</button>
                <button data-value="base" onclick="handleThemeChange('base')">Base</button>
            </div>
        </div>
        <div class="toolbar-group dropdown">
            <button class="action-btn" id="appearance-button" onclick="toggleDropdown('appearance')">Appearance ▾</button>
            <div class="dropdown-menu" id="dropdown-appearance">
                <button data-value="matchVSCode" onclick="handleAppearanceChange('matchVSCode')">Match VS Code</button>
                <button data-value="light" onclick="handleAppearanceChange('light')">Light</button>
                <button data-value="dark" onclick="handleAppearanceChange('dark')">Dark</button>
            </div>
        </div>
        <div class="toolbar-group dropdown">
            <button class="action-btn" onclick="toggleDropdown('export')">Export ▾</button>
            <div class="dropdown-menu" id="dropdown-export">
                <button onclick="exportActiveDiagram('svg')">SVG</button>
                <button onclick="exportActiveDiagram('png')">PNG</button>
                <button onclick="exportActiveDiagram('jpg')">JPG</button>
            </div>
        </div>
    </div>
    <div id="diagram-viewport">
        <div id="diagram-stage">
            <div id="diagrams-container"></div>
        </div>
    </div>
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

    public refreshAppearance() {
        if (!this._currentDocument) {
            return;
        }

        this._render();
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
