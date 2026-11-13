package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type realtimeClient struct {
	conn     *websocket.Conn
	writeMu  sync.Mutex
	username string
	fullName string
}

func (s *Server) socketEndpoint(w http.ResponseWriter, r *http.Request) {
	// Os clientes atuais usam transporte WebSocket direto com Engine.IO v4.
	if r.URL.Query().Get("EIO") != "4" || r.URL.Query().Get("transport") != "websocket" {
		http.Error(w, "WebSocket Engine.IO v4 necessário", http.StatusBadRequest)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("Falha ao aceitar WebSocket: %v", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "conexão encerrada")

	sid := randomID()
	client := &realtimeClient{conn: conn}
	ctx := r.Context()
	openPacket, _ := json.Marshal(map[string]any{
		"sid": sid, "upgrades": []string{}, "pingInterval": 25000,
		"pingTimeout": 20000, "maxPayload": 50000000,
	})
	if err := client.write(ctx, "0"+string(openPacket)); err != nil { return }

	// A conexão Socket.IO só fica pronta após o pacote 40 do namespace padrão.
	_, packet, err := conn.Read(ctx)
	if err != nil { return }
	message := string(packet)
	if strings.HasPrefix(message, "2") {
		if client.write(ctx, "3") != nil { return }
		_, packet, err = conn.Read(ctx)
		if err != nil { return }
		message = string(packet)
	}
	if !strings.HasPrefix(message, "40") { return }
	if len(message) > 2 {
		var auth struct { AgentInfo AgentInfo `json:"agentInfo"` }
		if err := json.Unmarshal([]byte(message[2:]), &auth); err == nil {
			client.username, client.fullName = auth.AgentInfo.Username, auth.AgentInfo.FullName
		}
	}
	if err := client.write(ctx, "40"+string(mustJSON(map[string]string{"sid": sid}))); err != nil { return }

	s.mu.Lock()
	s.clients[client] = struct{}{}
	initialAgents := s.connectedAgentsLocked()
	if client.username != "" { s.connected[client.username] = struct{}{} }
	s.mu.Unlock()
	if err := client.emit(ctx, "agents-list", initialAgents); err != nil { s.removeClient(client); return }
	defer s.removeClient(client)
	if client.username != "" {
		log.Printf("Agente conectado: %s (%s)", client.fullName, client.username)
		s.emit("agent-connected", client.username)
		s.emit("agents-list", s.connectedAgents())
	}

	// Engine.IO envia ping periódico; o cliente deve responder com o pacote 3.
	stopPings := make(chan struct{})
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-stopPings: return
			case <-ctx.Done(): return
			case <-ticker.C:
				writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				err := client.write(writeCtx, "2")
				cancel()
				if err != nil { _ = conn.Close(websocket.StatusGoingAway, "heartbeat falhou"); return }
			}
		}
	}()
	defer close(stopPings)

	for {
		_, packet, err := conn.Read(ctx)
		if err != nil { break }
		message := string(packet)
		switch {
		case message == "2":
			if client.write(ctx, "3") != nil { return }
		case strings.HasPrefix(message, "42"):
			var event []json.RawMessage
			if json.Unmarshal([]byte(message[2:]), &event) == nil && len(event) > 1 {
				var name string
				if json.Unmarshal(event[0], &name) == nil && name == "logs-synced" {
					var data any
					if json.Unmarshal(event[1], &data) == nil { s.emit("new-logs", data) }
				}
			}
		case strings.HasPrefix(message, "41"):
			return
		}
	}
}

func (c *realtimeClient) write(ctx context.Context, packet string) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.Write(ctx, websocket.MessageText, []byte(packet))
}

func (c *realtimeClient) emit(ctx context.Context, event string, data any) error {
	packet, err := json.Marshal([]any{event, data})
	if err != nil { return err }
	return c.write(ctx, "42"+string(packet))
}

func (s *Server) emit(event string, data any) {
	s.mu.Lock()
	clients := make([]*realtimeClient, 0, len(s.clients))
	for client := range s.clients { clients = append(clients, client) }
	s.mu.Unlock()
	for _, client := range clients {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := client.emit(ctx, event, data); err != nil { log.Printf("Erro enviando evento %s: %v", event, err) }
		cancel()
	}
}

func (s *Server) connectedAgents() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.connectedAgentsLocked()
}

func (s *Server) connectedAgentsLocked() []string {
	agents := make([]string, 0, len(s.connected))
	for username := range s.connected { agents = append(agents, username) }
	return agents
}

func (s *Server) removeClient(client *realtimeClient) {
	s.mu.Lock()
	delete(s.clients, client)
	if client.username != "" { delete(s.connected, client.username) }
	agents := s.connectedAgentsLocked()
	s.mu.Unlock()
	if client.username != "" {
		log.Printf("Agente desconectado: %s", client.fullName)
		s.emit("agent-disconnected", client.username)
		s.emit("agents-list", agents)
	}
}

func randomID() string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil { return time.Now().Format("150405000") }
	return hex.EncodeToString(bytes[:])
}

func mustJSON(value any) []byte {
	data, err := json.Marshal(value)
	if err != nil { return []byte(`{}`) }
	return data
}