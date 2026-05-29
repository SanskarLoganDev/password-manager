from flask import Flask, request, jsonify, session, send_from_directory
import os
import sys
import threading
import webbrowser

# ── Path resolution ────────────────────────────────────────────
# When running as a PyInstaller .exe, sys.frozen = True and all
# bundled files live under sys._MEIPASS (a temp extraction folder).
# When running in dev, paths are resolved relative to this file.
if getattr(sys, 'frozen', False):
    BASE_DIR     = os.path.dirname(sys.executable)        # folder containing the .exe
    FRONTEND_DIR = os.path.join(sys._MEIPASS, 'frontend') # bundled frontend files
else:
    BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
    FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

from backend.database import init_db, SessionLocal, MasterAuth, Credential, ExtraField
from backend.auth import setup_master, login_master
from backend.crypto import encrypt, decrypt

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='/static')

# Fixed dev secret key — sessions survive server restarts during testing.
# TODO: replace with a strong random value before any shared/production use.
app.secret_key = 'vaultkey-dev-secret-change-on-prod'

# Cookie settings — Lax SameSite keeps cookies on same-origin requests
# (login page -> API -> dashboard all on 127.0.0.1:5000).
# Secure=False is correct for localhost (no HTTPS).
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE']   = False  # False for localhost (no HTTPS)

# In-memory encryption key store: { session_id (uuid) -> Fernet key (bytes) }
# The key is NEVER written to disk — it lives only for the duration of the session.
# Derived fresh from the master password on every login via PBKDF2.
# Cleared on logout or app restart.
_session_keys = {}


def get_encryption_key():
    """Return the in-memory Fernet key for the current session, or None if not logged in."""
    sid = session.get('sid')
    if not sid:
        return None
    return _session_keys.get(sid)


def serialize_credential(row, key):
    """
    Convert a Credential ORM row to a plain dict, decrypting all encrypted fields.
    MUST be called while the DB session is still open — extra_fields uses
    lazy='joined' so they're fetched in the same query, but the session still
    needs to be open for ORM attribute access.
    """
    return {
        "id":        row.id,
        "category":  row.category,
        "site_name": row.site_name,
        "username":  decrypt(row.username, key) if row.username else '',
        "email":     decrypt(row.email,    key) if row.email    else '',
        "password":  decrypt(row.password, key),
        "notes":     decrypt(row.notes,    key) if row.notes    else '',
        "created_at": row.created_at.isoformat() if row.created_at else '',
        # Decrypt each extra field (security questions, backup passwords, etc.)
        "extra_fields": [
            {
                "id":    ef.id,
                "label": decrypt(ef.label, key),
                "value": decrypt(ef.value, key),
            }
            for ef in row.extra_fields   # safe — lazy='joined' loaded these already
        ],
    }


# ─── Serve Frontend Pages ─────────────────────────────────────────────────────
# Flask serves the HTML pages directly. All asset paths in HTML use absolute
# URLs (/shared/..., /login/..., /dashboard/...) so they always resolve from
# the server root regardless of which page the browser is on.

@app.route('/')
def login_page():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'login'), 'login.html')

@app.route('/dashboard')
def dashboard_page():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'dashboard'), 'dashboard.html')

@app.route('/shared/<path:filename>')
def shared_files(filename):
    """Serve shared assets (base.css, utils.js) referenced by both pages."""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'shared'), filename)

@app.route('/login/<path:filename>')
def login_files(filename):
    """Serve login-specific assets (login.css, login.js)."""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'login'), filename)

@app.route('/dashboard/<path:filename>')
def dashboard_files(filename):
    """Serve dashboard-specific assets (dashboard.css, dashboard.js)."""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'dashboard'), filename)


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """
    Check whether a master password has been set up and whether the current
    session is authenticated. Called on every page load to decide which screen
    to show (setup / login / dashboard).
    """
    db = SessionLocal()
    try:
        master       = db.query(MasterAuth).first()
        is_setup     = master is not None
        is_logged_in = get_encryption_key() is not None
        return jsonify({"is_setup": is_setup, "is_logged_in": is_logged_in})
    finally:
        db.close()


