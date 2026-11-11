package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	_ "modernc.org/sqlite"
)

func TestFormatFullName(t *testing.T) {
	if got := formatFullName("alberto.morales"); got != "Alberto Morales" {
		t.Fatalf("got %q", got)
	}
	if got := formatFullName("caixa01"); got != "Caixa01" {
		t.Fatalf("got %q", got)
	}
}

func TestIsFinished(t *testing.T) {
	for _, info := range []string{"Chamada encerrada", "CANCEL", "NO ANSWER", "FAILED", "Ocupado", "Recusada", "ORIGINATOR_CANCEL"} {
		if !isFinished(info) {
			t.Fatalf("expected finished: %s", info)
		}
	}
	if isFinished("ringing") {
		t.Fatal("ringing is not a finished call")
	}
}

func TestSyncSkipsOpenCallAndRetriesIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "call_log.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	now := time.Now().Unix()
	if _, err := db.Exec(`CREATE TABLE call_log (
		id INTEGER, callId TEXT, number TEXT, name TEXT, type INTEGER, time INTEGER, duration INTEGER, info TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO call_log VALUES
		(93, 'a', '0180', '', 1, ?, 30, 'Chamada encerrada'),
		(94, 'b', '0180', '', 1, ?, 0, 'Ocupado'),
		(95, 'c', '0180', '', 1, ?, 0, ''),
		(96, 'd', '0180', '', 1, ?, 12, 'Chamada encerrada'),
		(97, 'e', '0180', '', 1, ?, 0, '')`, now-100, now-50, now-10, now-5, now-7200); err != nil {
		t.Fatal(err)
	}

	var sent [][]int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Changes []callLog `json:"changes"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		var ids []int64
		for _, c := range body.Changes {
			ids = append(ids, c.ID)
		}
		sent = append(sent, ids)
		w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	s := &syncer{
		client:         srv.Client(),
		server:         srv.URL,
		dbPath:         path,
		lastID:         92,
		ready:          true,
		pendingFile:    filepath.Join(t.TempDir(), "pending.json"),
		pendingTimeout: time.Hour,
	}
	s.loadPending()
	s.run()
	if len(sent) != 1 || len(sent[0]) != 4 || sent[0][0] != 93 || sent[0][1] != 94 || sent[0][2] != 96 || sent[0][3] != 97 {
		t.Fatalf("first batch = %v", sent)
	}
	if s.lastID != 97 || len(s.pending) != 1 {
		t.Fatalf("lastID=%d pending=%v", s.lastID, s.pending)
	}

	s.run()
	if len(sent) != 1 {
		t.Fatalf("resent while call open: %v", sent)
	}

	if _, err := db.Exec(`UPDATE call_log SET info = 'Chamada encerrada', duration = 40 WHERE id = 95`); err != nil {
		t.Fatal(err)
	}
	s.run()
	if len(sent) != 2 || len(sent[1]) != 1 || sent[1][0] != 95 || len(s.pending) != 0 {
		t.Fatalf("second batch = %v pending=%v", sent, s.pending)
	}
}

func TestReadCalls(t *testing.T) {
	path := filepath.Join(t.TempDir(), "call_log.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE call_log (
		id INTEGER, callId TEXT, number TEXT, name TEXT, type INTEGER, time INTEGER, duration INTEGER, info TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO call_log VALUES (4, 'abc', '0180', 'Joao', 1, 1692374400, 12, 'Chamada encerrada')`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	rows, _, err := readCalls(path, 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].CallID != "abc" || rows[0].FormattedTime == "" || !rows[0].finished {
		t.Fatalf("rows = %+v", rows)
	}
}

func TestPresenceHandshake(t *testing.T) {
	packet := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/socket.io/" || !strings.Contains(r.URL.RawQuery, "EIO=4") {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			t.Errorf("accept: %v", err)
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "bye")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if err := conn.Write(ctx, websocket.MessageText, []byte(`0{"sid":"t","pingInterval":25000,"pingTimeout":5000}`)); err != nil {
			t.Errorf("open: %v", err)
			return
		}
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Errorf("read connect: %v", err)
			return
		}
		packet <- string(data)
		if err := conn.Write(ctx, websocket.MessageText, []byte("2")); err != nil {
			return
		}
		_, data, err = conn.Read(ctx)
		if err != nil || string(data) != "3" {
			t.Errorf("pong = %q err=%v", data, err)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = maintainPresence(ctx, srv.URL, AgentInfo{Username: "alberto.morales", FullName: "Alberto Morales"})

	select {
	case raw := <-packet:
		if !strings.HasPrefix(raw, "40") {
			t.Fatalf("packet %q", raw)
		}
		var auth struct {
			AgentInfo AgentInfo `json:"agentInfo"`
		}
		if err := json.Unmarshal([]byte(raw[2:]), &auth); err != nil {
			t.Fatal(err)
		}
		if auth.AgentInfo.Username != "alberto.morales" {
			t.Fatalf("auth %+v", auth)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no llego el paquete de presencia")
	}
}
