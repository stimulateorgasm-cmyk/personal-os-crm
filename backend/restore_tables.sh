#!/bin/bash
# Restore all tables from backup SQL dump.
# Drops existing tables, recreates from backup DDL, loads COPY data.
# Run from host — uses docker exec to connect to postgres container.

BACKUP="/root/backups/crm_20260513_170932/personal_os.sql.gz"
PSQL="docker exec -i postgres psql -U personal_os -d personal_os"

echo "=== Step 1: Drop all tables (CASCADE) ==="
zcat "$BACKUP" | grep -E "^CREATE TABLE public\." | sed 's/CREATE TABLE public\.\([^ ]*\) .*/DROP TABLE IF EXISTS public.\1 CASCADE;/' | $PSQL

echo "=== Step 2: Recreate all tables + sequences + indices + constraints ==="
zcat "$BACKUP" | grep -v "^COPY public\.\|^\\\\." | $PSQL

echo "=== Step 3: Load COPY data ==="
zcat "$BACKUP" | awk '/^COPY public\./,/^\\\./' | $PSQL

echo "=== Step 4: Fix sequences (setval to max id) ==="
$PSQL <<-EOSQL
SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 1));
SELECT setval('deals_id_seq', COALESCE((SELECT MAX(id) FROM deals), 1));
SELECT setval('labels_id_seq', COALESCE((SELECT MAX(id) FROM labels), 1));
SELECT setval('mira_messages_id_seq', COALESCE((SELECT MAX(id) FROM mira_messages), 1));
SELECT setval('mira_sessions_id_seq', COALESCE((SELECT MAX(id) FROM mira_sessions), 1));
SELECT setval('notes_id_seq', COALESCE((SELECT MAX(id) FROM notes), 1));
SELECT setval('quiz_events_id_seq', COALESCE((SELECT MAX(id) FROM quiz_events), 1));
SELECT setval('tasks_id_seq', COALESCE((SELECT MAX(id) FROM tasks), 1));
SELECT setval('telegram_messages_id_seq', COALESCE((SELECT MAX(id) FROM telegram_messages), 1));
SELECT setval('test_funnel_id_seq', COALESCE((SELECT MAX(id) FROM test_funnel), 1));
SELECT setval('test_results_id_seq', COALESCE((SELECT MAX(id) FROM test_results), 1));
EOSQL

echo "=== Step 5: Verify ==="
$PSQL -c "
SELECT 'clients' as tbl, count(*) FROM clients
UNION ALL SELECT 'deals', count(*) FROM deals
UNION ALL SELECT 'test_results', count(*) FROM test_results
UNION ALL SELECT 'telegram_messages', count(*) FROM telegram_messages
UNION ALL SELECT 'quiz_events', count(*) FROM quiz_events
UNION ALL SELECT 'notes', count(*) FROM notes
UNION ALL SELECT 'tasks', count(*) FROM tasks
UNION ALL SELECT 'labels', count(*) FROM labels
UNION ALL SELECT 'client_labels', count(*) FROM client_labels
UNION ALL SELECT 'mira_sessions', count(*) FROM mira_sessions
UNION ALL SELECT 'mira_messages', count(*) FROM mira_messages
UNION ALL SELECT 'test_funnel', count(*) FROM test_funnel
UNION ALL SELECT 'quiz_meta', count(*) FROM quiz_meta
ORDER BY tbl;"

echo "=== Done ==="
