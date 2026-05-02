import os
import base64
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet


def generate_salt() -> bytes:
    """Generate a random 16-byte salt."""
    return os.urandom(16)


def derive_key(master_password: str, salt: bytes) -> bytes:
    """
    Derive a 32-byte encryption key from the master password + salt
    using PBKDF2-HMAC-SHA256 with 600,000 iterations.
    The key is never stored — re-derived fresh each login session.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
    )
    key_bytes = kdf.derive(master_password.encode('utf-8'))
    return base64.urlsafe_b64encode(key_bytes)


def get_fernet(key: bytes) -> Fernet:
    return Fernet(key)


def encrypt(value: str, key: bytes) -> bytes:
    """Encrypt a plaintext string, returns encrypted bytes."""
    if not value:
        return b''
    f = get_fernet(key)
    return f.encrypt(value.encode('utf-8'))


def decrypt(token: bytes, key: bytes) -> str:
    """Decrypt encrypted bytes back to a plaintext string."""
    if not token:
        return ''
    f = get_fernet(key)
    return f.decrypt(token).decode('utf-8')
