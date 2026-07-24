import sqlite3
from pathlib import Path


def main() -> None:
    db_path = Path('codesense.db')
    print(f'db_path: {db_path.resolve()}')
    print(f'exists: {db_path.exists()}')

    if not db_path.exists():
        return

    connection = sqlite3.connect(str(db_path))
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]
        print(f'tables: {tables}')

        if 'users' in tables:
            cursor.execute("PRAGMA table_info(users)")
            columns = cursor.fetchall()
            print(f'users_columns: {columns}')
            cursor.execute('SELECT COUNT(*) FROM users')
            count = cursor.fetchone()[0]
            print(f'users_count: {count}')
    finally:
        connection.close()


if __name__ == '__main__':
    main()
