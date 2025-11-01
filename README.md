# ChatGPT Collapsible Turns

> Enhance your ChatGPT experience by collapsing and expanding conversation turns for better organization and performance.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue)](https://chrome.google.com/webstore)

## 📖 Overview

ChatGPT Collapsible Turns is a Chrome extension that transforms how you interact with long ChatGPT conversations. By adding collapsible message rows with smart auto-collapse features, it reduces visual clutter and significantly improves ChatGPT's performance in lengthy conversations.

## ✨ Features

- **🎯 Collapsible Message Rows**: Click any message summary to expand or collapse it
- **⚡ Auto-Collapse Mode**: Automatically keeps only the last 10 messages expanded for optimal performance
- **📦 Bulk Actions**: Collapse or expand all messages with a single click from the toolbar
- **💾 Persistent State**: Your collapsed/expanded preferences are remembered during your session
- **🌙 Dark Mode Support**: Seamlessly adapts to ChatGPT's light and dark themes
- **🎨 Minimal UI**: Clean, unobtrusive interface that matches ChatGPT's design
- **⚙️ Collapsible Toolbar**: Hide the control bar when you don't need it
- **🚀 Performance Optimization**: Throttled observer reduces CPU usage during streaming responses

## 🖼️ Screenshots

### Collapsed View
*Messages are collapsed into compact summary rows showing role and preview text*

### Expanded View
*Full messages displayed with syntax highlighting and formatting intact*

### Control Toolbar
*Fixed top bar with Collapse All, Expand All, and Auto-collapse controls*

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store page](#) *(link coming soon)*
2. Click "Add to Chrome"
3. Navigate to [ChatGPT](https://chatgpt.com) and start using!

### Manual Installation (For Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/BCPTe/ChatGPT-Collapsible-Turns.git
   cd ChatGPT-Collapsible-Turns
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the extension directory

5. Visit [ChatGPT](https://chatgpt.com) to see it in action!

## 📦 Project Structure

```
ChatGPT-Collapsible-Turns/
├── manifest.json         # Extension configuration
├── content.js            # Main functionality and DOM manipulation
├── styles.css            # All styling for UI components
├── privacy.html          # Privacy policy page
├── icons/                # Extension icons (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

## 🎮 Usage

### Basic Controls

**Individual Messages:**
- Click any summary row to toggle that message

**Toolbar Actions:**
- **Collapse All**: Collapses every message in the conversation
- **Expand All**: Expands every message in the conversation
- **Auto-collapse Toggle**: Enable/disable automatic collapsing of old messages

**Toolbar Collapse:**
- Click the chevron icon at the bottom of the toolbar to hide/show it

**Extension Toggle:**
- Use the floating pill button (bottom-right) to enable/disable the entire extension

### Auto-Collapse Feature

When enabled, Auto-collapse automatically:
- Keeps only the last 10 messages expanded
- Collapses older messages to improve performance
- Respects manually expanded messages (won't re-collapse them)
- Updates as new messages arrive

**Pro Tip:** If you manually expand an old message, it won't be auto-collapsed until you collapse it again or use "Collapse All".

## ⚙️ Configuration

Settings are automatically saved and synced across your Chrome browsers:

- **Extension State**: On/Off toggle
- **Auto-collapse**: Enabled/Disabled
- **Messages to Keep**: Currently set to 10 (customizable in code)

To change the number of messages kept expanded, edit `keepLastNExpanded` in `content.js`:

```javascript
let keepLastNExpanded = 10; // Change this value
```

## 🔒 Privacy

**We take your privacy seriously:**

- ✅ All data stored locally in your browser
- ✅ No external servers or third-party services
- ✅ No conversation content is ever accessed or stored
- ✅ Only collapse states and preferences are saved
- ✅ No analytics or tracking

Read our full [Privacy Policy](privacy.html)

## 🛠️ Development

### Prerequisites
- Chrome/Chromium browser
- Basic knowledge of JavaScript, HTML, and CSS

### Making Changes

1. Edit the relevant files:
   - `content.js` - Core functionality
   - `styles.css` - Visual styling
   - `manifest.json` - Extension configuration

2. Reload the extension:
   - Go to `chrome://extensions/`
   - Click the refresh icon on your extension card

3. Refresh ChatGPT page to see changes

### Key Components

**State Management:**
- `sessionStorage` - Temporary collapse states
- `chrome.storage.sync` - Persistent settings

**Performance Optimizations:**
- Throttled MutationObserver (100ms delay)
- Auto-collapse to limit DOM complexity
- Efficient DOM queries with caching

**Accessibility:**
- ARIA labels and attributes
- Keyboard navigation support
- Focus management

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Guidelines:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Reporting Issues
If you encounter any bugs or have feature requests, please [open an issue](https://github.com/BCPTe/ChatGPT-Collapsible-Turns/issues).

## 📋 Permissions Explained

### Storage Permission
**Why we need it:**
- Save your extension preferences (on/off, auto-collapse settings)
- Remember collapse/expand states during your session
- Sync settings across your Chrome browsers

### Host Permission (https://chatgpt.com/*)
**Why we need it:**
- Detect and modify ChatGPT conversation elements
- Insert collapsible summary rows
- Monitor for new streaming messages
- Apply your preferred collapse states

**What we DON'T do:**
- Never access your conversation content
- Never transmit data externally
- Never track your usage

## 🙏 Acknowledgments

- Inspired by the need for better conversation management in ChatGPT

## 📧 Contact

- GitHub: [@BCPTe](https://github.com/BCPTe)
- Issues: [GitHub Issues](https://github.com/BCPTe/ChatGPT-Collapsible-Turns/issues)

---

<p align="center">Made with ❤️ for the ChatGPT community</p>
<p align="center">⭐ Star this repo if you find it useful!</p>
