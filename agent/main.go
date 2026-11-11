package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/getlantern/systray"//para el icono de la barra de tareas

	"github.com/coder/websocket"
	_ "modernc.org/sqlite"
)

const defaultServerURL = "http://10.25.96.58:3001"

type Config struct {
	ServerURL   string `json:"serverUrl"`
	PollSeconds int    `json:"pollSeconds"`
	Username    string `json:"username"`
	FullName    string `json:"fullName"`
	DBPath      string `json:"dbPath"`

	PendingTimeoutMinutes int `json:"pendingTimeoutMinutes"`
}

type AgentInfo struct {
	Username    string `json:"username"`
	FullName    string `json:"fullName"`
	MachineName string `json:"machineName"`
	OSUser      string `json:"osUser"`
	ProfilePath string `json:"profilePath"`
}

type callLog struct {
	ID            int64  `json:"id"`
	CallID        string `json:"callId"`
	Number        string `json:"number"`
	Name          string `json:"name"`
	Type          int64  `json:"type"`
	Time          int64  `json:"time"`
	Duration      int64  `json:"duration"`
	Info          string `json:"info"`
	FormattedTime string `json:"formatted_time"`
	finished      bool
}
//teste de cambio
func main() {
    systray.Run(onReady, nil)
}

func onReady() {
    go runAgent()//funcion para ejecutar el agente- antiguo main()

    mQuit := systray.AddMenuItem("Salir", "Cerrar")

    go func() {
        <-mQuit.ClickedCh
        systray.Quit()
        os.Exit(0)
    }()
}


//final de teste de cambio
func runAgent() {//antes main()
	exeDir := executableDir()
	logFile := setupLog(exeDir)
	if logFile != nil {
		defer logFile.Close()
	}

	cfg := loadConfig(exeDir)
	info, dbPath := detectAgent(cfg)

	log.Printf("Agente: %s (%s)", info.FullName, info.Username)
	log.Printf("Maquina: %s", info.MachineName)
	log.Printf("Base MicroSIP: %s", dbPath)
	log.Printf("Servidor: %s", cfg.ServerURL)
	log.Printf("Intervalo: %ds", cfg.PollSeconds)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	go presenceLoop(ctx, cfg.ServerURL, info)

	client := &http.Client{Timeout: 60 * time.Second}
	syncer := &syncer{
		client:         client,
		server:         strings.TrimRight(cfg.ServerURL, "/"),
		dbPath:         dbPath,
		info:           info,
		pendingFile:    filepath.Join(exeDir, "pending.json"),
		pendingTimeout: time.Duration(cfg.PendingTimeoutMinutes) * time.Minute,
	}
	syncer.loadPending()

	ticker := time.NewTicker(time.Duration(cfg.PollSeconds) * time.Second)
	defer ticker.Stop()

	syncer.run()
	for {
		select {
		case <-ctx.Done():
			log.Println("Cerrando agente...")
			return
		case <-ticker.C:
			syncer.run()
		}
	}
}

type syncer struct {
	client  *http.Client
	server  string
	dbPath  string
	info    AgentInfo
	lastID  int64
	ready   bool
	running bool

	pending        map[int64]struct{}
	pendingFile    string
	pendingTimeout time.Duration
}

