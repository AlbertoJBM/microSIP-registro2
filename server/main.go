package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	//"github.com/coder/websocket"
	_ "modernc.org/sqlite"
)

const serverPort = "3001"

// StoreLocation conserva la forma do catálogo usado pelo dashboard e pela rota diária.
type StoreLocation struct {
	Loja   string `json:"loja"`
	Tipo   string `json:"tipo"`
	Bairro string `json:"bairro"`
	Cidade string `json:"cidade"`
	UF     string `json:"uf"`
}

// Server reúne os recursos compartilhados pelo HTTP, SQLite e Socket.IO compatível.
type Server struct {
	db          *sql.DB
	stores      map[string]StoreLocation
	dataDir     string
	staticDir   string
	mu          sync.Mutex
	clients     map[*realtimeClient]struct{}
	connected   map[string]struct{}
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	baseDir := filepath.Dir(exe)
	if _, err := os.Stat(filepath.Join(baseDir, "data")); err != nil {
		// Em desenvolvimento, go run usa server/ como diretório de trabalho.
		baseDir, _ = os.Getwd()
	}
	dataDir := filepath.Join(baseDir, "data")
	db, err := openDatabase(filepath.Join(dataDir, "central_logs.db"))
	if err != nil {
		log.Fatalf("Não foi possível iniciar o SQLite: %v", err)
	}
	defer db.Close()

	staticDir := filepath.Join(baseDir, "..", "dashboard", "dist")
	if _, err := os.Stat(staticDir); err != nil {
		staticDir = filepath.Join(baseDir, "public")
	}
	s := &Server{
		db: db, stores: loadStores(filepath.Join(dataDir, "store-locations.json")),
		dataDir: dataDir, staticDir: staticDir,
		clients: make(map[*realtimeClient]struct{}), connected: make(map[string]struct{}),
	}

	log.Printf("Servidor Go iniciado em http://10.25.96.58:%s", serverPort)//revisar el servidor para que sea visible en la red local
	log.Printf("Banco SQLite: %s", filepath.Join(dataDir, "central_logs.db"))
	log.Fatal(http.ListenAndServe(":"+serverPort, s.handler()))
}

func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339Nano)})
	})
	mux.HandleFunc("GET /api/route/stores", s.getStores)
	mux.HandleFunc("GET /api/route/days/{date}", s.getRouteDay)
	mux.HandleFunc("POST /api/route/days/{date}", s.saveRouteDay)
	mux.HandleFunc("POST /api/route/days/{date}/stores", s.addRouteStore)
	mux.HandleFunc("DELETE /api/route/days/{date}/stores/{loja}", s.removeRouteStore)
	mux.HandleFunc("GET /api/route/visits", s.getRouteVisits)
	mux.HandleFunc("POST /api/route/visits", s.startRouteVisit)
	mux.HandleFunc("PATCH /api/route/visits/{id}", s.updateRouteVisit)
	mux.HandleFunc("POST /api/route/visits/{id}/validate", s.validateRouteVisit)
	mux.HandleFunc("POST /api/route/visits/{id}/tickets", s.addRouteTicket)
	mux.HandleFunc("GET /api/route/dashboard", s.getRouteDashboard)
	mux.HandleFunc("POST /api/logs/batch", s.receiveBatch)
	mux.HandleFunc("GET /api/stats", s.getStats)
	mux.HandleFunc("GET /api/stats/by-loja", s.getStatsByStore)
	mux.HandleFunc("GET /api/filters", s.getFilters)
	mux.HandleFunc("GET /api/calls", s.getCalls)
	mux.HandleFunc("GET /api/agents", s.getAgents)
	mux.HandleFunc("GET /api/sync/status/{username}", s.getSyncStatus)
	mux.HandleFunc("GET /socket.io/", s.socketEndpoint)
	mux.HandleFunc("/", s.serveDashboard)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// O servidor legado libera CORS para todos os hosts da rede local.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method == http.MethodPost || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
		}
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) serveDashboard(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/socket.io/" {
		http.NotFound(w, r)
		return
	}
	// Arquivos do build do Vite são servidos diretamente; rotas do frontend recebem index.html.
	clean := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
	if clean != "." && !strings.HasPrefix(clean, "..") {
		candidate := filepath.Join(s.staticDir, clean)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			http.ServeFile(w, r, candidate)
			return
		}
	}
	index := filepath.Join(s.staticDir, "index.html")
	if _, err := os.Stat(index); err == nil {
		http.ServeFile(w, r, index)
		return
	}
	http.NotFound(w, r)
}

func loadStores(path string) map[string]StoreLocation {
	stores := make(map[string]StoreLocation)
	raw, err := os.ReadFile(path)
	if err != nil {
		log.Printf("Catálogo de localidades não carregado (%s): %v", path, err)
		return stores
	}
	if err := json.Unmarshal(raw, &stores); err != nil {
		log.Printf("JSON do catálogo de localidades inválido: %v", err)
	}
	return stores
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("Erro ao escrever resposta JSON: %v", err)
	}
}

func readJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	return decoder.Decode(target)
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimSpace(toString(value)))
}

func toString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	default:
		return ""
	}
}

func intValue(value any) int64 {
	switch v := value.(type) {
	case json.Number:
		n, _ := v.Int64()
		return n
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	case string:
		n, _ := strconv.ParseInt(v, 10, 64)
		return n
	default:
		return 0
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; !ok {
			seen[value] = struct{}{}
			result = append(result, value)
		}
	}
	return result
}

func (s *Server) getStores(w http.ResponseWriter, _ *http.Request) {
	stores := make([]StoreLocation, 0, len(s.stores))
	for _, store := range s.stores {
		stores = append(stores, store)
	}
	sort.Slice(stores, func(i, j int) bool {
		a, _ := strconv.Atoi(stores[i].Loja)
		b, _ := strconv.Atoi(stores[j].Loja)
		return a < b
	})
	writeJSON(w, http.StatusOK, stores)
}