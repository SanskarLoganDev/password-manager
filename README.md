# VaultKey — Local Password Manager

A fully local, encrypted password manager built with Flask (Python) and vanilla HTML/CSS/JS.
All passwords are encrypted at rest using Fernet (AES-128-CBC + HMAC). The encryption key is
derived from your master password via PBKDF2-HMAC-SHA256 and lives only in memory — never on disk.

---

## Features

- Master password login with bcrypt verification
- All credentials encrypted at rest (username, email, password, notes, extra fields)
- Categories: E-Commerce, Banking, Airlines, Social Media, Email, Developer, Work, Gaming, Government, Other
- Additional fields per entry (security questions, backup passwords, API keys, etc.)
- Search and filter by category
- Copy-to-clipboard for all sensitive fields
- Show/hide toggle for passwords
- Lock (clears session, keeps server running) and Shut Down (kills server entirely)
- Packagable as a standalone Windows `.exe` via PyInstaller

---

## Security Architecture

```
Master Password
      │
      ▼
PBKDF2-HMAC-SHA256  ←── random salt (stored in DB)
600,000 iterations
      │
      ▼
  Fernet Key (32 bytes)
      │
      ├── encrypts: username, email, password, notes, extra field labels & values
      │
      └── lives in memory only — never written to disk
          cleared on Lock, Shut Down, or app restart
```

- **Master password** is verified via bcrypt hash (stored in DB)
- **Encryption key** is re-derived fresh on every login — the DB alone is useless without the master password
- **`passwords.db`** contains only encrypted bytes — opening it directly reveals nothing readable
- **Flask** binds to `127.0.0.1` only — never exposed to the network

---

## Project Structure

```
password-manager/
│
├── app.py                      # Flask server — all API routes and page serving
│
├── backend/
│   ├── database.py             # SQLAlchemy models: MasterAuth, Credential, ExtraField
│   ├── crypto.py               # PBKDF2 key derivation + Fernet encrypt/decrypt
│   └── auth.py                 # bcrypt master password setup and login verification
│
├── frontend/
│   ├── shared/
│   │   ├── base.css            # CSS variables, reset, buttons, forms, modal, toast
│   │   └── utils.js            # Shared utilities: escHtml, copyToClipboard, showToast
│   │
│   ├── login/
│   │   ├── login.html          # Served at http://localhost:5000/
│   │   ├── login.css           # Login card layout and styles
│   │   └── login.js            # Auth status check, setup/login logic, redirect
│   │
│   └── dashboard/
│       ├── dashboard.html      # Served at http://localhost:5000/dashboard
│       ├── dashboard.css       # Sidebar, top bar, entry grid, cards, modals
│       └── dashboard.js        # Entries CRUD, search, filter, modals, shutdown
│
├── passwords.db                # SQLite database — auto-created on first run
│                               # Contains: master_auth, credentials, extra_fields tables
│
├── requirements.txt            # Python dependencies
├── reset_db.py                 # Dev utility — deletes passwords.db to start fresh
├── vaultkey.spec               # PyInstaller spec — defines what gets bundled into .exe
└── build.bat                   # One-click build script — produces dist/VaultKey.exe
```

---

## Database Schema

**`master_auth`** (always 1 row)
| Column | Type | Description |
|---|---|---|
| `password_hash` | TEXT | bcrypt hash of master password |
| `salt` | BYTES | Random salt used for PBKDF2 key derivation |

**`credentials`**
| Column | Type | Description |
|---|---|---|
| `category` | TEXT | e.g. Banking, Developer |
| `site_name` | TEXT | e.g. Chase, GitHub |
| `username` | BYTES | Encrypted |
| `email` | BYTES | Encrypted |
| `password` | BYTES | Encrypted |
| `notes` | BYTES | Encrypted |

**`extra_fields`** (0 or more per credential)
| Column | Type | Description |
|---|---|---|
| `credential_id` | INT | Foreign key → credentials.id |
| `label` | BYTES | Encrypted (e.g. "Security Question") |
| `value` | BYTES | Encrypted (e.g. "Name of first pet?") |

---

## Running Locally (Development)

### Prerequisites
- Python 3.11+
- pip

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd password-manager

# 2. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
python app.py
```

Then open **http://localhost:5000** in your browser.

On first run you will be prompted to create a master password (minimum 8 characters).
The `passwords.db` file is created automatically in the project root.

### Resetting the Database (dev only)

To wipe all data and start fresh with a new master password:

```bash
python reset_db.py
```

Or simply delete `passwords.db` manually from the project root.

---

## Building the Windows `.exe`

The app can be packaged into a standalone `VaultKey.exe` using PyInstaller.
The target machine needs no Python, no pip, and no dependencies installed.

### Prerequisites

```bash
pip install pyinstaller
```

### Build

**Option 1 — Double-click `build.bat`** in Windows Explorer (recommended)

**Option 2 — Run manually** in Command Prompt (not PowerShell):

```bat
build.bat
```

The build takes 1–3 minutes. Output is at `dist\VaultKey.exe`.

> **Important:** Always run `build.bat` from **Command Prompt**, not PowerShell or VS Code's terminal.

### Deploying the `.exe`

Create a folder anywhere and place these two files together:

```
VaultKey\
├── VaultKey.exe        ← built output from dist\
└── passwords.db        ← copy from project root (has all your passwords)
```

Double-click `VaultKey.exe` — it starts Flask in the background and automatically
opens your default browser at `http://localhost:5000`.

The `passwords.db` file is **never bundled** inside the `.exe` — it lives next to it
so your data persists across updates. To update the app, replace only `VaultKey.exe`.

### Antivirus False Positives

PyInstaller-built executables are commonly flagged by antivirus software (including McAfee,
Windows Defender) because the self-extracting bundle pattern resembles known malware packaging.
This is a **false positive** — the threat ID will be a generic heuristic, not a known virus.

To resolve: restore the file from quarantine and add your `VaultKey\` folder as an exclusion
in your antivirus settings.

### Rebuilding After Code Changes

Rebuild the `.exe` only when you are satisfied with a batch of changes:

```
Edit code → Test with python app.py → Run build.bat → Replace VaultKey.exe
```

`passwords.db` is never affected by a rebuild.

---

## Dependencies

| Package | Purpose |
|---|---|
| `flask` | Web server and API routing |
| `sqlalchemy` | ORM and SQLite database access |
| `cryptography` | Fernet encryption, PBKDF2 key derivation |
| `bcrypt` | Master password hashing |
| `pyinstaller` | Packaging to `.exe` (build time only) |


## Future Work

- Add the ability to move the cards according to our preference in the categories permanently. The cards when "all Entries" is selected can stay at random or how it was earlier (does not need to be modified)

- Add category for Streaming (ex: Amazon prime, Netflix etc.)

- Add category for websites (for random websites that i have an account for)

- Add category for Cards (credit/debit and other cards, separate category from banking) with required fields for number, address, CVV and expiry date

- Add category for mobile apps

- Create a mac version for this