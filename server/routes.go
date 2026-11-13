package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func validDate(value string) bool {
	// time.Parse também rejeita datas impossíveis, como 30 de fevereiro.
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func normalizeDateTime(value any) (string, bool) {
	text, ok := value.(string)
	if !ok { return "", false }
	for _, layout := range []string{"2006-01-02T15:04", "2006-01-02T15:04:05"} {
		parsed, err := time.Parse(layout, text)
		if err == nil { return parsed.Format("2006-01-02 15:04:05"), true }
	}
	return "", false
}

func (s *Server) getRouteDay(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !validDate(date) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	s.mu.Lock()
	day, err := queryMaps(s.db, `SELECT visit_date, saved_by, saved_at FROM route_days WHERE visit_date = ?`, date)
	var stores []map[string]any
	if err == nil { stores, err = queryMaps(s.db, `SELECT loja, added_by, added_at FROM route_day_stores WHERE visit_date = ? ORDER BY rowid`, date) }
	s.mu.Unlock()
	if err != nil { logError(w, "Não foi possível carregar a rota do dia", err); return }
	if stores == nil { stores = []map[string]any{} }
	response := map[string]any{"date": date, "saved": len(day) > 0, "saved_by": nil, "saved_at": nil, "stores": stores}
	if len(day) > 0 { response["saved_by"], response["saved_at"] = day[0]["saved_by"], day[0]["saved_at"] }
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) saveRouteDay(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	var body struct { Username string `json:"username"`; Stores []string `json:"stores"` }
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "A lista de lojas da rota é inválida"}); return }
	if body.Stores == nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "A lista de lojas da rota é inválida"}); return }
	body.Username, body.Stores = strings.TrimSpace(body.Username), uniqueStrings(body.Stores)
	if !validDate(date) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	if body.Username == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe quem está salvando a rota"}); return }
	if body.Stores == nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "A lista de lojas da rota é inválida"}); return }
	for _, store := range body.Stores { if _, ok := s.stores[store]; !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "A rota contém uma loja não encontrada"}); return } }
	// A transação garante que rota, lojas e trilha de auditoria sejam salvas juntas.
	s.mu.Lock()
	tx, err := s.db.Begin()
	if err == nil {
		var exists int
		err = tx.QueryRow(`SELECT COUNT(*) FROM route_days WHERE visit_date = ?`, date).Scan(&exists)
		if err == nil && exists > 0 { err = errConflict }
		if err == nil { _, err = tx.Exec(`INSERT INTO route_days (visit_date, saved_by) VALUES (?, ?)`, date, body.Username) }
		for _, store := range body.Stores { if err == nil { _, err = tx.Exec(`INSERT INTO route_day_stores (visit_date, loja) VALUES (?, ?)`, date, store) } }
		if err == nil { _, err = tx.Exec(`INSERT INTO route_audit (username, loja, action) VALUES (?, ?, ?)`, body.Username, "Rota diária", "Rota de "+date+" salva") }
		if err == nil { err = tx.Commit() } else { _ = tx.Rollback() }
	}
	s.mu.Unlock()
	if err == errConflict { writeJSON(w, http.StatusConflict, map[string]string{"error": "A rota deste dia já foi salva"}); return }
	if err != nil { logError(w, "Não foi possível salvar a rota do dia", err); return }
	writeJSON(w, http.StatusCreated, map[string]any{"date": date, "saved": true, "saved_by": body.Username, "stores": body.Stores})
}

var errConflict = fmt.Errorf("conflict")

