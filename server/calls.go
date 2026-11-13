package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"log"
)

type AgentInfo struct {
	Username    string `json:"username"`
	FullName    string `json:"fullName"`
	MachineName string `json:"machineName"`
	OSUser      string `json:"osUser"`
	ProfilePath string `json:"profilePath"`
}

type incomingCall struct {
	ID            int64  `json:"id"`
	CallID        string `json:"callId"`
	Number        string `json:"number"`
	Name          string `json:"name"`
	Type          int64  `json:"type"`
	Time          int64  `json:"time"`
	Duration      int64  `json:"duration"`
	Info          string `json:"info"`
	FormattedTime string `json:"formatted_time"`
	TypeDescription string `json:"type_description"`
}

type batchPayload struct {
	AgentInfo  AgentInfo      `json:"agentInfo"`
	Changes    []incomingCall `json:"changes"`
	LastSyncID int64          `json:"lastSyncId"`
}

var sectorMap = []struct{ Code, Name string }{
	{"00", "Recepção"}, {"01", "Frente de Caixa"}, {"04", "Gerência"},
	{"13", "Estoque"}, {"14", "RM"}, {"18", "Prevenção"}, {"19", "Prevenção"},
	{"20", "RH"}, {"50", "E-commerce"}, {"80", "Televendas"}, {"81", "Televendas"},
}

func (s *Server) receiveBatch(w http.ResponseWriter, r *http.Request) {
	var payload batchPayload
	if err := readJSON(r, &payload); err != nil || payload.AgentInfo.Username == "" || payload.Changes == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "Invalid payload"})
		return
	}

	// Um lote é gravado em transação: o cursor só avança depois que todos os registros foram aceitos.
	s.mu.Lock()
	tx, err := s.db.Begin()
	if err != nil {
		s.mu.Unlock()
		writeJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "Storage failed"})
		return
	}
	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO call_logs
		(original_id, callId, agent_username, agent_full_name, number, name, type, type_description,
		time, formatted_time, duration, info, category, loja)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		s.mu.Unlock()
		writeJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "Storage failed"})
		return
	}
	stored := 0
	for _, call := range payload.Changes {
		typeDescription, category := classifyCall(call.Type, call.Duration, call.TypeDescription)
		parsed := parsePhoneNumber(call.Number)
		result, execErr := stmt.Exec(call.ID, call.CallID, payload.AgentInfo.Username, payload.AgentInfo.FullName,
			call.Number, call.Name, call.Type, typeDescription, call.Time, call.FormattedTime,
			call.Duration, call.Info, category, parsed.Store)
		if execErr != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			s.mu.Unlock()
			logError(w, "Failed to store logs", execErr)
			return
		}
		if affected, _ := result.RowsAffected(); affected > 0 {
			stored++
		}
	}
	_ = stmt.Close()
	lastID := payload.LastSyncID
	if lastID == 0 && len(payload.Changes) > 0 {
		lastID = payload.Changes[len(payload.Changes)-1].ID
	}
	_, err = tx.Exec(`INSERT OR REPLACE INTO agents
		(username, full_name, machine_name, os_user, profile_path, last_seen, last_sync_id)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`, payload.AgentInfo.Username, payload.AgentInfo.FullName,
		payload.AgentInfo.MachineName, payload.AgentInfo.OSUser, payload.AgentInfo.ProfilePath, lastID)
	if err == nil {
		err = tx.Commit()
	} else {
		_ = tx.Rollback()
	}
	s.mu.Unlock()
	if err != nil {
		logError(w, "Failed to store logs", err)
		return
	}
	log.Printf("Gravados %d registros de %s", stored, payload.AgentInfo.FullName)
	s.emit("new-logs", map[string]any{"agentInfo": payload.AgentInfo, "count": stored})
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "stored": stored})
}

