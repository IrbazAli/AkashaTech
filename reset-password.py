#!/usr/bin/env python3
"""
Password reset utility for AkashaTech.
Resets the password for a user using bcrypt hashing compatible with NextAuth / Prisma.
"""

import os
import sys
import bcrypt

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 is required. Run:")
    print("  pip install psycopg2-binary bcrypt")
    sys.exit(1)


def load_env_database_url():
    # Check environment variable
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")

    # Check .env file
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    val = line.split("=", 1)[1].strip()
                    # Remove surrounding quotes if present
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    return val
    return None


def reset_password(email: str, new_password: str, db_url: str):
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

    hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")

    # Clean connection URL for psycopg2 (remove prisma-specific parameters like pgbouncer)
    parsed = urlparse(db_url)
    qs = parse_qs(parsed.query)
    # libpq recognized params
    allowed_params = {"sslmode", "connect_timeout", "application_name"}
    cleaned_qs = {k: v for k, v in qs.items() if k in allowed_params}
    if "sslmode" not in cleaned_qs and ("supabase.com" in parsed.netloc or "neon.tech" in parsed.netloc):
        cleaned_qs["sslmode"] = ["require"]

    clean_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        urlencode(cleaned_qs, doseq=True),
        parsed.fragment
    ))

    print("Connecting to database...")
    try:
        conn = psycopg2.connect(clean_url)
        cur = conn.cursor()

        # Check if user exists
        cur.execute('SELECT id, email, role FROM "User" WHERE email = %s;', (email,))
        user = cur.fetchone()

        if not user:
            print(f"User with email '{email}' was not found in the database.")
            conn.close()
            return False

        user_id, user_email, role = user
        print(f"Found user: ID={user_id}, Email={user_email}, Role={role}")

        # Update password
        cur.execute('UPDATE "User" SET password = %s WHERE email = %s;', (hashed, email))
        conn.commit()
        print(f"Success! Password for '{email}' has been reset.")
        cur.close()
        conn.close()
        return True

    except Exception as e:
        print(f"Database error: {e}")
        return False


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "irbazali321@gmail.com"
    new_pass = sys.argv[2] if len(sys.argv) > 2 else "123456"
    db_url = sys.argv[3] if len(sys.argv) > 3 else load_env_database_url()

    if not db_url:
        print("Error: DATABASE_URL not found!")
        print("Please provide it as an argument or in a .env file:")
        print(f"  python3 reset-password.py {email} {new_pass} '<your_database_url>'")
        sys.exit(1)

    reset_password(email, new_pass, db_url)
