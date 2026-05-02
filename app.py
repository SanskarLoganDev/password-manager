from flask import Flask, request, jsonify, session, send_from_directory
import os
import sys

# Resolve paths correctly whether running as script or PyInstaller bundle
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    FRONTEND_DIR = os.path.join(sys._MEIPASS, 'frontend')
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

from backend.database import init_db, SessionLocal, MasterAuth, Credential
from backend.auth import setup_master, login_master
from backend.crypto import encrypt, decrypt

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='/static')
app.secret_key = 'vaultkey-dev-secret-change-on-prod'
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE']   = False  # False for localhost (no HTTPS)

# In-memory key store: { session_id -> encryption_key }
_session_keys = {}


def get_encryption_key():
    sid = session.get('sid')
    if not sid:
        return None
    return _session_keys.get(sid)


# ─── Serve Frontend Pages ─────────────────────────────────────────────────────

@app.route('/')
def login_page():
    return send_from_directory(
        os.path.join(FRONTEND_DIR, 'login'), 'login.html'
    )

@app.route('/dashboard')
def dashboard_page():
    return send_from_directory(
        os.path.join(FRONTEND_DIR, 'dashboard'), 'dashboard.html'
    )

# Serve any static file under /static/... automatically via Flask's static_folder.
# But we also need to serve files referenced by relative paths from subfolders.
# e.g. dashboard.html references "../shared/base.css" which resolves to
# /shared/base.css on the browser. Catch those here:

@app.route('/shared/<path:filename>')
def shared_files(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'shared'), filename)

@app.route('/login/<path:filename>')
def login_files(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'login'), filename)

@app.route('/dashboard/<path:filename>')
def dashboard_files(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'dashboard'), filename)


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    db = SessionLocal()
    try:
        master = db.query(MasterAuth).first()
        is_setup     = master is not None
        is_logged_in = get_encryption_key() is not None
        return jsonify({"is_setup": is_setup, "is_logged_in": is_logged_in})
    finally:
        db.close()


@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    db = SessionLocal()
    try:
        existing = db.query(MasterAuth).first()
        if existing:
            return jsonify({"error": "Master password already set"}), 400

        data     = request.get_json()
        password = data.get('password', '').strip()
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400

        key = setup_master(db, password)

        import uuid
        sid = str(uuid.uuid4())
        session['sid']    = sid
        _session_keys[sid] = key

        return jsonify({"message": "Master password set successfully"})
    finally:
        db.close()


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    db = SessionLocal()
    try:
        data     = request.get_json()
        password = data.get('password', '')

        key, status = login_master(db, password)

        if status == "no_master":
            return jsonify({"error": "No master password set up"}), 400
        if status == "wrong_password":
            return jsonify({"error": "Incorrect master password"}), 401

        import uuid
        sid = str(uuid.uuid4())
        session['sid']    = sid
        _session_keys[sid] = key

        return jsonify({"message": "Login successful"})
    finally:
        db.close()


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    sid = session.pop('sid', None)
    if sid:
        _session_keys.pop(sid, None)
    return jsonify({"message": "Logged out"})


# ─── Credentials Routes ───────────────────────────────────────────────────────

@app.route('/api/credentials', methods=['GET'])
def get_credentials():
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        category = request.args.get('category')
        query    = db.query(Credential)
        if category:
            query = query.filter(Credential.category == category)

        rows    = query.order_by(Credential.created_at.desc()).all()
        results = []
        for row in rows:
            results.append({
                "id":         row.id,
                "category":   row.category,
                "site_name":  row.site_name,
                "username":   decrypt(row.username, key) if row.username else '',
                "email":      decrypt(row.email,    key) if row.email    else '',
                "password":   decrypt(row.password, key),
                "notes":      decrypt(row.notes,    key) if row.notes    else '',
                "created_at": row.created_at.isoformat() if row.created_at else '',
            })
        return jsonify(results)
    finally:
        db.close()


@app.route('/api/credentials', methods=['POST'])
def add_credential():
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        data = request.get_json()
        if not data.get('site_name') or not data.get('password') or not data.get('category'):
            return jsonify({"error": "site_name, category, and password are required"}), 400

        cred = Credential(
            category = data['category'],
            site_name= data['site_name'],
            username = encrypt(data.get('username', ''), key),
            email    = encrypt(data.get('email',    ''), key),
            password = encrypt(data['password'],         key),
            notes    = encrypt(data.get('notes',    ''), key),
        )
        db.add(cred)
        db.commit()
        db.refresh(cred)
        return jsonify({"message": "Credential saved", "id": cred.id}), 201
    finally:
        db.close()


@app.route('/api/credentials/<int:cred_id>', methods=['PUT'])
def update_credential(cred_id):
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        cred = db.query(Credential).filter(Credential.id == cred_id).first()
        if not cred:
            return jsonify({"error": "Not found"}), 404

        data = request.get_json()
        if 'category'  in data: cred.category  = data['category']
        if 'site_name' in data: cred.site_name  = data['site_name']
        if 'username'  in data: cred.username   = encrypt(data['username'],  key)
        if 'email'     in data: cred.email      = encrypt(data['email'],     key)
        if 'password'  in data: cred.password   = encrypt(data['password'],  key)
        if 'notes'     in data: cred.notes      = encrypt(data['notes'],     key)

        db.commit()
        return jsonify({"message": "Updated"})
    finally:
        db.close()


@app.route('/api/credentials/<int:cred_id>', methods=['DELETE'])
def delete_credential(cred_id):
    key = get_encryption_key()
    if not key:
        return jsonify({"error": "Unauthorized"}), 401

    db = SessionLocal()
    try:
        cred = db.query(Credential).filter(Credential.id == cred_id).first()
        if not cred:
            return jsonify({"error": "Not found"}), 404
        db.delete(cred)
        db.commit()
        return jsonify({"message": "Deleted"})
    finally:
        db.close()


@app.route('/api/categories', methods=['GET'])
def get_categories():
    return jsonify([
        "E-Commerce", "Banking", "Airlines", "Social Media",
        "Email", "Streaming", "Work", "Gaming", "Government", "Other",
    ])


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("✅  Password Manager running at http://localhost:5000")
    app.run(host='127.0.0.1', port=5000, debug=False)
