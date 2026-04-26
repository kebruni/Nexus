const fs = require('fs');
const content = fs.readFileSync('c:/Users/nurbe/AppData/Roaming/Code/User/workspaceStorage/cadea0455a41ee2315d2d911aa07d044/GitHub.copilot-chat/chat-session-resources/62554b36-1a4f-43ae-a1cc-38fbe175ffe5/call_MHxnazFOazlQNllZNlc2SEt5elg__vscode-1774920020099/content.txt', 'utf8');
const lines = content.split('\n');
let code = [];
let capture = false;
for (const line of lines) {
  if (line.startsWith('```typescript') || line.startsWith('```tsx')) {
    capture = true;
    continue;
  }
  if (line.startsWith('```') && capture) {
    break;
  }
  if (capture) {
    code.push(line);
  }
}

if (code.length > 0) {
  fs.writeFileSync('d:/Diplom Porject/client/src/components/FileTransfer.tsx', code.join('\n'));
  console.log('Wrote extracted code!');
} else {
  console.log('Failed to extract code');
}
