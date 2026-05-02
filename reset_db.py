"""
reset_db.py — Development utility to wipe the database and start fresh.
Deletes passwords.db so the app will prompt for a new master password on next run.
"""

import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'passwords.db')

def reset():
    if not os.path.exists(DB_PATH):
        print("No database found — nothing to reset.")
        return

    confirm = input("⚠️  This will permanently delete ALL stored passwords. Type 'yes' to confirm: ").strip().lower()
    if confirm != 'yes':
        print("Aborted.")
        return

    os.remove(DB_PATH)
    print("✅  Database deleted. Restart the app to set a new master password.")

if __name__ == '__main__':
    reset()