func (s *syncer) pendingIDs() []int64 {
	ids := make([]int64, 0, len(s.pending))
	for id := range s.pending {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func (s *syncer) loadPending() {
	s.pending = map[int64]struct{}{}
	if s.pendingFile == "" {
		return
	}
	raw, err := os.ReadFile(s.pendingFile)
	if err != nil {
		return
	}
	var ids []int64
	if err := json.Unmarshal(raw, &ids); err != nil {
		log.Printf("pending.json invalido: %v", err)
		return
	}
	for _, id := range ids {
		s.pending[id] = struct{}{}
	}
	if len(ids) > 0 {
		log.Printf("%d llamadas pendientes de terminar: %v", len(ids), ids)
	}
}

func (s *syncer) setPending(pending map[int64]struct{}) {
	s.pending = pending
	if s.pendingFile == "" {
		return
	}
	raw, _ := json.Marshal(s.pendingIDs())
	if err := os.WriteFile(s.pendingFile, raw, 0644); err != nil {
		log.Printf("No se pudo guardar pending.json: %v", err)
	}
}

func (s *syncer) isDone(row callLog, now time.Time) bool {
	if row.finished {
		return true
	}
	return s.pendingTimeout > 0 && now.Sub(time.Unix(row.Time, 0)) > s.pendingTimeout
}

func (s *syncer) run() {
	if s.running {
		return
	}
	s.running = true
	defer func() { s.running = false }()

	if !s.ready {
		id, err := s.fetchLastSyncID()
		if err != nil {
			log.Printf("Servidor no disponible, reintento en el proximo ciclo: %v", err)
			return
		}
		s.lastID = id
		s.ready = true
		log.Printf("Ultimo ID sincronizado: %d", s.lastID)
	}

	for {
		advanced, err := s.syncBatch()
		if err != nil {
			log.Printf("Error de sincronizacion: %v", err)
			return
		}
		if !advanced {
			return
		}
	}
}

func (s *syncer) fetchLastSyncID() (int64, error) {
	endpoint := s.server + "/api/sync/status/" + url.PathEscape(s.info.Username)
	resp, err := s.client.Get(endpoint)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GET %s -> %s", endpoint, resp.Status)
	}
	var body struct {
		LastSyncID int64 `json:"lastSyncId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, err
	}
	return body.LastSyncID, nil
}

func (s *syncer) syncBatch() (bool, error) {
	if _, err := os.Stat(s.dbPath); err != nil {
		log.Printf("Todavia no existe %s", s.dbPath)
		return false, nil
	}

	newRows, pendingRows, err := readCalls(s.dbPath, s.lastID, s.pendingIDs())
	if err != nil {
		return false, err
	}

	now := time.Now()
	batch := make([]callLog, 0, len(pendingRows)+len(newRows))
	stillPending := map[int64]struct{}{}
	for _, row := range append(pendingRows, newRows...) {
		if s.isDone(row, now) {
			batch = append(batch, row)
		} else {
			stillPending[row.ID] = struct{}{}
		}
	}

	cursor := s.lastID
	if len(newRows) > 0 {
		cursor = newRows[len(newRows)-1].ID
	}

	if len(batch) == 0 && cursor == s.lastID {
		if len(stillPending) != len(s.pending) {
			s.setPending(stillPending)
		}
		return false, nil
	}

	payload := struct {
		AgentInfo  AgentInfo `json:"agentInfo"`
		Changes    []callLog `json:"changes"`
		LastSyncID int64     `json:"lastSyncId"`
	}{
		AgentInfo:  s.info,
		Changes:    batch,
		LastSyncID: cursor,
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return false, err
	}
	resp, err := s.client.Post(s.server+"/api/logs/batch", "application/json", strings.NewReader(string(raw)))
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	var result struct {
		Success bool   `json:"success"`
		Stored  int    `json:"stored"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}
	if resp.StatusCode != http.StatusOK || !result.Success {
		if result.Error == "" {
			result.Error = resp.Status
		}
		return false, fmt.Errorf("el servidor rechazo el lote: %s", result.Error)
	}

	s.lastID = cursor
	s.setPending(stillPending)
	log.Printf("Enviados %d registros, guardados %d, cursor %d", len(batch), result.Stored, cursor)
	if len(stillPending) > 0 {
		log.Printf("%d llamadas aun en curso %v; se reintentan en el proximo ciclo", len(stillPending), s.pendingIDs())
	}
	return len(newRows) == 1000, nil
}

func readCalls(dbPath string, afterID int64, pendingIDs []int64) ([]callLog, []callLog, error) {
	snapshot, err := snapshotDB(dbPath)
	if err != nil {
		return nil, nil, err
	}
	defer os.RemoveAll(filepath.Dir(snapshot))

	db, err := sql.Open("sqlite", snapshot)
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()

	newRows, err := queryCalls(db, "id > ? ORDER BY id ASC LIMIT 1000", afterID)
	if err != nil || len(pendingIDs) == 0 {
		return newRows, nil, err
	}
	args := make([]any, len(pendingIDs))
	for i, id := range pendingIDs {
		args[i] = id
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(pendingIDs)), ",")
	pendingRows, err := queryCalls(db, "id IN ("+placeholders+") ORDER BY id ASC", args...)
	return newRows, pendingRows, err
}

