import * as vscode from 'vscode';
import { MermaidFoldingProvider } from './foldingProvider';
import {
	createMarkdownItPlugin,
	type MarkdownItLike,
	registerMarkdownPlugin,
} from './markdownPlugin';
import { MermaidPreviewPanel, MermaidPreviewSerializer } from './previewPanel';
import { Logger } from './util/logger';

function findMermaidBlockStartLines(document: vscode.TextDocument): number[] {
	const text = document.getText();
	const fencedRegex = /```mermaid[^\S\r\n]*(?:\r?\n)/g;
	const adoRegex = /:::\s*mermaid[^\S\r\n]*(?:\r?\n)/gm;
	const lines: number[] = [];

	let match: RegExpExecArray | null = fencedRegex.exec(text);
	while (match !== null) {
		const startPos = document.positionAt(match.index);
		lines.push(startPos.line);
		match = fencedRegex.exec(text);
	}

	match = adoRegex.exec(text);
	while (match !== null) {
		const startPos = document.positionAt(match.index);
		lines.push(startPos.line);
		match = adoRegex.exec(text);
	}

	return [...new Set(lines)].sort((a, b) => a - b);
}

function getMermaidBlockAtLine(
	document: vscode.TextDocument,
	line: number,
): string | undefined {
	const text = document.getText();

	// For standalone .mmd or .mermaid files, return entire content
	if (document.languageId === 'mermaid') {
		return text.trim();
	}

	// For markdown files, extract mermaid code blocks
	const fencedRegex = /```mermaid[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)?```/g;
	let match: RegExpExecArray | null = fencedRegex.exec(text);

	while (match !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);

		if (line >= startPos.line && line <= endPos.line) {
			const block = match[1] ?? '';
			return block.trim();
		}
		match = fencedRegex.exec(text);
	}

	// For markdown files, extract ADO container blocks :::mermaid ... :::
	const adoRegex = /:::\s*mermaid\s*\r?\n([\s\S]*?)\r?\n:::/g;
	match = adoRegex.exec(text);
	while (match !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);

		if (line >= startPos.line && line <= endPos.line) {
			const block = match[1] ?? '';
			return block.trim();
		}
		match = adoRegex.exec(text);
	}

	return undefined;
}

function stripStandaloneMermaidFrontMatter(text: string): string {
	const normalizedText = text.trim();
	if (!normalizedText.startsWith('---')) {
		return normalizedText;
	}

	const lines = normalizedText.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') {
		return normalizedText;
	}

	let closingLine = -1;
	for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
		const currentLine = lines[lineIndex]?.trim();
		if (currentLine === '---' || currentLine === '...') {
			closingLine = lineIndex;
			break;
		}
	}

	if (closingLine === -1) {
		return normalizedText;
	}

	return lines
		.slice(closingLine + 1)
		.join('\n')
		.trim();
}

function getMermaidBlockWithoutFrontMatter(
	document: vscode.TextDocument,
): string | undefined {
	if (document.languageId !== 'mermaid') {
		return undefined;
	}

	const text = document.getText();
	return stripStandaloneMermaidFrontMatter(text);
}

class MermaidCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const lenses: vscode.CodeLens[] = [];

		// For standalone .mmd/.mermaid files, add CodeLens at the top
		if (document.languageId === 'mermaid') {
			const position = new vscode.Position(0, 0);
			const range = new vscode.Range(position, position);

			const previewCommand: vscode.Command = {
				title: 'Preview',
				command: 'mermaidLivePreview.showPreviewToSide',
				arguments: [],
			};

			const copyCommand: vscode.Command = {
				title: 'Copy',
				command: 'mermaidLivePreview.copyDiagramCode',
				arguments: [document.uri],
			};

			lenses.push(new vscode.CodeLens(range, previewCommand));
			lenses.push(new vscode.CodeLens(range, copyCommand));
			return lenses;
		}

		// For markdown files, find mermaid code blocks
		for (const line of findMermaidBlockStartLines(document)) {
			const position = new vscode.Position(line, 0);
			const range = new vscode.Range(position, position);
			const command: vscode.Command = {
				title: 'Preview',
				command: 'mermaidLivePreview.showDiagramAtPosition',
				arguments: [document.uri, line],
			};

			const copyCommand: vscode.Command = {
				title: 'Copy',
				command: 'mermaidLivePreview.copyDiagramCode',
				arguments: [document.uri, line],
			};

			lenses.push(new vscode.CodeLens(range, command));
			lenses.push(new vscode.CodeLens(range, copyCommand));
		}

		return lenses;
	}
}

class MermaidGutterDecorator implements vscode.Disposable {
	private readonly decorationType: vscode.TextEditorDecorationType;

	constructor(extensionUri: vscode.Uri) {
		const iconPath = vscode.Uri.joinPath(
			extensionUri,
			'images',
			'mermaid-gutter.svg',
		);
		this.decorationType = vscode.window.createTextEditorDecorationType({
			gutterIconPath: iconPath,
			gutterIconSize: 'contain',
		});
	}

	public update(editor?: vscode.TextEditor) {
		if (!editor) {
			return;
		}

		if (editor.document.languageId !== 'markdown') {
			editor.setDecorations(this.decorationType, []);
			return;
		}

		const decorations = findMermaidBlockStartLines(editor.document).map(
			(line) => ({
				range: new vscode.Range(line, 0, line, 0),
				hoverMessage: 'Mermaid diagram',
			}),
		);
		editor.setDecorations(this.decorationType, decorations);
	}

	public updateForDocument(document: vscode.TextDocument) {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document === document) {
				this.update(editor);
			}
		}
	}

	public dispose() {
		this.decorationType.dispose();
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const logger = Logger.instance;
	const isUIContext =
		context.extension.extensionKind === vscode.ExtensionKind.UI;

	context.subscriptions.push(logger);
	logger.logInfo(
		`Mermaid Viewer extension activating (UI context: ${isUIContext})...`,
	);

	// Explicitly register the markdown-it plugin to ensure preview integration
	try {
		await registerMarkdownPlugin(context);
		logger.logInfo('Markdown-it plugin explicitly registered');
	} catch (error) {
		logger.logError(
			'Failed to explicitly register markdown-it plugin',
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// Register markdown-it plugin for native markdown preview support
	try {
		const _markdownItPlugin = createMarkdownItPlugin();
		// The plugin is automatically picked up by VS Code when:
		// 1. We declare "markdown.markdownItPlugins": true in package.json
		// 2. We export the extendMarkdownIt function
		logger.logInfo('Markdown-it plugin registered for native preview support');
	} catch (error) {
		logger.logError(
			'Failed to register markdown-it plugin',
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// Force-refresh any open markdown previews so they pick up our markdown-it
	// plugin (avoids race where preview opens before extendMarkdownIt is called).
	void vscode.commands.executeCommand('markdown.preview.refresh');

	// Register webview panel serializer for restoring panels after reload
	const serializer = new MermaidPreviewSerializer(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(
			MermaidPreviewPanel.viewType,
			serializer,
		),
	);

	// Only register gutter decorators in workspace context (not UI)
	let gutterDecorator: MermaidGutterDecorator | undefined;
	if (!isUIContext) {
		gutterDecorator = new MermaidGutterDecorator(context.extensionUri);
		context.subscriptions.push(gutterDecorator);
		gutterDecorator.update(vscode.window.activeTextEditor);
	}

	// Refresh preview when VS Code theme changes so appearance rules can be re-applied
	const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(() => {
		MermaidPreviewPanel.forEachPanel((panel) => panel.refreshAppearance());
	});
	context.subscriptions.push(themeChangeListener);

	const configChangeListener = vscode.workspace.onDidChangeConfiguration(
		(event) => {
			if (event.affectsConfiguration('mermaidLivePreview.previewAppearance')) {
				if (MermaidPreviewPanel.consumeSuppressedAppearanceRefresh()) {
					return;
				}
				MermaidPreviewPanel.forEachPanel((panel) => panel.refreshAppearance());
			}
		},
	);
	context.subscriptions.push(configChangeListener);

	// Register CodeLens provider for both markdown and mermaid files
	const codeLensProvider = new MermaidCodeLensProvider();
	const foldingProvider = new MermaidFoldingProvider();

	// Batch all provider registrations
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[
				{ language: 'markdown', scheme: 'file' },
				{ language: 'mermaid', scheme: 'file' },
				{ language: 'mermaid', scheme: 'untitled' },
			],
			codeLensProvider,
		),
		vscode.languages.registerFoldingRangeProvider(
			[
				{ language: 'mermaid', scheme: 'file' },
				{ language: 'mermaid', scheme: 'untitled' },
			],
			foldingProvider,
		),
	);

	const copyDiagramCodeCommand = vscode.commands.registerCommand(
		'mermaidLivePreview.copyDiagramCode',
		async (uri: vscode.Uri | undefined, line: number | undefined) => {
			try {
				let document: vscode.TextDocument | undefined;
				let targetLine = line;

				if (uri) {
					document = await vscode.workspace.openTextDocument(uri);
				} else if (vscode.window.activeTextEditor) {
					document = vscode.window.activeTextEditor.document;
					if (typeof targetLine !== 'number') {
						targetLine = vscode.window.activeTextEditor.selection.active.line;
					}
				}

				if (!document) {
					logger.logError('copyDiagramCode could not resolve a document');
					vscode.window.showErrorMessage(
						'Unable to copy Mermaid diagram: no document context available.',
					);
					return;
				}

				if (
					document.languageId !== 'markdown' &&
					document.languageId !== 'mermaid'
				) {
					logger.logWarning(
						'copyDiagramCode invoked for unsupported document',
						{
							languageId: document.languageId,
							uri: document.uri.toString(),
						},
					);
					vscode.window.showInformationMessage(
						'Mermaid Viewer only works with Markdown and Mermaid files.',
					);
					return;
				}

				if (typeof targetLine !== 'number') {
					if (document.languageId === 'mermaid') {
						targetLine = 0;
					} else {
						logger.logError('copyDiagramCode missing line information');
						vscode.window.showErrorMessage(
							'Unable to copy Mermaid diagram: missing line information.',
						);
						return;
					}
				}

				const config = vscode.workspace.getConfiguration('mermaidLivePreview');
				const includeFrontMatter = config.get<boolean>(
					'copy.includeFrontMatter',
					true,
				);

				let rawCode: string | undefined;
				if (document.languageId === 'mermaid' && !includeFrontMatter) {
					rawCode = getMermaidBlockWithoutFrontMatter(document);
				} else {
					rawCode = getMermaidBlockAtLine(document, targetLine);
				}

				if (!rawCode) {
					vscode.window.showInformationMessage(
						'No Mermaid diagram found at this location to copy.',
					);
					return;
				}

				await vscode.env.clipboard.writeText(rawCode);
				logger.logInfo('Copied Mermaid diagram to clipboard', {
					command: 'copyDiagramCode',
					line: targetLine,
					length: rawCode.length,
				});
				vscode.window.showInformationMessage(
					'Mermaid diagram copied to the clipboard.',
				);
			} catch (error) {
				logger.logError(
					'Failed to copy Mermaid diagram code',
					error instanceof Error ? error : new Error(String(error)),
				);
				vscode.window.showErrorMessage(
					'Unable to copy Mermaid diagram. See output for details.',
				);
			}
		},
	);

	const copyDiagramCodeWithWrapperCommand = vscode.commands.registerCommand(
		'mermaidLivePreview.copyDiagramCodeWithWrapper',
		async (uri: vscode.Uri | undefined, line: number | undefined) => {
			try {
				let document: vscode.TextDocument | undefined;
				let targetLine = line;

				if (uri) {
					document = await vscode.workspace.openTextDocument(uri);
				} else if (vscode.window.activeTextEditor) {
					document = vscode.window.activeTextEditor.document;
					if (typeof targetLine !== 'number') {
						targetLine = vscode.window.activeTextEditor.selection.active.line;
					}
				}

				if (!document) {
					logger.logError(
						'copyDiagramCodeWithWrapper could not resolve a document',
					);
					vscode.window.showErrorMessage(
						'Unable to copy Mermaid diagram: no document context available.',
					);
					return;
				}

				if (
					document.languageId !== 'markdown' &&
					document.languageId !== 'mermaid'
				) {
					logger.logWarning(
						'copyDiagramCodeWithWrapper invoked for unsupported document',
						{
							languageId: document.languageId,
							uri: document.uri.toString(),
						},
					);
					vscode.window.showInformationMessage(
						'Mermaid Viewer only works with Markdown and Mermaid files.',
					);
					return;
				}

				if (typeof targetLine !== 'number') {
					if (document.languageId === 'mermaid') {
						targetLine = 0;
					} else {
						logger.logError(
							'copyDiagramCodeWithWrapper missing line information',
						);
						vscode.window.showErrorMessage(
							'Unable to copy Mermaid diagram: missing line information.',
						);
						return;
					}
				}

				const config = vscode.workspace.getConfiguration('mermaidLivePreview');
				const includeFrontMatter = config.get<boolean>(
					'copy.includeFrontMatter',
					true,
				);
				const wrapper = config.get<string>('copy.wrapper', '{{mermaid-code}}');

				let rawCode: string | undefined;
				if (document.languageId === 'mermaid' && !includeFrontMatter) {
					rawCode = getMermaidBlockWithoutFrontMatter(document);
				} else {
					rawCode = getMermaidBlockAtLine(document, targetLine);
				}

				if (!rawCode) {
					vscode.window.showInformationMessage(
						'No Mermaid diagram found at this location to copy.',
					);
					return;
				}

				const textToCopy = (() => {
					if (wrapper.trim() === '') {
						return rawCode;
					}
					if (!wrapper.includes('{{mermaid-code}}')) {
						logger.logWarning(
							'copy.wrapper is set but missing {{mermaid-code}} placeholder; copying plain code',
							{ wrapper },
						);
						vscode.window.showWarningMessage(
							'Mermaid Viewer: copy.wrapper setting is missing the {{mermaid-code}} placeholder. Copied plain code instead. Update the setting in Preferences.',
						);
						return rawCode;
					}

					// Check if code is already wrapped with the same wrapper
					const [prefix, suffix] = wrapper.split('{{mermaid-code}}');
					const trimmedPrefix = prefix.trimEnd();
					const trimmedSuffix = suffix.trimStart();
					if (
						trimmedPrefix &&
						trimmedSuffix &&
						rawCode.startsWith(trimmedPrefix) &&
						rawCode.endsWith(trimmedSuffix)
					) {
						// Already wrapped, return as-is
						return rawCode;
					}

					return wrapper.replace('{{mermaid-code}}', rawCode);
				})();

				await vscode.env.clipboard.writeText(textToCopy);
				logger.logInfo('Copied Mermaid diagram with wrapper to clipboard', {
					command: 'copyDiagramCodeWithWrapper',
					line: targetLine,
					length: textToCopy.length,
				});
				vscode.window.showInformationMessage(
					'Mermaid diagram with wrapper copied to the clipboard.',
				);
			} catch (error) {
				logger.logError(
					'Failed to copy Mermaid diagram code with wrapper',
					error instanceof Error ? error : new Error(String(error)),
				);
				vscode.window.showErrorMessage(
					'Unable to copy Mermaid diagram. See output for details.',
				);
			}
		},
	);

	// Register command to show preview
	const showPreviewCommand = vscode.commands.registerCommand(
		'mermaidLivePreview.showPreview',
		() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				logger.logWarning('showPreview invoked without an active editor');
				vscode.window.showInformationMessage(
					'Open a Markdown or Mermaid file containing diagrams to preview them.',
				);
				return;
			}

			if (
				editor.document.languageId !== 'markdown' &&
				editor.document.languageId !== 'mermaid'
			) {
				logger.logWarning('showPreview invoked for unsupported document', {
					languageId: editor.document.languageId,
					uri: editor.document.uri.toString(),
				});
				vscode.window.showInformationMessage(
					'Mermaid Viewer only works with Markdown and Mermaid files.',
				);
				return;
			}

			MermaidPreviewPanel.createOrShow(
				context.extensionUri,
				editor.document,
				vscode.ViewColumn.Active,
			);
		},
	);

	// Register command to show preview to the side
	const showPreviewToSideCommand = vscode.commands.registerCommand(
		'mermaidLivePreview.showPreviewToSide',
		() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				logger.logWarning('showPreviewToSide invoked without an active editor');
				vscode.window.showInformationMessage(
					'Open a Markdown or Mermaid file containing diagrams to preview them.',
				);
				return;
			}

			if (
				editor.document.languageId !== 'markdown' &&
				editor.document.languageId !== 'mermaid'
			) {
				logger.logWarning(
					'showPreviewToSide invoked for unsupported document',
					{
						languageId: editor.document.languageId,
						uri: editor.document.uri.toString(),
					},
				);
				vscode.window.showInformationMessage(
					'Mermaid Viewer only works with Markdown and Mermaid files.',
				);
				return;
			}

			MermaidPreviewPanel.createOrShow(
				context.extensionUri,
				editor.document,
				vscode.ViewColumn.Beside,
			);
		},
	);

	const showDiagramAtPositionCommand = vscode.commands.registerCommand(
		'mermaidLivePreview.showDiagramAtPosition',
		async (uri: vscode.Uri | undefined, line: number | undefined) => {
			try {
				let document: vscode.TextDocument | undefined;
				let targetLine = line;

				if (uri) {
					document = await vscode.workspace.openTextDocument(uri);
				} else if (vscode.window.activeTextEditor) {
					document = vscode.window.activeTextEditor.document;
					if (typeof targetLine !== 'number') {
						targetLine = vscode.window.activeTextEditor.selection.active.line;
					}
				}

				if (!document) {
					logger.logError('showDiagramAtPosition could not resolve a document');
					vscode.window.showErrorMessage(
						'Unable to open diagram preview: no document context available.',
					);
					return;
				}

				if (
					document.languageId !== 'markdown' &&
					document.languageId !== 'mermaid'
				) {
					logger.logWarning(
						'showDiagramAtPosition invoked for unsupported document',
						{
							languageId: document.languageId,
							uri: document.uri.toString(),
						},
					);
					vscode.window.showInformationMessage(
						'Mermaid Viewer only works with Markdown and Mermaid files.',
					);
					return;
				}

				if (typeof targetLine !== 'number') {
					logger.logError('showDiagramAtPosition missing line information');
					vscode.window.showErrorMessage(
						'Unable to open diagram preview: missing line information.',
					);
					return;
				}

				MermaidPreviewPanel.createOrShowSingle(
					context.extensionUri,
					document,
					targetLine,
					vscode.ViewColumn.Beside,
				);
			} catch (error) {
				logger.logError(
					'Failed to open document for showDiagramAtPosition',
					error instanceof Error ? error : new Error(String(error)),
				);
				vscode.window.showErrorMessage(
					'Unable to open Mermaid diagram preview. See output for details.',
				);
			}
		},
	);

	// Watch for document changes
	const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
		(e) => {
			gutterDecorator?.updateForDocument(e.document);

			const config = vscode.workspace.getConfiguration('mermaidLivePreview');
			const autoRefresh = config.get<boolean>('autoRefresh', true);

			// Update if it's a markdown or mermaid file
			const isSupported =
				e.document.languageId === 'markdown' ||
				e.document.languageId === 'mermaid';
			if (autoRefresh && isSupported && MermaidPreviewPanel.hasOpenPanels()) {
				MermaidPreviewPanel.forEachPanel((panel) =>
					panel.updateContent(e.document),
				);
			}
		},
	);

	// Watch for active editor changes
	const changeActiveEditorSubscription =
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			gutterDecorator?.update(editor);

			// Update if it's a markdown or mermaid file
			if (editor) {
				const isSupported =
					editor.document.languageId === 'markdown' ||
					editor.document.languageId === 'mermaid';
				if (isSupported && MermaidPreviewPanel.hasOpenPanels()) {
					MermaidPreviewPanel.forEachPanel((panel) =>
						panel.updateContent(editor.document),
					);
				}
			}
		});

	const visibleEditorsSubscription =
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			for (const editor of editors) {
				gutterDecorator?.update(editor);
			}
		});

	const selectionChangeSubscription =
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (!MermaidPreviewPanel.hasOpenPanels()) {
				return;
			}

			const editor = event.textEditor;
			const isSupported =
				editor.document.languageId === 'markdown' ||
				editor.document.languageId === 'mermaid';
			if (!isSupported) {
				return;
			}

			const activeLine = event.selections[0]?.active.line;
			if (typeof activeLine !== 'number') {
				return;
			}

			MermaidPreviewPanel.forEachPanel((panel) =>
				panel.handleSelectionChange(editor.document, activeLine),
			);
		});

	context.subscriptions.push(
		showPreviewCommand,
		showPreviewToSideCommand,
		showDiagramAtPositionCommand,
		copyDiagramCodeCommand,
		copyDiagramCodeWithWrapperCommand,
		changeDocumentSubscription,
		changeActiveEditorSubscription,
		visibleEditorsSubscription,
		selectionChangeSubscription,
	);

	logger.logInfo('Mermaid Viewer extension activated successfully');

	// Return markdown-it API exactly like the reference extension contract.
	// VS Code markdown preview reads this object from activate() and uses it
	// to transform markdown before preview scripts run.
	return {
		extendMarkdownIt(md: MarkdownItLike) {
			Logger.instance.logInfo(
				`extendMarkdownIt (activate return) called by VS Code (md=${md ? 'present' : 'missing'})`,
			);
			return createMarkdownItPlugin()(md);
		},
	};
}

export function deactivate() {}

// Export API for VS Code's markdown preview to use our markdown-it plugin
export function extendMarkdownIt(md: MarkdownItLike) {
	Logger.instance.logInfo(
		`extendMarkdownIt called by VS Code (md=${md ? 'present' : 'missing'})`,
	);
	return createMarkdownItPlugin()(md);
}
