# Quick Start Guide

## Testing the Extension Locally

1. **Open the extension project in VSCode**:
   ```bash
   cd mermaid-preview-extension
   code .
   ```

2. **Press F5** to launch the Extension Development Host (a new VSCode window)

3. **Create or open a Markdown file** with a Mermaid diagram:
   ```markdown
   # My Diagram

   ```mermaid
   graph TD
       A[Start] --> B{Decision}
       B -->|Yes| C[Success]
       B -->|No| D[Try Again]
       D --> A
   ```
   ```

4. **Open the preview**:
   - Click the preview icon in the editor toolbar, OR
   - Press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux)
   - Type "Mermaid: Open Preview to the Side"

5. **Try different themes**:
   - In the preview panel, use the theme dropdown
   - Select: default, dark, forest, neutral, or base
   - Toggle "Sync with VSCode theme" to test automatic theme switching
   - Click "Save as Default" to persist your choice

## Building for Distribution

```bash
# Install vsce (VSCode Extension Manager)
npm install -g @vscode/vsce

# Package the extension
vsce package

# This creates a .vsix file you can install or publish
```

## Installing the .vsix File

```bash
code --install-extension mermaid-preview-0.0.1.vsix
```

Or in VSCode:
1. Go to Extensions view (`Cmd+Shift+X`)
2. Click `...` menu → Install from VSIX
3. Select the generated `.vsix` file

## Key Features to Test

1. **Theme Independence**: Change VSCode theme - Mermaid theme stays the same (unless "Sync with VSCode theme" is enabled)
2. **Live Updates**: Edit the diagram - preview updates automatically
3. **Multiple Diagrams**: Add multiple mermaid blocks - all render in one preview
4. **Theme Persistence**: Select a theme, save it, close preview, reopen - theme is remembered

## Troubleshooting

- **Preview not updating?** Check that `mermaidPreview.autoRefresh` is `true` in settings
- **Diagram not rendering?** Ensure you have an internet connection (uses Mermaid CDN)
- **Changes not compiling?** Run `npm run watch` for automatic compilation

## Configuration Options

Open Settings (`Cmd+,` / `Ctrl+,`) and search for "mermaidPreview":

```json
{
  "mermaidPreview.theme": "default",
  "mermaidPreview.useVSCodeTheme": false,
  "mermaidPreview.autoRefresh": true,
  "mermaidPreview.refreshDelay": 500
}
```

## Next Steps

- Test with your ER diagram in `aqa/esp-mgmt/er-diagram.md`
- Customize the extension to your needs
- Add more Mermaid themes if desired
- Publish to the VSCode Marketplace (update publisher name in package.json first)