func queryCalls(db *sql.DB, where string, args ...any) ([]callLog, error) {
	rows, err := db.Query(`
		SELECT
			id,
			ifnull(callId, ''),
			ifnull(number, ''),
			ifnull(name, ''),
			ifnull(type, 0),
			ifnull(time, 0),
			ifnull(duration, 0),
			ifnull(info, ''),
			ifnull(datetime(time, 'unixepoch', 'localtime'), '')
		FROM call_log
		WHERE `+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var calls []callLog
	for rows.Next() {
		var c callLog
		if err := rows.Scan(&c.ID, &c.CallID, &c.Number, &c.Name, &c.Type, &c.Time, &c.Duration, &c.Info, &c.FormattedTime); err != nil {
			return nil, err
		}
		c.finished = isFinished(c.Info) || c.Duration > 0
		calls = append(calls, c)
	}
	return calls, rows.Err()
}

func isFinished(info string) bool {
    text := strings.ToLower(strings.TrimSpace(info))

    for _, part := range []string{
        "encerrada",
        "recusada",
        "rejeitada",
        "ocupad",
        "cancel",
        "no answer",
        "failed",
        "busy",
        "declin",
        "not found",
        "unavailable",
        "indispon",
        "finalizad",
        "terminad",
    } {
        if strings.Contains(text, part) {
            return true
        }
    }

    return false
}

func snapshotDB(src string) (string, error) {
	dir, err := os.MkdirTemp("", "microsip-")
	if err != nil {
		return "", err
	}
	dst := filepath.Join(dir, filepath.Base(src))
	if err := copyFile(src, dst); err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		from := src + suffix
		if _, err := os.Stat(from); err != nil {
			continue
		}
		if err := copyFile(from, dst+suffix); err != nil {
			os.RemoveAll(dir)
			return "", err
		}
	}
	return dst, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func presenceLoop(ctx context.Context, serverURL string, info AgentInfo) {
	delay := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		err := maintainPresence(ctx, serverURL, info)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("Presencia desconectada: %v", err)
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if delay < 15*time.Second {
			delay *= 2
		}
	}
}

func maintainPresence(ctx context.Context, serverURL string, info AgentInfo) error {
	wsURL, err := socketURL(serverURL)
	if err != nil {
		return err
	}
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(dialCtx, wsURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	_, data, err := conn.Read(ctx)
	if err != nil {
		return err
	}
	if len(data) == 0 || data[0] != '0' {
		return fmt.Errorf("handshake inesperado")
	}

	auth, err := json.Marshal(map[string]AgentInfo{"agentInfo": info})
	if err != nil {
		return err
	}
	packet := append([]byte("40"), auth...)
	if err := conn.Write(ctx, websocket.MessageText, packet); err != nil {
		return err
	}
	log.Printf("Presencia conectada")

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		if len(data) > 0 && data[0] == '2' {
			if err := conn.Write(ctx, websocket.MessageText, []byte("3")); err != nil {
				return err
			}
		}
	}
}

func socketURL(serverURL string) (string, error) {
	u, err := url.Parse(serverURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	default:
		u.Scheme = "ws"
	}
	u.Path = "/socket.io/"
	u.RawQuery = "EIO=4&transport=websocket"
	return u.String(), nil
}

func loadConfig(exeDir string) Config {
	cfg := Config{ServerURL: defaultServerURL, PollSeconds: 10}
	for _, path := range []string{
		filepath.Join(exeDir, "agent.json"),
		"agent.json",
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if err := json.Unmarshal(raw, &cfg); err != nil {
			log.Printf("agent.json invalido (%s): %v", path, err)
			continue
		}
		log.Printf("Configuracion: %s", path)
		break
	}
	if env := strings.TrimSpace(os.Getenv("SERVER_URL")); env != "" {
		cfg.ServerURL = env
	}
	cfg.ServerURL = strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
	if cfg.ServerURL == "" {
		cfg.ServerURL = defaultServerURL
	}
	if cfg.PollSeconds < 2 {
		cfg.PollSeconds = 10
	}
	if cfg.PendingTimeoutMinutes <= 0 {
		cfg.PendingTimeoutMinutes = 60
	}
	return cfg
}

func detectAgent(cfg Config) (AgentInfo, string) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	username := strings.TrimSpace(cfg.Username)
	if username == "" {
		username = filepath.Base(home)
	}
	fullName := strings.TrimSpace(cfg.FullName)
	if fullName == "" {
		fullName = formatFullName(username)
	}
	osUser := username
	if current, err := user.Current(); err == nil && current.Username != "" {
		osUser = current.Username
	}
	host, err := os.Hostname()
	if err != nil {
		host = ""
	}
	dbPath := strings.TrimSpace(cfg.DBPath)
	if dbPath == "" {
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		dbPath = filepath.Join(appData, "MicroSIP", "call_log.db")
	}
	return AgentInfo{
		Username:    username,
		FullName:    fullName,
		MachineName: host,
		OSUser:      osUser,
		ProfilePath: home,
	}, dbPath
}

func formatFullName(username string) string {
	parts := strings.FieldsFunc(username, func(r rune) bool {
		return r == '.' || r == '-' || r == '_'
	})
	if len(parts) == 0 {
		return username
	}
	for i, part := range parts {
		lower := strings.ToLower(part)
		if lower == "" {
			continue
		}
		parts[i] = strings.ToUpper(lower[:1]) + lower[1:]
	}
	return strings.Join(parts, " ")
}

func executableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func setupLog(exeDir string) *os.File {
	file, err := os.OpenFile(filepath.Join(exeDir, "agent.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		log.SetOutput(os.Stdout)
		return nil
	}
	log.SetOutput(io.MultiWriter(os.Stdout, file))
	log.SetFlags(log.LstdFlags)
	return file
}