func (s *Server) addRouteStore(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	var body struct { Loja string `json:"loja"`; Username string `json:"username"` }
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos"}); return }
	body.Loja, body.Username = strings.TrimSpace(body.Loja), strings.TrimSpace(body.Username)
	if !validDate(date) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	if body.Username == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe quem está adicionando a loja"}); return }
	if _, ok := s.stores[body.Loja]; !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Loja não encontrada"}); return }
	s.mu.Lock()
	var dayCount, storeCount int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM route_days WHERE visit_date = ?`, date).Scan(&dayCount)
	if err == nil && dayCount == 0 { err = errRouteNotSaved }
	if err == nil { err = s.db.QueryRow(`SELECT COUNT(*) FROM route_day_stores WHERE visit_date = ? AND loja = ?`, date, body.Loja).Scan(&storeCount) }
	if err == nil && storeCount > 0 { err = errConflict }
	if err == nil {
		_, err = s.db.Exec(`INSERT INTO route_day_stores (visit_date, loja, added_by, added_at) VALUES (?, ?, ?, datetime('now', 'localtime'))`, date, body.Loja, body.Username)
	}
	var added []map[string]any
	if err == nil { added, err = queryMaps(s.db, `SELECT loja, added_by, added_at FROM route_day_stores WHERE visit_date = ? AND loja = ?`, date, body.Loja) }
	if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action) VALUES (?, ?, ?)`, body.Username, body.Loja, "Loja adicionada à rota de "+date) }
	s.mu.Unlock()
	if err == errRouteNotSaved { writeJSON(w, http.StatusConflict, map[string]string{"error": "Salve a rota do dia antes de adicionar outra loja"}); return }
	if err == errConflict { writeJSON(w, http.StatusConflict, map[string]string{"error": "Esta loja já está na rota do dia"}); return }
	if err != nil { logError(w, "Não foi possível adicionar a loja à rota", err); return }
	writeJSON(w, http.StatusCreated, added[0])
}

var errRouteNotSaved = fmt.Errorf("route day not saved")

