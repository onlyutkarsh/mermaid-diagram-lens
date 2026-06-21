# Mermaid Viewer

A VSCode extension that gives you a powerful viewer for Mermaid diagrams with independent theme selection, appearance overrides, and export controls. Everything stays local-no accounts, Copilot prompts, or external services-while the dedicated preview surface (plus CodeLens buttons and gutter highlights) keeps multi- and single-diagram workflows fast.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Mermaid diagrams in markdown code blocks and standalone `.mmd`/`.mermaid` files
- **Live Preview**: Automatic preview updates as you edit, with side-by-side layout and multi-diagram support (navigate between blocks with the toolbar controls)
- **Theming**: Choose from five built-in themes (default, dark, forest, neutral, base), optionally sync with your VS Code theme, and save your preference as the default
- **Preview & Navigation**: Toolbar with zoom (`+`/`-`), pan (arrow keys or drag), reset (`R`), reload, and appearance override (match VS Code, light, or dark). Works with keyboard shortcuts too
- **On-Document Shortcuts**: CodeLens buttons and gutter icons on every Mermaid block let you open a focused single-diagram preview without leaving the editor
- **Export & Copy Image**: Save or copy any diagram as SVG, PNG (1x–4x), or JPG (1x–4x) from the toolbar — dimensions shown before you export
- **Copy Source**: Copy raw Mermaid code via CodeLens or command palette
- **Copy with Wrapper**: Wrap copied code in a configurable template — useful for platforms that require a specific syntax (e.g. Azure DevOps). Configure via `mermaidLivePreview.copy.wrapper` in settings:
  ```
  :::mermaid
  {{mermaid-code}}
  :::
  ```