func classifyCall(callType, duration int64, fallback string) (string, string) {
	switch callType {
	case 0:
		if duration > 0 {
			return "Saliente", "SALIENTE_ATENDIDA"
		}
		return "Saliente", "SALIENTE_NAO_ATENDIDA"
	case 1:
		if duration > 0 {
			return "Entrante Atendida", "ENTRANTE_ATENDIDA"
		}
		return "Entrante Não Atendida", "ENTRANTE_NAO_ATENDIDA"
	case 2:
		return "Entrante Não Atendida", "ENTRANTE_NAO_ATENDIDA"
	default:
		if fallback == "" {
			fallback = "Desconhecido"
		}
		return fallback, "OUTRO"
	}
}

func parsePhoneNumber(number string) struct{ Store, Sector, SectorName string } {
	result := struct{ Store, Sector, SectorName string }{"Desconhecida", "Desconhecido", "Desconhecido"}
	if len(number) < 3 {
		return result
	}
	sector, store := number[len(number)-2:], number[:len(number)-2]
	if len(store) > 3 {
		store = "Desconhecida"
	} else {
		switch store {
		case "99": store = "CD"
		case "984": store = "CD & CD2"
		case "981": store = "ADM 95"
		case "982": store = "ADM 96"
		}
	}
	result.Store, result.Sector, result.SectorName = store, sector, "Setor Desconhecido"
	for _, item := range sectorMap {
		if item.Code == sector {
			result.SectorName = item.Name
			break
		}
	}
	switch sector {
	case "00", "01", "04": result.Sector, result.SectorName = "FRENTE_CAIXA", "Frente de Caixa"
	case "80", "81": result.Sector, result.SectorName = "TELEVENDAS", "Televendas"
	case "18", "19": result.Sector, result.SectorName = "PREVENCAO", "Prevenção"
	default:
		known := false
		for _, item := range sectorMap { if item.Code == sector { known = true; break } }
		if !known { result.Sector = "DESCONHECIDO" }
	}
	return result
}

type sqlFilter struct {
	where string
	args  []any
}

// callsFilter centraliza os mesmos filtros usados por listagem e estatísticas.
func callsFilter(r *http.Request) sqlFilter {
	conditions := []string{"number NOT LIKE '*%'", "number != '*'", "number IS NOT NULL"}
	args := make([]any, 0)
	query := r.URL.Query()
	if start := query.Get("startDate"); start != "" {
		conditions = append(conditions, "formatted_time >= ?")
		args = append(args, start+" 00:00:00")
	}
	if end := query.Get("endDate"); end != "" {
		conditions = append(conditions, "formatted_time < date(?, '+1 day')")
		args = append(args, end)
	}
	users := append(query["user"], query["users"]...)
	users = uniqueStrings(users)
	if len(users) == 1 {
		conditions = append(conditions, "agent_username = ?")
		args = append(args, users[0])
	} else if len(users) > 1 {
		conditions = append(conditions, "agent_username IN ("+placeholders(len(users))+")")
		for _, user := range users { args = append(args, user) }
	}
	if store := query.Get("loja"); store != "" {
		prefixes := map[string]string{"CD & CD2": "984", "ADM 95": "981", "ADM 96": "982", "CD": "99"}
		if prefix := prefixes[store]; prefix != "" { store = prefix }
		conditions = append(conditions, "number LIKE ?")
		args = append(args, store+"%")
	}
	if sector := query.Get("sector"); sector != "" {
		sectorCodes := map[string][]string{"FRENTE_CAIXA": {"00", "01", "04"}, "TELEVENDAS": {"80", "81"}, "PREVENCAO": {"18", "19"}}
		if sector == "DESCONHECIDO" {
			known := make([]string, 0, len(sectorMap))
			for _, item := range sectorMap { known = append(known, "number NOT LIKE ?") ; args = append(args, "%"+item.Code) }
			conditions = append(conditions, "("+strings.Join(known, " AND ")+")")
		} else {
			codes := sectorCodes[sector]
			if len(codes) == 0 { codes = []string{sector} }
			matches := make([]string, 0, len(codes))
			for _, code := range codes { matches = append(matches, "number LIKE ?"); args = append(args, "%"+code) }
			conditions = append(conditions, "("+strings.Join(matches, " OR ")+")")
		}
	}
	return sqlFilter{where: strings.Join(conditions, " AND "), args: args}
}

func placeholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

func queryMaps(db *sql.DB, query string, args ...any) ([]map[string]any, error) {
	rows, err := db.Query(query, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil { return nil, err }
	result := make([]map[string]any, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		destinations := make([]any, len(columns))
		for i := range values { destinations[i] = &values[i] }
		if err := rows.Scan(destinations...); err != nil { return nil, err }
		row := make(map[string]any, len(columns))
		for i, column := range columns {
			if bytes, ok := values[i].([]byte); ok { row[column] = string(bytes) } else { row[column] = values[i] }
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

type callTotals struct {
	Total int64 `json:"total_calls"`
	IncomingAnswered int64 `json:"entrantes_atendidas"`
	IncomingMissed int64 `json:"entrantes_nao_atendidas"`
	OutgoingAnswered int64 `json:"salientes_atendidas"`
	OutgoingMissed int64 `json:"salientes_nao_atendidas"`
	AverageDuration float64 `json:"avg_duration"`
}

const totalsSQL = `COUNT(*) AS total_calls,
	COALESCE(SUM(CASE WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END), 0) AS entrantes_atendidas,
	COALESCE(SUM(CASE WHEN type = 2 OR (type = 1 AND CAST(duration AS INTEGER) = 0) THEN 1 ELSE 0 END), 0) AS entrantes_nao_atendidas,
	COALESCE(SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END), 0) AS salientes_atendidas,
	COALESCE(SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 1 ELSE 0 END), 0) AS salientes_nao_atendidas,
	COALESCE(ROUND(AVG(CASE WHEN CAST(duration AS INTEGER) > 0 THEN CAST(duration AS INTEGER) END), 2), 0) AS avg_duration`

func (s *Server) getStats(w http.ResponseWriter, r *http.Request) {
	f := callsFilter(r)
	s.mu.Lock()
	var overall callTotals
	err := s.db.QueryRow("SELECT "+totalsSQL+" FROM call_logs WHERE "+f.where, f.args...).Scan(
		&overall.Total, &overall.IncomingAnswered, &overall.IncomingMissed,
		&overall.OutgoingAnswered, &overall.OutgoingMissed, &overall.AverageDuration)
	if err != nil { s.mu.Unlock(); logError(w, "Failed to get stats", err); return }
	rows, err := queryMaps(s.db, "SELECT agent_username, agent_full_name, "+totalsSQL+" FROM call_logs WHERE "+f.where+
		" GROUP BY agent_username, agent_full_name ORDER BY total_calls DESC", f.args...)
	s.mu.Unlock()
	if err != nil { logError(w, "Failed to get stats", err); return }
	agents := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		agents = append(agents, map[string]any{
			"agent_username": row["agent_username"], "agent_full_name": row["agent_full_name"],
			"total_calls": row["total_calls"], "entrantes_atendidas": row["entrantes_atendidas"],
			"entrantes_nao_atendidas": row["entrantes_nao_atendidas"],
			"salientes_atendidas": row["salientes_atendidas"],
			"salientes_nao_atendidas": row["salientes_nao_atendidas"], "avg_duration": row["avg_duration"],
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"overall": overall, "agents": agents})
}

func (s *Server) getStatsByStore(w http.ResponseWriter, r *http.Request) {
	f := callsFilter(r)
	query := `SELECT loja, COUNT(*) AS total_calls,
		COALESCE(SUM(CASE WHEN type=1 AND CAST(duration AS INTEGER)>0 THEN 1 ELSE 0 END),0) AS entrantes_atendidas,
		COALESCE(SUM(CASE WHEN type=2 OR (type=1 AND CAST(duration AS INTEGER)=0) THEN 1 ELSE 0 END),0) AS entrantes_nao_atendidas,
		COALESCE(SUM(CASE WHEN type=0 AND CAST(duration AS INTEGER)>0 THEN 1 ELSE 0 END),0) AS salientes_atendidas,
		COALESCE(SUM(CASE WHEN type=0 AND CAST(duration AS INTEGER)=0 THEN 1 ELSE 0 END),0) AS salientes_nao_atendidas
		FROM call_logs WHERE `+f.where+` AND loja IS NOT NULL AND loja != 'Desconhecida' GROUP BY loja ORDER BY total_calls DESC`
	s.mu.Lock()
	rows, err := queryMaps(s.db, query, f.args...)
	s.mu.Unlock()
	if err != nil { logError(w, "Failed to get loja stats", err); return }
	for _, row := range rows {
		location := s.location(stringValue(row["loja"]), "")
		row["cidade"], row["bairro"] = location.Cidade, location.Bairro
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) getFilters(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	users, err := queryMaps(s.db, `SELECT DISTINCT agent_username AS username, agent_full_name AS full_name FROM call_logs ORDER BY agent_full_name`)
	var stores []map[string]any
	if err == nil { stores, err = queryMaps(s.db, `SELECT DISTINCT loja FROM call_logs WHERE loja IS NOT NULL AND loja != '' AND loja != 'Desconhecida' ORDER BY loja`) }
	s.mu.Unlock()
	if err != nil { writeJSON(w, http.StatusOK, map[string]any{"users": []any{}, "lojas": []any{}, "sectors": []any{}}); return }
	lojas := make([]any, 0, len(stores))
	for _, row := range stores { lojas = append(lojas, row["loja"]) }
	sectors := make([]map[string]string, 0, len(sectorMap))
	for _, item := range sectorMap { sectors = append(sectors, map[string]string{"code": item.Code, "name": item.Name}) }
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "lojas": lojas, "sectors": sectors})
}

func (s *Server) getCalls(w http.ResponseWriter, r *http.Request) {
	f := callsFilter(r)
	s.mu.Lock()
	rows, err := queryMaps(s.db, "SELECT * FROM call_logs WHERE "+f.where+" ORDER BY formatted_time DESC", f.args...)
	s.mu.Unlock()
	if err != nil { writeJSON(w, http.StatusOK, []any{}); return }
	for _, row := range rows {
		parsed := parsePhoneNumber(stringValue(row["number"]))
		store := stringValue(row["loja"])
		if store == "" { store = parsed.Store }
		location := s.location(store, stringValue(row["number"]))
		row["loja"], row["sector"], row["sector_name"] = store, parsed.Sector, parsed.SectorName
		row["category"] = stringValue(row["category"])
		row["location_city"], row["location_neighborhood"] = location.Cidade, location.Bairro
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) getAgents(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	rows, err := queryMaps(s.db, `SELECT username, full_name, machine_name, os_user, profile_path, last_seen, last_sync_id FROM agents ORDER BY full_name`)
	s.mu.Unlock()
	if err != nil { writeJSON(w, http.StatusOK, []any{}); return }
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) getSyncStatus(w http.ResponseWriter, r *http.Request) {
	var lastID int64
	s.mu.Lock()
	err := s.db.QueryRow(`SELECT last_sync_id FROM agents WHERE username = ?`, r.PathValue("username")).Scan(&lastID)
	s.mu.Unlock()
	if err != nil && err != sql.ErrNoRows { log.Printf("Erro lendo status de sincronização: %v", err) }
	writeJSON(w, http.StatusOK, map[string]int64{"lastSyncId": lastID})
}

func (s *Server) location(store, phone string) StoreLocation {
	if location, ok := s.stores[store]; ok { return location }
	normalized := strings.Map(func(r rune) rune { if r >= '0' && r <= '9' { return r }; return -1 }, phone)
	if len(normalized) > 2 {
		if location, ok := s.stores[normalized[:len(normalized)-2]]; ok { return location }
	}
	return StoreLocation{}
}

func logError(w http.ResponseWriter, message string, err error) {
	log.Printf("%s: %v", message, err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("%s", message)})
}