func (s *Server) removeRouteStore(w http.ResponseWriter, r *http.Request) {
	date, store := r.PathValue("date"), strings.TrimSpace(r.PathValue("loja"))
	var body struct { Username string `json:"username"` }
	_ = readJSON(r, &body)
	body.Username = strings.TrimSpace(body.Username)
	if !validDate(date) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	if body.Username == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe quem está alterando a rota"}); return }
	s.mu.Lock()
	result, err := s.db.Exec(`DELETE FROM route_day_stores WHERE visit_date = ? AND loja = ?`, date, store)
	changed := int64(0)
	if err == nil { changed, err = result.RowsAffected() }
	if err == nil && changed > 0 { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action) VALUES (?, ?, ?)`, body.Username, store, "Loja removida da rota de "+date) }
	s.mu.Unlock()
	if err != nil { logError(w, "Não foi possível remover a loja da rota", err); return }
	if changed == 0 { writeJSON(w, http.StatusNotFound, map[string]string{"error": "Loja não encontrada na rota do dia"}); return }
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getRouteVisits(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if !validDate(date) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	s.mu.Lock()
	visits, err := queryMaps(s.db, `SELECT * FROM route_visits WHERE visit_date = ? ORDER BY start_time, id`, date)
	var tickets []map[string]any
	if err == nil { tickets, err = queryMaps(s.db, `SELECT t.id, t.visit_id, t.ticket_number, t.description FROM route_tickets t JOIN route_visits v ON v.id=t.visit_id WHERE v.visit_date=? ORDER BY t.id`, date) }
	s.mu.Unlock()
	if err != nil { logError(w, "Não foi possível carregar os atendimentos", err); return }
	byVisit := make(map[int64][]map[string]any)
	for _, ticket := range tickets { byVisit[intValue(ticket["visit_id"])] = append(byVisit[intValue(ticket["visit_id"])], ticket) }
	for _, visit := range visits {
		list := byVisit[intValue(visit["id"])]
		if list == nil { list = []map[string]any{} }
		visit["tickets"] = list
	}
	writeJSON(w, http.StatusOK, visits)
}

func (s *Server) startRouteVisit(w http.ResponseWriter, r *http.Request) {
	var body struct { Loja string `json:"loja"`; Username string `json:"username"`; VisitDate string `json:"visit_date"` }
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos"}); return }
	body.Loja, body.Username = strings.TrimSpace(body.Loja), strings.TrimSpace(body.Username)
	store, ok := s.stores[body.Loja]
	if !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Loja não encontrada"}); return }
	if body.Username == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "O nome do responsável é obrigatório"}); return }
	if !validDate(body.VisitDate) { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Data inválida"}); return }
	s.mu.Lock()
	var open int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM route_visits WHERE loja=? AND visit_date=? AND end_time IS NULL`, body.Loja, body.VisitDate).Scan(&open)
	if err == nil && open > 0 { err = errConflict }
	var visitID int64
	if err == nil {
		result, execErr := s.db.Exec(`INSERT INTO route_visits (loja, cidade, bairro, start_time, visit_date) VALUES (?, ?, ?, datetime('now', 'localtime'), ?)`, body.Loja, store.Cidade, store.Bairro, body.VisitDate)
		err = execErr
		if err == nil { visitID, err = result.LastInsertId() }
	}
	if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action, visit_id) VALUES (?, ?, ?, ?)`, body.Username, body.Loja, "Início do atendimento", visitID) }
	var visit []map[string]any
	if err == nil { visit, err = queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, visitID) }
	s.mu.Unlock()
	if err == errConflict { writeJSON(w, http.StatusConflict, map[string]string{"error": "Já existe um atendimento em andamento para esta loja"}); return }
	if err != nil { logError(w, "Não foi possível iniciar o atendimento", err); return }
	writeJSON(w, http.StatusCreated, visit[0])
}

func parseVisitID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func (s *Server) updateRouteVisit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseVisitID(r)
	if !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Atendimento inválido"}); return }
	var body map[string]any
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos"}); return }
	s.mu.Lock()
	visit, err := queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, id)
	if err == nil && len(visit) == 0 { err = sql.ErrNoRows }
	if err == nil && stringValue(visit[0]["status"]) != "ABERTO" { err = errConflict }
	username := stringValue(body["username"])
	startTime, validStart := normalizeDateTime(body["start_time"])
	observations := stringValue(body["observations"])
	if err == nil && username == "" { err = errMissingUsername }
	if err == nil && !validStart { err = errInvalidStart }
	// Uma visita só pode ser alterada enquanto estiver aberta; a conclusão pode seguir dois fluxos.
	status := stringValue(body["status"])
	if status == "" && body["complete"] == true { status = "FINALIZADO" }
	if err == nil && status != "" && status != "VALIDAR" && status != "FINALIZADO" { err = errInvalidStatus }
	if err == nil && (status == "VALIDAR" || status == "FINALIZADO") {
		endTime, validEnd := normalizeDateTime(body["end_time"])
		if !validEnd || endTime < startTime { err = errInvalidEnd } else {
			_, err = s.db.Exec(`UPDATE route_visits SET start_time=?, end_time=?, duration_minutes=MAX(0, ROUND((julianday(?) - julianday(?))*1440)), observations=?, status=?, validator_name=NULL, contact_name=NULL, validator_role=NULL, validation_observations=NULL, validated_at=NULL WHERE id=?`, startTime, endTime, endTime, startTime, observations, status, id)
			action := "Atendimento finalizado"
			if status == "VALIDAR" { action = "Atendimento aguardando validação" }
			if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action, visit_id) VALUES (?, ?, ?, ?)`, username, visit[0]["loja"], action, id) }
		}
	} else if err == nil {
		_, err = s.db.Exec(`UPDATE route_visits SET start_time=?, observations=? WHERE id=?`, startTime, observations, id)
		if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action, visit_id) VALUES (?, ?, ?, ?)`, username, visit[0]["loja"], "Atualização do atendimento", id) }
	}
	if err == nil { visit, err = queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, id) }
	s.mu.Unlock()
	if writeVisitError(w, err); err != nil { return }
	writeJSON(w, http.StatusOK, visit[0])
}

var (
	errMissingUsername = fmt.Errorf("missing username")
	errInvalidStart = fmt.Errorf("invalid start time")
	errInvalidEnd = fmt.Errorf("invalid end time")
	errInvalidStatus = fmt.Errorf("invalid status")
)

func writeVisitError(w http.ResponseWriter, err error) bool {
	switch err {
	case nil: return false
	case sql.ErrNoRows: writeJSON(w, http.StatusNotFound, map[string]string{"error": "Atendimento não encontrado"})
	case errConflict: writeJSON(w, http.StatusConflict, map[string]string{"error": "Este atendimento já foi concluído ou aguarda validação"})
	case errMissingUsername: writeJSON(w, http.StatusBadRequest, map[string]string{"error": "O nome do responsável é obrigatório"})
	case errInvalidStart: writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Horário de chegada inválido"})
	case errInvalidEnd: writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Horário de saída inválido"})
	case errInvalidStatus: writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Status de conclusão inválido"})
	default: logError(w, "Não foi possível atualizar o atendimento", err)
	}
	return true
}

func (s *Server) validateRouteVisit(w http.ResponseWriter, r *http.Request) {
	id, ok := parseVisitID(r)
	if !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Atendimento inválido"}); return }
	var body struct { ValidatorName string `json:"validator_name"`; ValidatorRole string `json:"validator_role"`; Observations string `json:"validation_observations"`; ValidatedAt string `json:"validated_at"` }
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos"}); return }
	body.ValidatorName, body.ValidatorRole = strings.TrimSpace(body.ValidatorName), strings.TrimSpace(body.ValidatorRole)
	validatedAt, validTime := normalizeDateTime(body.ValidatedAt)
	if body.ValidatorName == "" || body.ValidatorRole == "" || !validTime { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe o nome, a função e a data e hora da validação"}); return }
	s.mu.Lock()
	visit, err := queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, id)
	if err == nil && len(visit) == 0 { err = sql.ErrNoRows }
	if err == nil && stringValue(visit[0]["status"]) != "VALIDAR" { err = errConflict }
	if err == nil && validatedAt < stringValue(visit[0]["end_time"]) { err = errInvalidValidationDate }
	if err == nil {
		_, err = s.db.Exec(`UPDATE route_visits SET validator_name=?, validator_role=?, validation_observations=?, validated_at=?, status='FINALIZADO' WHERE id=?`, body.ValidatorName, body.ValidatorRole, strings.TrimSpace(body.Observations), validatedAt, id)
	}
	if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action, visit_id) VALUES (?, ?, ?, ?)`, body.ValidatorName, visit[0]["loja"], "Atendimento validado ("+body.ValidatorRole+")", id) }
	if err == nil { visit, err = queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, id) }
	s.mu.Unlock()
	if err == errInvalidValidationDate { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "A data e hora da validação não podem ser anteriores ao encerramento"}); return }
	if err == errConflict && len(visit) > 0 { writeJSON(w, http.StatusConflict, map[string]string{"error": "Este atendimento não está aguardando validação"}); return }
	if writeVisitError(w, err) { return }
	writeJSON(w, http.StatusOK, visit[0])
}