- **ELK Layout Support**: Use the [ELK layout engine](https://eclipse.dev/elk/) for complex diagrams by adding `layout: elk` frontmatter — works with ER diagrams, flowcharts, and more. Loaded on demand, so there is no cost for diagrams that use the default layout
- **Offline Friendly**: Bundles Mermaid locally, so previews work without a network connection or account

## Demo

![Demo](https://raw.githubusercontent.com/onlyutkarsh/mermaid-viewer/main/marketplace/demo.gif)

## Usage

### Opening the Preview

1. Open a Markdown file containing Mermaid diagrams
2. Use one of these methods:
   - Click the preview icon in the editor title bar
   - Right-click in the editor and select "Mermaid Viewer: Open Preview"
   - Use Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for "Mermaid Viewer: Open Preview"
   - For side-by-side view: "Mermaid Viewer: Open Preview to the Side"

### Changing Themes

In the preview panel toolbar:
- Use the **Theme** dropdown to select different themes
- Check **"Sync with VSCode theme"** to automatically match VSCode's theme
- Click **"Save as Default"** to persist your theme choice

### Previewing Individual Diagrams

- A **CodeLens button** labeled *Preview Diagram* appears above every Mermaid block in Markdown (fenced `mermaid` blocks and `::: mermaid` containers); clicking it opens a panel focused on that diagram.
- In standalone `.mmd`/`.mermaid` files, the CodeLens appears at the top so you can preview or copy quickly.
- A subtle **gutter icon** highlights Mermaid block starts in Markdown, so you can spot diagrams quickly (it's a visual cue only; use CodeLens to open preview).
- The editor toolbar/title icon still opens the multi-diagram preview, so you can see every Mermaid block at once.

### Copying Diagram Code

- **Copy** (`Preview | Copy` CodeLens): Copies the raw Mermaid source for the block, respecting the `copy.includeFrontMatter` setting for standalone files.
- **Copy with Wrapper**: Wraps the diagram code in the template configured in `mermaidLivePreview.copy.wrapper` before copying. Useful for pasting into platforms that require a specific syntax, such as Azure DevOps (`::: mermaid ... :::`).
  - Available via right-click context menu, command palette, or a custom keyboard shortcut.
  - If the code already contains the wrapper, it won't be applied twice.
  - Configure the wrapper in settings:
    ```json
    "mermaidLivePreview.copy.wrapper": ":::mermaid\n{{mermaid-code}}\n:::"
    ```

![CodeLens and Gutter Icon](https://raw.githubusercontent.com/onlyutkarsh/mermaid-viewer/main/marketplace/preview.webp)

### Using ELK Layout

For complex diagrams where the default dagre layout produces crowded or hard-to-read results, you can switch to the [ELK layout engine](https://eclipse.dev/elk/) by adding a frontmatter config block:

````
```mermaid
---
config:
  layout: elk
---
erDiagram
  Customer ||--o{ Order : places
  Order ||--|{ LineItem : contains
  Product ||--o{ LineItem : "ordered in"
```
````

ELK layout is supported on ER diagrams, flowcharts, and any other diagram type that accepts a `layout` config. The ELK engine is loaded on demand (only when a diagram requests it), so there is no performance cost for diagrams that use the default layout.

ELK also supports several sub-algorithms via `layout: elk.<algorithm>`:

| Algorithm          | Description                            |
| ------------------ | -------------------------------------- |
| `elk`              | Layered layout (default ELK algorithm) |
| `elk.stress`       | Force-directed stress minimization     |
| `elk.force`        | Simple force-directed layout           |
| `elk.mrtree`       | Compact tree layout                    |
| `elk.sporeOverlap` | Overlap removal                        |

### Supported Themes

- **Default**: Classic Mermaid theme with clean, neutral colors
- **Dark**: Dark background with light elements
- **Forest**: Green-themed palette
- **Neutral**: Minimalist grayscale theme
- **Base**: Simple base theme

## Configuration

Configure the extension through VSCode settings:

```json
{
  // Default theme for Mermaid diagrams
  "mermaidLivePreview.theme": "default",

  // Automatically sync Mermaid theme with VSCode theme
  "mermaidLivePreview.useVSCodeTheme": false,

  // Automatically refresh preview on document changes
  "mermaidLivePreview.autoRefresh": true,

  // Delay in milliseconds before refreshing preview after changes
  "mermaidLivePreview.refreshDelay": 500,

  // Include frontmatter when copying from standalone .mmd/.mermaid files
  "mermaidLivePreview.copy.includeFrontMatter": true,

  // Template used when copying with wrapper. Use {{mermaid-code}} as the placeholder.
  // Example for Azure DevOps:
  "mermaidLivePreview.copy.wrapper": ":::mermaid\n{{mermaid-code}}\n:::"
}
```

## Example Mermaid Diagram

````
```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Awesome!]
    B -->|No| D[Debug it]
    D --> B
    C --> E[End]
```
````
## Commands

- `Mermaid Viewer: Open Preview` - Shows Mermaid diagrams from the active Markdown or Mermaid file in the current editor column.
- `Mermaid Viewer: Open Preview to the Side` - Same preview behavior, but always opens in the column beside the editor for live editing.
- `Mermaid Viewer: Preview Diagram Here` - Focuses only the Mermaid block at the current cursor (or the CodeLens target) and keeps that single-diagram panel in sync while you type.
- `Mermaid Viewer: Copy` - Copies the raw Mermaid source code for the diagram at the current cursor position.
- `Mermaid Viewer: Copy with Wrapper` - Copies the diagram code wrapped in the template from `mermaidLivePreview.copy.wrapper`. Also available via right-click context menu.

## Requirements

- VSCode 1.85.0 or higher
- Markdown files with Mermaid code blocks (fenced `mermaid`) or ADO-style Mermaid containers (`::: mermaid ... :::`)
- Mermaid files (`.mmd`, `.mermaid`)

## Known Limitations

- Markdown preview supports Mermaid fenced blocks and ADO-style `::: mermaid` containers.
- ADO containers must be properly closed with `:::` to be extracted as a diagram.

## Extension Settings

This extension contributes the following settings:

* `mermaidLivePreview.theme`: Choose the default Mermaid theme
* `mermaidLivePreview.useVSCodeTheme`: Sync theme with VSCode
* `mermaidLivePreview.autoRefresh`: Enable/disable auto-refresh
* `mermaidLivePreview.refreshDelay`: Set refresh delay in milliseconds
* `mermaidLivePreview.copy.includeFrontMatter`: Include frontmatter when copying from standalone `.mmd`/`.mermaid` files (default: `true`)
* `mermaidLivePreview.copy.wrapper`: Template applied by "Copy with Wrapper". Use `{{mermaid-code}}` as the placeholder (default: `{{mermaid-code}}`)

## Contributing

Found a bug or have a feature request? Please open an issue!

## License

MIT - if you build on Mermaid Viewer, please keep the copyright notice intact and include attribution to Utkarsh Shigihalli in your distribution or documentation.
