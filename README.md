# Mermaid Preview with Themes

A VSCode extension that provides a rich preview experience for Mermaid diagrams with independent theme selection, not tied to your VSCode theme.

## Features

- **Independent Theme Selection**: Choose from multiple Mermaid themes (default, dark, forest, neutral, base) directly in the preview panel
- **Optional VSCode Theme Sync**: Toggle option to automatically sync Mermaid theme with your VSCode theme (dark/light)
- **Live Preview**: Automatic preview updates as you edit your Mermaid diagrams
- **Side-by-Side View**: Open preview beside your editor for convenient editing
- **Theme Persistence**: Save your preferred theme as default
- **Multi-Diagram Support**: Preview all Mermaid diagrams in a single document

## Usage

### Opening the Preview

1. Open a Markdown file containing Mermaid diagrams
2. Use one of these methods:
   - Click the preview icon in the editor title bar
   - Right-click in the editor and select "Mermaid: Open Preview"
   - Use Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for "Mermaid: Open Preview"
   - For side-by-side view: "Mermaid: Open Preview to the Side"

### Changing Themes

In the preview panel toolbar:
- Use the **Theme** dropdown to select different themes
- Check **"Sync with VSCode theme"** to automatically match VSCode's theme
- Click **"Save as Default"** to persist your theme choice

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
  "mermaidPreview.theme": "default",

  // Automatically sync Mermaid theme with VSCode theme
  "mermaidPreview.useVSCodeTheme": false,

  // Automatically refresh preview on document changes
  "mermaidPreview.autoRefresh": true,

  // Delay in milliseconds before refreshing preview after changes
  "mermaidPreview.refreshDelay": 500
}
```

## Example Mermaid Diagram

```markdown
\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\`
```

## Commands

- `Mermaid: Open Preview` - Opens preview in current column
- `Mermaid: Open Preview to the Side` - Opens preview beside editor

## Requirements

- VSCode 1.85.0 or higher
- Markdown files with Mermaid code blocks

## Known Limitations

- Only previews Mermaid diagrams within \`\`\`mermaid code blocks
- Requires internet connection (uses CDN for Mermaid.js)

## Extension Settings

This extension contributes the following settings:

* `mermaidPreview.theme`: Choose the default Mermaid theme
* `mermaidPreview.useVSCodeTheme`: Sync theme with VSCode
* `mermaidPreview.autoRefresh`: Enable/disable auto-refresh
* `mermaidPreview.refreshDelay`: Set refresh delay in milliseconds

## Release Notes

### 0.0.1

Initial release:
- Mermaid diagram preview
- Multiple theme support
- Independent theme selection
- Optional VSCode theme sync
- Live preview updates
- Theme persistence

## Contributing

Found a bug or have a feature request? Please open an issue!

## License

MIT
