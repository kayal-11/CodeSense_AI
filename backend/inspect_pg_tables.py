import psycopg

DSN_BASE = 'postgresql://postgres:kayaladmin1109@127.0.0.1:5432/'

for db in ('postgres', 'codesense_ai'):
    conn = psycopg.connect(DSN_BASE + db)
    cur = conn.cursor()
    cur.execute('SELECT current_database(), inet_server_addr(), inet_server_port()')
    print('db_conn:', cur.fetchone())
    cur.execute("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
    rows = cur.fetchall()
    print(f'tables_in_{db}:', rows)
    conn.close()