@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    """
    First-run only: hash and store the master password, generate the PBKDF2 salt,
    and immediately log the user in by storing the derived key in memory.
    Rejects if a master password already exists.
    """
    db = SessionLocal()
    try:
        if db.query(MasterAuth).first():
            return jsonify({"error": "Master password already set"}), 400

        data     = request.get_json()
        password = data.get('password', '').strip()
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400

        # setup_master: bcrypt-hashes the password, generates a random salt,
        # persists both to DB, and returns the derived Fernet key (never stored).
        key = setup_master(db, password)

        import uuid
        sid = str(uuid.uuid4())
        session['sid']     = sid
        _session_keys[sid] = key  # key lives in memory only
        return jsonify({"message": "Master password set successfully"})
    finally:
        db.close()


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """
    Verify the master password against the stored bcrypt hash, then re-derive
    the Fernet encryption key from the password + stored salt (PBKDF2, 600k iters).
    Stores the key in memory for this session — never on disk.
    """
    db = SessionLocal()
    try:
        data        = request.get_json()
        password    = data.get('password', '')
        key, status = login_master(db, password)

        if status == "no_master":      return jsonify({"error": "No master password set up"}), 400
        if status == "wrong_password": return jsonify({"error": "Incorrect master password"}), 401

        import uuid
        sid = str(uuid.uuid4())
        session['sid']     = sid
        _session_keys[sid] = key  # key lives in memory only
        return jsonify({"message": "Login successful"})
    finally:
        db.close()


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """
    Clear the session cookie and drop the in-memory encryption key.
    After this, all credential data is inaccessible until the next login.
    """
    sid = session.pop('sid', None)
    if sid:
        _session_keys.pop(sid, None)  # wipe key from memory immediately
    return jsonify({"message": "Logged out"})


@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    """
    Gracefully shut down the Flask server process entirely.
    Clears the session key from memory first, then schedules os._exit(0)
    on a short timer so the HTTP response has time to reach the browser
    before the process exits.

    os._exit(0) is used instead of sys.exit() because Flask runs in a
    threaded WSGI server — sys.exit() only raises SystemExit in the current
    thread, which Werkzeug catches and ignores. os._exit(0) exits the whole
    process immediately and reliably.

    Only accessible from localhost (127.0.0.1) — cannot be called remotely.
    """
    # Guard: only allow shutdown from localhost
    if request.remote_addr not in ('127.0.0.1', '::1'):
        return jsonify({"error": "Forbidden"}), 403

    # Wipe the session key from memory before exiting
    sid = session.pop('sid', None)
    if sid:
        _session_keys.pop(sid, None)

    # Schedule process exit after a brief delay so the JSON response
    # is fully sent to the browser before the server shuts down.
    def _exit():
        os._exit(0)

    t = threading.Timer(0.5, _exit)
    t.daemon = True
    t.start()

    return jsonify({"message": "Shutting down"})


# ─── Credentials Routes ───────────────────────────────────────────────────────

@app.route('/api/credentials', methods=['GET'])
def get_credentials():
    """
    Return all credentials (or filtered by category) with all fields decrypted.
    serialize_credential() is called inside the try block so the DB session
    is still open when ORM relationships (extra_fields) are accessed.
    """
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        category = request.args.get('category')
        query    = db.query(Credential)
        if category:
            query = query.filter(Credential.category == category)
        rows   = query.order_by(Credential.created_at.desc()).all()
        # Serialize INSIDE the try block while the session is still open
        result = [serialize_credential(r, key) for r in rows]
        return jsonify(result)
    finally:
        db.close()


