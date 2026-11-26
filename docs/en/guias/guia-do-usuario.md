# User guide — OpenCode Browser

This guide walks through **every feature** of the extension, in the order you
will meet each one: install, connect, chat, let the agent work in the browser,
approve permissions, run several conversations at once and adjust the settings.

OpenCode Browser is a Chrome side panel that talks to the **OpenCode Terminal**
running on your machine. The agent reads pages, clicks, fills in forms and
navigates inside a tab group isolated per conversation — and every action that
changes something asks for your permission (or not, depending on the chosen
mode).

**Nothing leaves your computer**: the extension talks to `127.0.0.1`, and the
plugin that gives the agent its tools only listens on loopback.

---

## 1. What you need

| Item | Minimum version | Note |
|---|---|---|
| Chrome or Chromium | 116 | The extension uses the side panel |
| Node.js | 20 | Used only to produce the build and install the plugin |
| npm | comes with Node | — |
| OpenCode Terminal | v2 | It runs the models and the conversations |

The models are the same ones you already use in OpenCode: if your OpenCode works
in the terminal, the extension works.

---

## 2. Install the extension

### 2.1 From the ready-made package (recommended)

[Download the ZIP of the latest release](https://github.com/marcos2872/opencode-browser-extension/releases/latest/download/opencode-browser-extension.zip)
and extract the files. The package already includes the compiled extension, the
plugin and the plugin installer; there is no need to run `npm install` or
compile the project.

1. Open `chrome://extensions` and enable **developer mode**.
2. Click **Load unpacked** and select the `extension/` folder that came in the
   ZIP.
3. In the terminal, inside the extracted package folder, run:

   ```bash
   node scripts/install-plugin.mjs
   opencode service restart
   ```

4. Open the side panel and click **Connect**. In the terminal, run
   `opencode pair` and paste the link shown into the panel.

### 2.2 From the project script

In the project folder:

```bash
./scripts/install.sh        # Linux and macOS
```

```powershell
.\scripts\install.ps1       # Windows (PowerShell 5.1+)
```


The script, in this order:

1. checks that **[Node.js 20+](https://nodejs.org/en/download)**, **npm** and
   **[OpenCode v2+](https://opencode.ai/docs/)** exist (stopping with a clear
   message if any is missing);
2. installs the dependencies (`npm install`);
3. produces the extension build (`npm run build`) in `dist/`;
4. copies the plugin and the agent template into the OpenCode plugins folder
   (`npm run install:plugin`);
5. restarts the OpenCode service (`opencode service restart`);
6. waits for the plugin to respond at `http://127.0.0.1:8799/health`.

If step 6 fails, the script itself warns you: open the extension panel and
check.

> `install.sh` restarts the OpenCode service. If you are using OpenCode in a
> terminal, the current session drops for a few seconds and reconnects — that is
> not an error.

### 2.3 Manual

```bash
npm install
npm run build
npm run install:plugin
opencode service restart
```

Then, in Chrome:

1. open `chrome://extensions`;
2. turn on **developer mode** (top right corner);
3. click **Load unpacked** and choose the project's **`dist/`** folder (not the
   root);
4. the OpenCode Browser icon appears in the toolbar.

### 2.4 After updating the code

Chrome caches the service worker. Whenever you run `npm run build` again:

1. open `chrome://extensions`;
2. click **Reload** on the extension card.

Without that step, the old behavior stays live even with the new code.

---

## 3. Connect the extension to OpenCode (pairing)

1. Open the panel: click the extension icon, or use the shortcut
   **Ctrl+Shift+O** (**Command+Shift+O** on macOS).
2. The first time, the screen **“Connect the browser to the OpenCode on your
   machine”** appears.
3. In the terminal, run:

   ```bash
   opencode pair
   ```

4. Copy the link shown (it is the same one that opens the OpenCode web
   interface) and paste it into the **“`opencode pair` link”** field.
5. Click **“Connect to OpenCode”**. When it finishes, the notice **“Connected to
   OpenCode.”** appears.

The link is single-use and **expires in 5 minutes**. If it expires, run
`opencode pair` again. The previous token remains valid until you disconnect.

### If pairing fails

| Message | What to do |
|---|---|
| “Invalid link. Paste the full link shown by `opencode pair`.” | Copy the whole link, without cutting off the final code |
| “The link must start with http:// or https://.” | You pasted only the code; paste the full URL |
| “The link does not contain /auth/connect/<code>.” | It is not a pairing link |
| “Could not reach OpenCode at … Is it running?” | The server is not up: run `opencode serve` |
| “Link expired or already used. Run `opencode pair` again.” | Generate a new link |
| “The server did not return a session token.” | Incompatible OpenCode version: update to v2 |

---

## 4. Install the tools plugin

The chat works with the API alone — for the agent to **control Chrome**, it
needs the plugin:

```bash
npm run install:plugin
opencode service restart
```

The command copies into the OpenCode plugins folder:

- `browser-relay.ts` — the server that exposes the browser tools;
- `opencode-browser.agent.md` — the `opencode-browser` agent template.

and creates the default browser conversations folder
(`~/.opencode-browser-extensions`).

Check that everything is fine:

```bash
curl http://127.0.0.1:8799/health
```

In the panel, the composer footer shows **“tools connected”** when the plugin is
active.

### If the plugin does not connect

| Status | Meaning | What to do |
|---|---|---|
| “Plugin connected” | All good | — |
| “Plugin not found — install the plugin and restart OpenCode” | The plugin was not loaded | `npm run install:plugin` + `opencode service restart` |
| “Plugin refused the connection — check the extension ID” | The extension is not the expected one | Reload the extension or adjust `OPENCODE_BROWSER_EXTENSION_ID` |
| “Plugin stopped responding — restart OpenCode” | The plugin hung or the worker slept | Restart OpenCode |
| “Plugin disconnected — restart OpenCode to reconnect” | The socket dropped | Restart OpenCode or use **Reconnect plugin** in the settings |

> Keep **only one** copy of the plugin in the plugins folder. Two copies register
> the same plugin and one of them fails.

---

## 5. Getting to know the screen

The panel has five regions:

| Region | What it has |
|---|---|
| **Header** | “OpenCode” brand, conversation title, API status dot (online/offline/connecting) and the **Settings** button |
| **Conversations bar** | Conversation selector, agent selector, tabs button, **+** (new conversation) and delete |
| **Chat** | Messages, model reasoning, tool cards and permission requests |
| **Composer** | Text field, `/` command menu, Send/Stop button and the footer with context and cost |
| **Notices** | Connection banner, status strip, permission cards and temporary notices (toasts) |

### Shortcuts

| Key | Where | Effect |
|---|---|---|
| **Enter** | Composer | Sends the message |
| **Shift+Enter** | Composer | Breaks the line without sending |
| **Enter** | Permission card | “Allow once” |
| **Esc** | Permission card | Denies the request and closes the card |
| **Esc** | Tools modal | Closes the modal |
| **Ctrl+Shift+O** / **Cmd+Shift+O** | On any tab | Opens the panel |

> The composer has no “stop” shortcut: to interrupt, use the **Stop** button
> (the same icon appears on the page, inside the agent indicator).

---

## 6. Your first conversation

1. Type in the **“Ask OpenCode something...”** field and press **Enter**.
2. The response streams in; while the agent works, the field shows **“The agent
   is working...”**.
3. When it uses a tool, the cards appear (see section 7).
4. If it needs permission, the card appears over the panel (section 10).

The empty screen brings four ready-made suggestions:

- “Open Hacker News and summarize today's top 5 news stories.”
- “Read the current page, find the contact form and fill it with test data.”
- “Investigate the console errors and network requests on this page.”
- “Research the price of a product in three stores and compare it in a table.”

### Slash commands

Type `/` (with no space after it) to open the command menu. The list comes from
your OpenCode and shows up to 6 suggestions; choosing one fills the field with
`/name `. After choosing, write the rest and send — for example `/review fix the
diff`.

If you send `/name` and nothing else, the command runs without arguments.

### Draft per conversation

The text you typed is kept **per conversation**. Switching conversations and
coming back does not erase what was written. If you type before any conversation
exists, the text follows whichever conversation gets created.

### Context and cost

The composer footer shows, when available:

- **“Context 1,234 (12%)”** — tokens of the last request and how much of the
  model window that takes;
- **“Session US$ 0.0000”** — cost reported by OpenCode.

Without that data, the footer shows the hint “Enter sends · Shift+Enter breaks
the line”.

### Stopping a run

With the **Stop** button in the composer you interrupt **the displayed
conversation**. Each conversation has its own button: stopping one does not
affect the others.

---

## 7. What the agent can do in the browser

The agent receives 18 tools. Some are read-only and **never** ask for
permission; the others change something and go through your approval (depending
on the mode).

| Tool | What it does | Permission |
|---|---|---|
| `browser_tabs_context` | Lists the tabs in the conversation group | Read |
| `browser_tabs_create` | Opens a URL in the group (in the background) | Read |
| `browser_tabs_attach` | Brings an already open tab into the group | Asks |
| `browser_tabs_close_tab` | Closes a tab in the group | Asks |
| `browser_navigate` | Navigates, goes back or forward in history | Asks |
| `browser_read_page` | Reads the page and returns the elements with references | Read |
| `browser_find` | Searches elements by text, role or name | Read |
| `browser_get_page_text` | Extracts the main text, without HTML | Read |
| `browser_form_input` | Fills in a field | Asks |
| `browser_computer` | Clicks, types, presses keys, scrolls, hovers, takes screenshots, zooms, waits | Asks |
| `browser_javascript_tool` | Runs JavaScript in the page | Asks |
| `browser_read_console_messages` | Reads the tab console and errors | Read |
| `browser_read_network_requests` | Reads the tab network requests | Read |
| `browser_resize_window` | Resizes the window to test layout | No prompt |
| `browser_update_plan` | Shows domains and steps for you to approve beforehand | Plan card |
| `browser_upload_image` | Sends files to a file field or drop area | Asks |
| `browser_gif_creator` | Records action frames and exports a GIF | Export asks |
| `browser_batch` | Runs several tools in sequence (up to 20) | Each action asks for its own |

### Tool cards

Each call appears in the chat with a short label — “Navigate”, “Read page”,
“Click on the page”, “Fill field”, “Console”, “Network” — and a status:
**ok**, **error** or **running**. The labels follow the interface language.

You choose how much detail you want in **Settings → Tools in chat**:

| Mode | How it looks |
|---|---|
| **Grouped (open in a modal)** (default) | One summary row per run (“4 tools · view”); the detail opens in the “Tools of this run” modal |
| **Compact rows, one per call** | One row per tool, with the error summarized on the row itself |
| **Full cards, with parameters and result** | Everything open in the chat, including the input JSON and the output |
| **Hide tools and reasoning (only “working”)** | The chat shows only the activity (“working: reading the page”) |

In grouped mode, the modal has an **“Errors only”** filter and closes with
**Esc** or by clicking outside.

Screenshots appear as an image inside the card (up to 3 at a time) and are also
saved to disk: the file path comes in the agent's response.

---

## 8. Tabs and groups: where the agent works

Each conversation has its own **tab group**, titled **“OpenCode · conversation
name”** and with its own color. It is that agent's workspace — it does not touch
your other tabs.

### Background tabs

By default the extension **does not steal focus**: tabs created or attached by
the agent are born in the background, and the window you are working in stays
where it is. If you would rather see the tabs appearing, turn on **“Allow tabs
opened or attached by the agent to come to the front”** in the settings.

On the page where the agent is acting, an animated pastel blue border appears
with the notice **“OpenCode is on this tab”**, a **Stop** button and a virtual
mouse that slides to the target and shows a ripple on every click. The border
stays lit while the agent works and fades on its own shortly after it finishes.

### Connecting one of your tabs to the agent

- **Connect current tab** (link icon in the conversations bar): brings the active
  tab into the conversation group.
- With tabs connected, the same button opens the list: **“Connect new tab”** and,
  on each tab, **“Remove … from the context”**.

Removing a tab from the context **does not close** the tab: it just takes it out
of the group, and it goes back to being a normal tab of yours.

> Tabs from **another window** cannot be attached. The extension answers: “The
> tab is in another window. Open a new tab through the session or move the tab
> to the group's window before attaching it.”

### The group is born when needed

If the option to create a group when starting a conversation is off (default),
the group is born when the agent opens a new tab (`browser_tabs_create`) or when
you connect a tab. Read and interaction tools do not open tabs on their own:
without a tab, they fail with guidance. It is the most economical flow: no blank
tabs piling up.

---

## 9. Several conversations at once

This is the extension's strong point: each conversation runs on its own, in its
own tab group, and you switch between them without stopping anything.

### Creating a conversation

Click **+** (New conversation). The button **works even with the current
conversation running** — it is only blocked during its own creation, so a double
click does not create two conversations.

The new conversation starts empty, with the model (and the agent) selected, and
is already in focus in the panel.

### Switching conversations

Use the **“OpenCode sessions”** selector. Each item shows the conversation name
and a suffix:

- **“ · running”** — that conversation is running;
- **“ · new reply”** — something new arrived while you were in another one.

Choosing the conversation clears the new-activity notice.

### Following the focused tab group

With **“Show the conversation of the focused tab group in the panel”** on
(default), just click a tab in a group: the panel switches to that group's
conversation. The switch has a short wait (150 ms) so it does not flicker when
you pass through several tabs.

Creating or selecting a conversation manually cancels that automatic switch —
the panel will not “go back on its own” to another conversation right after your
click.

### Creating the group together with the conversation (optional)

Turning on **“Create a tab group when starting a new conversation”**, the **+**
already opens a blank tab (in the background, in the panel's window) and the
group with the conversation name. It is useful when you want to see the “anchor”
of each conversation in the tab bar from the start; the cost is one blank tab per
conversation.

Off (default), the group is born when the agent opens a new tab or when a tab is
attached.

### Deleting a conversation

Use the trash icon (**Delete session**). The confirmation says: “Delete this
session? The history will be removed from OpenCode.”

On delete:

- the history leaves OpenCode;
- the group is released: blank tabs are closed and real pages are only
  **ungrouped** (nothing of yours is closed);
- if it was the displayed conversation, the most recent one starts being shown.

### Limits

- The panel keeps detailed state for up to **4 conversations**. The others keep
  existing in OpenCode and reload when you open them.
- The conversation↔group link lives in the browser session: **closing Chrome
  completely** breaks the link (the tabs remain there, without an owner).
- The panel is a single view: two open windows show the same conversation.

---

## 10. Permissions

### Modes

In **Settings → Permissions**:

| Mode | Behavior |
|---|---|
| **Ask for every site** | Asks on the first action in each domain |
| **Allow actions automatically (recommended)** (*default*) | Does not ask; respects the blocklist |
| **Block actions** | Read-only; no interaction runs |

### What never asks for permission

Reading and background work: listing tabs, opening a tab, reading the page,
finding an element, extracting text, reading the console, reading the network,
resizing the window and recording GIF frames. Starting and stopping GIF
recording also do not ask.

### The permission card

When an action needs approval, the card appears **over the panel** and shows:

- the host in evidence, with an alert dot;
- what will be done (“Navigate from a.com to b.com”, “Click on the page”, “Fill
  field ref_3”, “Run JavaScript in the page”…);
- details: tab title, destination URL, value that will be typed (up to 2,000
  characters), file names;
- a preview (screenshot) when one exists;
- the conversation name, if the request comes from **another** conversation
  (“Session: …”).

The options:

| Button | Effect |
|---|---|
| **Allow once** (Enter) | This action only |
| **Allow for this session** | Releases the host while that conversation exists (kept in memory only) |
| **Always allow for example.com** | Writes the host to the allowed list |
| **Deny** (Esc) | Refuses the action |

Cross-domain navigation and plan requests have their own buttons: **Allow** /
**Always allow for …** / **Refuse**, and **Approve plan** / **Refuse**.

The card footer reminds you: “You can revoke permissions in Settings. The agent
must never buy, create accounts or bypass captchas without your confirmation.”

### Time to answer

The default is **60 seconds**. If you do not answer, the action is **denied**.
The time can be changed in Settings (30 s, 1 min, 2 min, 5 min).

### With the panel closed

The request becomes a **system notification** (“OpenCode Browser: approval
pending”) and plays a sound. Clicking the notification opens the panel with the
request already on screen.

### Several conversations asking at the same time

Requests go into a **queue**: the one from the conversation you are viewing
appears first; once answered, the next one comes in — with the name of the
originating conversation. Nothing is lost or expires hidden, and when you reopen
the panel all pending requests reappear.

> While a card is open it covers the panel, even if it belongs to another
> conversation. To clear it quickly, use **Esc** (denies) or answer it.

### Allow and block lists

In **Settings → Permissions**:

- **Sites always allowed (one per line)**
- **Sites always blocked (one per line)**

The blocklist is evaluated **before** everything: if the host is on the blocked
list, not even the “allow automatically” mode releases it.

**The format is only the host, lowercase, exactly as it appears in the address
bar** — no `https://`, no path, no port and no wildcard:

| Entry | Works? | Why |
|---|---|---|
| `github.com` | Yes | It is the host |
| `docs.github.com` | Yes | A subdomain is another host (needs its own line) |
| `localhost` | Yes | Host without port |
| `https://github.com` | No | The scheme is not part of the host |
| `github.com/repo` | No | The path is not part of the host |
| `*.github.com` | No | There is no wildcard |
| `GitHub.com` | No | Comparison is case-sensitive |

Each line is compared by equality. Typing `https://…` does not show an error on
screen, but it **has no effect** — it is worth checking after saving.

---

## 11. When the agent asks a question

Besides permissions, the agent may request an **answer** from you — a choice, a
number, a yes/no. This appears as a card in the chat, with the question title and
the status “waiting”.

The possible fields are: free text, number, yes/no, single choice, multiple
choice (with the “Other answer” option) and external link. Required fields must
be filled in to unlock the button.

- **Answer** — sends your answer and the agent continues;
- **Cancel** — ends the question without an answer (no confirmation).

With the panel closed, a notification arrives: “The agent needs an answer: …”.

---

## 12. Settings

Open it with the **Settings** button in the panel header.

### Language

The first card in the settings lets you choose the interface language:

| Option | Effect |
|---|---|
| **Automatic (browser language)** (default) | Portuguese when the browser is in Portuguese; English in any other language |
| **Português (Brasil)** | Panel, settings, on-page indicator, notifications and manifest in Portuguese |
| **English** | The same texts in English |

The change is immediate and applies to every extension window. **Agent replies**
are not translated: they follow the language of the message you write.

### Connection

| Field / button | What it is for |
|---|---|
| **`opencode pair` link** + **Connect** | Appears only when there is no pairing; paste the link and connect |
| **Server** | Shows the address, read-only |
| **Token** | Shows the first and last characters, read-only |
| **Open panel** | Opens the side panel in the current window |
| **Reconnect** | Reconnects to the OpenCode API |
| **Reconnect plugin** | Reconnects to the tools plugin |
| **Disconnect** | Removes the token (asks for confirmation) |

Two status lines: **API:** (online, connecting, not configured or the reason for
being offline) and **Tools:** (plugin state).

### Conversations and model

| Field | Default | Effect |
|---|---|---|
| **Browser conversations folder** | `~/.opencode-browser-extensions` | Only lists conversations from that folder |
| **Default model** (+ variant) | server default model | Model of new conversations; models without tools appear as “(no tools)” |
| **Agent for new conversations** | `opencode-browser` | Fixed by the extension; the selector only changes the model |
| Existing conversations | Original agent | Not changed automatically |
| **Show the conversation of the focused tab group in the panel** | on | The panel follows the group of the focused tab |
| **Create a tab group when starting a new conversation** | off | The **+** already creates a group and a blank tab |
| **Allow tabs opened or attached by the agent to come to the front** | off | When on, the extension starts activating tabs |

### Permissions

| Field | Default | Effect |
|---|---|---|
| Mode (ask / allow / block) | allow | See section 10 |
| **Time to answer a request** | 1 minute | After that, the action is denied |
| **Element search** | Heuristic (free) | The “OpenCode model” option uses tokens in `find` |
| Sites always allowed / blocked | empty | Host lists, one per line |

### Notices and display

| Field | Default | Effect |
|---|---|---|
| **Play a sound when the agent finishes or asks for permission with the panel closed** | on | Short beep |
| **Show a system notification when the agent finishes with the panel closed** | on | Chrome notification |
| **Tools in chat** | Grouped | Grouped, compact rows, full cards or hidden |

The **Save** (model/agent) and **Save permissions** buttons write the changes;
the notice **“Permissions saved.”** confirms.

---

## 13. Notices and signals

| Signal | What it means |
|---|---|
| **“!” badge** on the icon | Pairing is not configured yet |
| **Numeric badge** | How many conversations have new activity (9 at most) |
| **Green/red/amber dot** in the header | API online, offline or connecting |
| **Connection banner** | Explains the failure and offers **Try again**, **Reconnect** or **Open settings** |
| **Status strip** below the chat | Reconnection attempts and backend messages |
| **Blue border on the page** | The agent is acting on that tab; it has a **Stop** button |
| **“tools connected” / “tools offline”** | Plugin state in the composer footer |
| **Sound + notification** | Something happened with the panel closed (run finished, permission, question) |
| **Temporary notice in the footer** | Confirmation or error from one of your actions |

---

## 14. Common problems

| Symptom | Likely cause | What to do |
|---|---|---|
| Panel says OpenCode is not responding | Server stopped | Run `opencode serve` and click **Try again** |
| “OpenCode token invalid or expired” | Token revoked or replaced | `opencode pair` and paste the new link in the settings |
| “OpenCode took too long to respond” | Server hung | Restart OpenCode |
| Tools offline | Plugin not installed or old service in memory | `npm run install:plugin` + `opencode service restart` |
| “Plugin refused the connection” | Extension ID different from the expected one | Reload the extension; if it persists, adjust `OPENCODE_BROWSER_EXTENSION_ID` |
| The agent cannot find `browser_tabs_close` | Name reserved by another plugin | Use `browser_tabs_close_tab` and re-register the tools |
| Code change does not appear | Service worker cached | **Reload** at `chrome://extensions` |
| “Could not prepare the page…” | `chrome://` page, Chrome Web Store or blank tab | Open a regular page and try again |
| “DevTools is open on this tab…” | DevTools interferes with automation | Close DevTools for that tab |
| “Ref … is inside an iframe…” | Coordinate action on an iframe element | Ask for the action by reference (click/fill) |
| “Ref … not found” | The page changed after reading | Ask the agent to read the page again |
| “Only http(s) tabs can be attached.” | Browser internal tab | Use a regular page |
| “The tab is in another window…” | Group belongs to another window | Open a tab through the conversation or move the tab between windows |
| “File … exceeds the ~5 MB limit.” | Upload too large | Reduce the file |
| “No frames recorded…” | GIF without `start` | Ask to start recording first |
| “Failed to generate the GIF (offscreen unavailable).” | Offscreen document did not start | Reload the extension |
| `403` error in the tools | Relay token out of date | Delete `~/.cache/opencode-browser/relay.json` (or the one under `$XDG_RUNTIME_DIR/opencode-browser/`) and restart OpenCode |

---

## 15. Limits and privacy

- **Everything local**: the extension talks to `127.0.0.1`; the plugin listens
  only on loopback (ports 8799–8802) and requires a “hello” from the extension
  before serving.
- **The panel is a single view**: two open windows show the same conversation.
- **The conversation↔group link** does not survive a full Chrome close.
- **Up to 4 conversations** with detailed state in memory at the same time.
- **One streaming response at a time**, but several conversations can run in
  parallel.
- **Automatic group** creates one blank tab per conversation; groups of
  conversations deleted outside the extension are only released on the next
  browser start.
- **The permission card is modal**: while a request is open, the panel is
  covered — answer it (or use **Esc**) to continue.

---

## 16. Quick reference

### Paths

| What | Where |
|---|---|
| Extension build | `dist/` (it is the folder to load in Chrome) |
| Plugin and agent | `~/.config/opencode/plugins/` |
| Browser conversations | `~/.opencode-browser-extensions` |
| Agent captures | `~/.cache/opencode-browser/capturas/` |
| Relay token and port | `$XDG_RUNTIME_DIR/opencode-browser/relay.json` or `~/.cache/opencode-browser/relay.json` |

### Useful commands

```bash
npm run build              # generates dist/
npm run install:plugin     # copies plugin and agent
opencode service restart   # reloads plugin and agent
opencode pair              # generates the pairing link
curl http://127.0.0.1:8799/health
```

### Requests that work well

- “Open example.com and tell me the page title.”
- “Read the current page and list the links in the menu.”
- “Fill in the contact form with test data and show me a screenshot before
  sending.”
- “Investigate why the Save button does not respond: check the console and the
  network.”
- “Research the price of this product in three stores and put together a table.”
- “Record a GIF showing the login step by step.”
