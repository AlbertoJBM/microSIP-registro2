package main

import (
	"database/sql"
	"os"
	"path/filepath"
)

// openDatabase abre o arquivo SQLite persistente sem exportá-lo ou recriá-lo.
func openDatabase(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`); err != nil {
		db.Close()
		return nil, err
	}
	if err := migrateSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// O schema mantém compatibilidade com os bancos existentes e aplica migrações incrementais.
func migrateSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS agents (
			id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL,
			machine_name TEXT, os_user TEXT, profile_path TEXT, last_seen DATETIME,
			last_sync_id INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS call_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT, original_id INTEGER, callId TEXT UNIQUE,
			agent_username TEXT NOT NULL, agent_full_name TEXT NOT NULL, number TEXT, name TEXT,
			type INTEGER, type_description TEXT, time INTEGER, formatted_time DATETIME,
			duration INTEGER, info TEXT, synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			category TEXT, loja TEXT, UNIQUE(agent_username, original_id)
		)`,
		`CREATE TABLE IF NOT EXISTS route_visits (
			id INTEGER PRIMARY KEY AUTOINCREMENT, loja TEXT NOT NULL, cidade TEXT NOT NULL, bairro TEXT NOT NULL,
			start_time DATETIME NOT NULL, end_time DATETIME, duration_minutes INTEGER, visit_date DATE NOT NULL,
			observations TEXT DEFAULT '', validator_name TEXT, contact_name TEXT, validated_at DATETIME,
			status TEXT NOT NULL DEFAULT 'ABERTO', validator_role TEXT, validation_observations TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS route_days (
			visit_date DATE PRIMARY KEY, saved_by TEXT NOT NULL,
			saved_at DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
		)`,
		`CREATE TABLE IF NOT EXISTS route_day_stores (
			visit_date DATE NOT NULL, loja TEXT NOT NULL, added_by TEXT, added_at DATETIME,
			PRIMARY KEY (visit_date, loja), FOREIGN KEY (visit_date) REFERENCES route_days(visit_date)
		)`,
		`CREATE TABLE IF NOT EXISTS route_tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id INTEGER NOT NULL,
			ticket_number TEXT NOT NULL, description TEXT NOT NULL,
			FOREIGN KEY (visit_id) REFERENCES route_visits(id)
		)`,
		`CREATE TABLE IF NOT EXISTS route_audit (
			id INTEGER PRIMARY KEY AUTOINCREMENT, created_at DATETIME NOT NULL DEFAULT (datetime('now', 'localtime')),
			username TEXT NOT NULL, loja TEXT NOT NULL, action TEXT NOT NULL, visit_id INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_route_visits_date ON route_visits(visit_date)`,
		`CREATE INDEX IF NOT EXISTS idx_route_day_stores_date ON route_day_stores(visit_date)`,
		`CREATE INDEX IF NOT EXISTS idx_route_tickets_visit ON route_tickets(visit_id)`,
		`CREATE INDEX IF NOT EXISTS idx_route_audit_created ON route_audit(created_at)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	// Bancos mais antigos podem não conter as colunas adicionadas por versões posteriores.
	columns, err := tableColumns(db, "route_visits")
	if err != nil {
		return err
	}
	for name, definition := range map[string]string{
		"validator_name": "TEXT", "contact_name": "TEXT", "validated_at": "DATETIME",
		"status": "TEXT NOT NULL DEFAULT 'ABERTO'", "validator_role": "TEXT",
		"validation_observations": "TEXT",
	} {
		if !columns[name] {
			if _, err := db.Exec(`ALTER TABLE route_visits ADD COLUMN ` + name + ` ` + definition); err != nil {
				return err
			}
		}
	}
	callColumns, err := tableColumns(db, "call_logs")
	if err != nil {
		return err
	}
	for name := range map[string]bool{"category": true, "loja": true} {
		if !callColumns[name] {
			if _, err := db.Exec(`ALTER TABLE call_logs ADD COLUMN ` + name + ` TEXT`); err != nil {
				return err
			}
		}
	}
	_, err = db.Exec(`
		UPDATE route_visits SET status = 'FINALIZADO' WHERE status = 'ABERTO' AND end_time IS NOT NULL;
		UPDATE call_logs SET type_description = CASE
			WHEN type = 0 THEN 'Saliente'
			WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 'Entrante Atendida'
			WHEN type = 1 AND CAST(duration AS INTEGER) = 0 THEN 'Entrante Não Atendida'
			WHEN type = 2 THEN 'Entrante Não Atendida' ELSE type_description END WHERE type IN (0, 1, 2);
		UPDATE call_logs SET category = CASE
			WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 'SALIENTE_ATENDIDA'
			WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 'SALIENTE_NAO_ATENDIDA'
			WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 'ENTRANTE_ATENDIDA'
			WHEN (type = 1 AND CAST(duration AS INTEGER) = 0) OR type = 2 THEN 'ENTRANTE_NAO_ATENDIDA'
			ELSE 'OUTRO' END WHERE type IN (0, 1, 2);
	`)
	return err
}

func tableColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := make(map[string]bool)
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, dataType string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, err
		}
		columns[name] = true
	}
	return columns, rows.Err()
}