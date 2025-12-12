import * as vscode from 'vscode';
import { MermaidPreviewPanel } from './previewPanel';
import { Logger } from './util/logger';

class MermaidCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const mermaidRegex = /```mermaid[^\S\r\n]*(?:\r?\n)/g;

        let match;
        while ((match = mermaidRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const range = new vscode.Range(startPos, startPos);

            const command: vscode.Command = {
                title: 'Preview Diagram',
                command: 'mermaid-preview.showDiagramAtPosition',
                arguments: [document.uri, startPos.line]
            };

            codeLenses.push(new vscode.CodeLens(range, command));
        }

        return codeLenses;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const logger = Logger.instance;
    context.subscriptions.push(logger);
    logger.logInfo('Mermaid Preview extension activated');

    // Refresh preview when VS Code theme changes so appearance rules can be re-applied
    const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(() => {
        MermaidPreviewPanel.currentPanel?.refreshAppearance();
    });
    context.subscriptions.push(themeChangeListener);

    const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('mermaidPreview.previewAppearance')) {
            MermaidPreviewPanel.currentPanel?.refreshAppearance();
        }
    });
    context.subscriptions.push(configChangeListener);

    // Register CodeLens provider
    const codeLensProvider = new MermaidCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown', scheme: 'file' },
            codeLensProvider
        )
    );

    // Register command to show preview
    const showPreviewCommand = vscode.commands.registerCommand(
        'mermaid-preview.showPreview',
        () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                MermaidPreviewPanel.createOrShow(
                    context.extensionUri,
                    editor.document,
                    vscode.ViewColumn.Active
                );
            }
        }
    );

    // Register command to show preview to the side
    const showPreviewToSideCommand = vscode.commands.registerCommand(
        'mermaid-preview.showPreviewToSide',
        () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                MermaidPreviewPanel.createOrShow(
                    context.extensionUri,
                    editor.document,
                    vscode.ViewColumn.Beside
                );
            }
        }
    );

    // Register command to show diagram at specific position
    const showDiagramAtPositionCommand = vscode.commands.registerCommand(
        'mermaid-preview.showDiagramAtPosition',
        async (uri: vscode.Uri, line: number) => {
            const document = await vscode.workspace.openTextDocument(uri);
            MermaidPreviewPanel.createOrShowSingle(
                context.extensionUri,
                document,
                line,
                vscode.ViewColumn.Beside
            );
        }
    );

    // Watch for document changes
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
        (e) => {
            const config = vscode.workspace.getConfiguration('mermaidPreview');
            const autoRefresh = config.get<boolean>('autoRefresh', true);

            // Only update if it's a markdown file
            if (autoRefresh && e.document.languageId === 'markdown' && MermaidPreviewPanel.currentPanel) {
                MermaidPreviewPanel.currentPanel.updateContent(e.document);
            }
        }
    );

    // Watch for active editor changes
    const changeActiveEditorSubscription = vscode.window.onDidChangeActiveTextEditor(
        (editor) => {
            // Only update if it's a markdown file
            if (editor && editor.document.languageId === 'markdown' && MermaidPreviewPanel.currentPanel) {
                MermaidPreviewPanel.currentPanel.updateContent(editor.document);
            }
        }
    );

    context.subscriptions.push(
        showPreviewCommand,
        showPreviewToSideCommand,
        showDiagramAtPositionCommand,
        changeDocumentSubscription,
        changeActiveEditorSubscription
    );
}

export function deactivate() {}