var errInvalidValidationDate = fmt.Errorf("validation before visit end")

func (s *Server) addRouteTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseVisitID(r)
	if !ok { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Atendimento inválido"}); return }
	var body struct { Number string `json:"ticket_number"`; Description string `json:"description"`; Username string `json:"username"` }
	if err := readJSON(r, &body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos"}); return }
	body.Number, body.Description, body.Username = strings.TrimSpace(body.Number), strings.TrimSpace(body.Description), strings.TrimSpace(body.Username)
	if body.Number == "" || body.Description == "" || body.Username == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Número do chamado, descrição e responsável são obrigatórios"}); return }
	s.mu.Lock()
	visit, err := queryMaps(s.db, `SELECT * FROM route_visits WHERE id=?`, id)
	if err == nil && len(visit) == 0 { err = sql.ErrNoRows }
	if err == nil && visit[0]["end_time"] != nil { err = errConflict }
	var ticketID int64
	if err == nil {
		var result sql.Result
		result, err = s.db.Exec(`INSERT INTO route_tickets (visit_id, ticket_number, description) VALUES (?, ?, ?)`, id, body.Number, body.Description)
		if err == nil { ticketID, err = result.LastInsertId() }
	}
	if err == nil { _, err = s.db.Exec(`INSERT INTO route_audit (username, loja, action, visit_id) VALUES (?, ?, ?, ?)`, body.Username, visit[0]["loja"], "Chamado "+body.Number+" adicionado", id) }
	var tickets []map[string]any
	if err == nil { tickets, err = queryMaps(s.db, `SELECT * FROM route_tickets WHERE id=?`, ticketID) }
	s.mu.Unlock()
	if err == errConflict { writeJSON(w, http.StatusConflict, map[string]string{"error": "Não é possível adicionar chamados a um atendimento concluído"}); return }
	if writeVisitError(w, err) { return }
	writeJSON(w, http.StatusCreated, tickets[0])
}

func (s *Server) getRouteDashboard(w http.ResponseWriter, _ *http.Request) {
	// As consultas mantêm os nomes de propriedades consumidos pelo painel de atendimentos.
	s.mu.Lock()
	topStores, err := queryMaps(s.db, `SELECT loja, COUNT(*) AS visits FROM route_visits GROUP BY loja ORDER BY visits DESC, CAST(loja AS INTEGER) LIMIT 10`)
	var averages, cities, monthly, audits []map[string]any
	if err == nil { averages, err = queryMaps(s.db, `SELECT loja, ROUND(AVG(duration_minutes),1) AS average_minutes FROM route_visits WHERE duration_minutes IS NOT NULL GROUP BY loja ORDER BY average_minutes DESC`) }
	if err == nil { cities, err = queryMaps(s.db, `SELECT cidade, COUNT(*) AS visits FROM route_visits GROUP BY cidade ORDER BY visits DESC, cidade`) }
	var today, month, year int64
	if err == nil { err = s.db.QueryRow(`SELECT COALESCE(SUM(CASE WHEN v.visit_date=date('now','localtime') THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN v.visit_date>=date('now','localtime','start of month') THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN v.visit_date>=date('now','localtime','start of year') THEN 1 ELSE 0 END),0) FROM route_tickets t JOIN route_visits v ON v.id=t.visit_id`).Scan(&today, &month, &year) }
	if err == nil { monthly, err = queryMaps(s.db, `SELECT visit_date AS date, COUNT(*) AS visits, COALESCE(SUM(duration_minutes),0) AS minutes FROM route_visits WHERE visit_date>=date('now','localtime','start of month') GROUP BY visit_date ORDER BY visit_date`) }
	if err == nil {
		tickets, ticketErr := queryMaps(s.db, `SELECT v.visit_date AS date, COUNT(*) AS tickets FROM route_tickets t JOIN route_visits v ON v.id=t.visit_id WHERE v.visit_date>=date('now','localtime','start of month') GROUP BY v.visit_date`)
		err = ticketErr
		counts := make(map[string]any)
		for _, ticket := range tickets { counts[stringValue(ticket["date"])] = ticket["tickets"] }
		for _, day := range monthly { if count, ok := counts[stringValue(day["date"])]; ok { day["tickets"] = count } else { day["tickets"] = 0 } }
	}
	if err == nil { audits, err = queryMaps(s.db, `SELECT created_at, username, loja, action FROM route_audit ORDER BY id DESC LIMIT 50`) }
	s.mu.Unlock()
	if err != nil { logError(w, "Não foi possível carregar o painel de atendimentos", err); return }
	if topStores == nil { topStores = []map[string]any{} }
	if averages == nil { averages = []map[string]any{} }
	if cities == nil { cities = []map[string]any{} }
	if monthly == nil { monthly = []map[string]any{} }
	if audits == nil { audits = []map[string]any{} }
	sort.Slice(monthly, func(i, j int) bool { return stringValue(monthly[i]["date"]) < stringValue(monthly[j]["date"]) })
	writeJSON(w, http.StatusOK, map[string]any{
		"topStores": topStores, "averageTime": averages, "cityRanking": cities,
		"ticketTotals": map[string]int64{"today": today, "month": month, "year": year}, "monthly": monthly, "audits": audits,
	})
}

var _ = json.Number("")