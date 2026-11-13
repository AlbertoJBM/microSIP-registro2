package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestClassifyCall(t *testing.T) {
	cases := []struct {
		callType, duration int64
		description, category string
	}{
		{0, 10, "Saliente", "SALIENTE_ATENDIDA"},
		{0, 0, "Saliente", "SALIENTE_NAO_ATENDIDA"},
		{1, 5, "Entrante Atendida", "ENTRANTE_ATENDIDA"},
		{1, 0, "Entrante Não Atendida", "ENTRANTE_NAO_ATENDIDA"},
		{2, 0, "Entrante Não Atendida", "ENTRANTE_NAO_ATENDIDA"},
		{9, 0, "Desconhecido", "OUTRO"},
	}
	for _, test := range cases {
		description, category := classifyCall(test.callType, test.duration, "")
		if description != test.description || category != test.category {
			t.Errorf("classifyCall(%d, %d) = %q, %q", test.callType, test.duration, description, category)
		}
	}
}

func TestParsePhoneNumber(t *testing.T) {
	parsed := parsePhoneNumber("98480")
	if parsed.Store != "CD & CD2" || parsed.Sector != "TELEVENDAS" || parsed.SectorName != "Televendas" {
		t.Fatalf("resultado inesperado: %+v", parsed)
	}
	if got := parsePhoneNumber("123456").Store; got != "Desconhecida" {
		t.Fatalf("loja com prefixo longo = %q", got)
	}
}

func TestDateValidation(t *testing.T) {
	if !validDate("2026-11-13") || validDate("2026-02-30") || validDate("13-11-2026") {
		t.Fatal("validação de data não corresponde ao formato esperado")
	}
	if got, ok := normalizeDateTime("2026-11-13T09:30"); !ok || got != "2026-11-13 09:30:00" {
		t.Fatalf("normalização = %q, %v", got, ok)
	}
}

func TestBatchAndCallsHTTPContract(t *testing.T) {
	db, err := openDatabase(filepath.Join(t.TempDir(), "central_logs.db"))
	if err != nil { t.Fatal(err) }
	defer db.Close()
	server := &Server{db: db, stores: map[string]StoreLocation{}, clients: map[*realtimeClient]struct{}{}, connected: map[string]struct{}{}}
	handler := server.handler()

	body := `{"agentInfo":{"username":"agent01","fullName":"Agent One"},"changes":[{"id":7,"callId":"call-7","number":"0180","type":1,"time":1794528000,"duration":20,"info":"Chamada encerrada","formatted_time":"2026-11-13 09:00:00"}],"lastSyncId":7}`
	request := httptest.NewRequest(http.MethodPost, "/api/logs/batch", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"stored":1`) {
		t.Fatalf("batch status=%d body=%s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/calls", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var calls []map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &calls); err != nil { t.Fatal(err) }
	if response.Code != http.StatusOK || len(calls) != 1 || calls[0]["callId"] != "call-7" || calls[0]["category"] != "ENTRANTE_ATENDIDA" {
		t.Fatalf("calls status=%d payload=%s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/sync/status/agent01", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"lastSyncId":7`) {
		t.Fatalf("sync status=%d body=%s", response.Code, response.Body.String())
	}
}