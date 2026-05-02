import bcrypt
from backend.crypto import generate_salt, derive_key


def hash_master_password(password: str) -> str:
    """Hash the master password using bcrypt (for login verification only)."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_master_password(password: str, hashed: str) -> bool:
    """Verify the entered password against the stored bcrypt hash."""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def setup_master(db, password: str):
    """
    First-run setup: hash the master password and generate a salt for key derivation.
    Returns the derived encryption key (in-memory only, never stored).
    """
    from backend.database import MasterAuth

    salt = generate_salt()
    password_hash = hash_master_password(password)

    master = MasterAuth(password_hash=password_hash, salt=salt)
    db.add(master)
    db.commit()

    return derive_key(password, salt)


def login_master(db, password: str):
    """
    Verify master password and return the derived encryption key on success.
    Returns None if password is incorrect.
    """
    from backend.database import MasterAuth

    master = db.query(MasterAuth).first()
    if not master:
        return None, "no_master"

    if not verify_master_password(password, master.password_hash):
        return None, "wrong_password"

    key = derive_key(password, master.salt)
    return key, "ok"