@app.route('/api/credentials', methods=['POST'])
def add_credential():
    """
    Create a new credential entry. All sensitive fields (username, email,
    password, notes) are encrypted with the session's Fernet key before storage.
    Extra fields (security questions, backup passwords) are also encrypted.
    db.flush() is called after adding the Credential to get its ID before
    inserting the related ExtraField rows.
    """
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        data = request.get_json()
        if not data.get('site_name') or not data.get('password') or not data.get('category'):
            return jsonify({"error": "site_name, category, and password are required"}), 400

        cred = Credential(
            category  = data['category'],
            site_name = data['site_name'],
            username  = encrypt(data.get('username', ''), key),
            email     = encrypt(data.get('email',    ''), key),
            password  = encrypt(data['password'],         key),
            notes     = encrypt(data.get('notes',    ''), key),
        )
        db.add(cred)
        db.flush()  # assigns cred.id so ExtraField rows can reference it

        # Insert any additional fields (e.g. security questions, backup passwords)
        for ef in data.get('extra_fields', []):
            label = ef.get('label', '').strip()
            value = ef.get('value', '').strip()
            if label and value:  # skip rows where either field is blank
                db.add(ExtraField(
                    credential_id = cred.id,
                    label         = encrypt(label, key),
                    value         = encrypt(value, key),
                ))

        db.commit()
        return jsonify({"message": "Credential saved", "id": cred.id}), 201
    finally:
        db.close()


@app.route('/api/credentials/<int:cred_id>', methods=['PUT'])
def update_credential(cred_id):
    """
    Update an existing credential. Only fields present in the request body
    are updated (partial update pattern). Extra fields are fully replaced —
    the old set is deleted and the new set is inserted fresh. This avoids
    stale ORM state issues and keeps the logic simple.
    """
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        cred = db.query(Credential).filter(Credential.id == cred_id).first()
        if not cred:
            return jsonify({"error": "Not found"}), 404

        data = request.get_json()

        # Partial update — only overwrite fields that were sent in the request
        if 'category'  in data: cred.category = data['category']
        if 'site_name' in data: cred.site_name = data['site_name']
        if 'username'  in data: cred.username  = encrypt(data['username'], key)
        if 'email'     in data: cred.email     = encrypt(data['email'],    key)
        if 'password'  in data: cred.password  = encrypt(data['password'], key)
        if 'notes'     in data: cred.notes     = encrypt(data['notes'],    key)

        # Replace the entire extra_fields set — delete all then re-insert.
        # Using a direct DELETE query avoids ORM cascade timing issues.
        if 'extra_fields' in data:
            db.query(ExtraField).filter(ExtraField.credential_id == cred.id).delete()
            db.flush()  # ensure deletes are flushed before inserting new rows
            for ef in data['extra_fields']:
                label = ef.get('label', '').strip()
                value = ef.get('value', '').strip()
                if label and value:
                    db.add(ExtraField(
                        credential_id = cred.id,
                        label         = encrypt(label, key),
                        value         = encrypt(value, key),
                    ))

        db.commit()
        return jsonify({"message": "Updated"})
    finally:
        db.close()


@app.route('/api/credentials/<int:cred_id>', methods=['DELETE'])
def delete_credential(cred_id):
    """
    Delete a credential and all its associated extra fields.
    Cascade delete is configured on the ORM relationship, so deleting the
    parent Credential automatically removes all child ExtraField rows.
    """
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        cred = db.query(Credential).filter(Credential.id == cred_id).first()
        if not cred:
            return jsonify({"error": "Not found"}), 404
        db.delete(cred)  # cascade="all, delete-orphan" removes extra_fields too
        db.commit()
        return jsonify({"message": "Deleted"})
    finally:
        db.close()


@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Return the fixed list of credential categories shown in the sidebar and modal."""
    return jsonify([
        "E-Commerce", "Banking", "Airlines", "Social Media",
        "Email", "Developer", "Streaming", "Work", "Gaming", "Government", "Websites", "Other",
    ])


# ─── Entry Point ──────────────────────────────────────────────────────────────

def open_browser():
    """Open the default browser after a short delay to let Flask finish starting up."""
    webbrowser.open('http://127.0.0.1:5000')


if __name__ == '__main__':
    init_db()

    # Auto-open browser only when running as a packaged .exe.
    # In dev (python app.py) we don't want this — just print the URL.
    if getattr(sys, 'frozen', False):
        # Daemon thread so it doesn't block the process from exiting
        timer = threading.Timer(1.5, open_browser)
        timer.daemon = True
        timer.start()
    else:
        print("✅  Password Manager running at http://localhost:5000")

    # use_reloader=False is required — the reloader spawns a second process
    # which causes double browser opens and session key loss in the .exe.
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)


