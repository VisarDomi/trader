package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// --- Config ---

const (
	flushInterval    = 1 * time.Second
	pingInterval     = 60 * time.Second
	reconnectDelay   = 3 * time.Second
	watchdogInterval = 30 * time.Second
	batchSize        = 500
)

var recordedEpics = []string{"US100", "BTCUSD"}

// --- Types ---

type tick struct {
	Instrument string
	Timestamp  int64
	Bid        float64
	Ask        float64
}

type capitalTokens struct {
	CST           string
	SecurityToken string
}

// --- Capital.com Auth ---

func authenticate(apiKey, identifier, password string) (capitalTokens, error) {
	body, _ := json.Marshal(map[string]string{
		"identifier": identifier,
		"password":   password,
	})

	req, err := http.NewRequest("POST", "https://api-capital.backend-capital.com/api/v1/session", bytes.NewReader(body))
	if err != nil {
		return capitalTokens{}, err
	}
	req.Header.Set("X-CAP-API-KEY", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return capitalTokens{}, fmt.Errorf("auth request: %w", err)
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return capitalTokens{}, fmt.Errorf("auth failed: status %d", resp.StatusCode)
	}

	return capitalTokens{
		CST:           resp.Header.Get("CST"),
		SecurityToken: resp.Header.Get("X-SECURITY-TOKEN"),
	}, nil
}

// --- Database ---

func insertTicks(ctx context.Context, pool *pgxpool.Pool, ticks []tick) error {
	if len(ticks) == 0 {
		return nil
	}

	for i := 0; i < len(ticks); i += batchSize {
		end := i + batchSize
		if end > len(ticks) {
			end = len(ticks)
		}
		batch := ticks[i:end]

		query := "INSERT INTO ticks (instrument, timestamp, bid, ask) VALUES "
		args := make([]any, 0, len(batch)*4)
		for j, t := range batch {
			if j > 0 {
				query += ","
			}
			base := j * 4
			query += fmt.Sprintf("($%d,$%d,$%d,$%d)", base+1, base+2, base+3, base+4)
			args = append(args, t.Instrument, t.Timestamp, t.Bid, t.Ask)
		}
		query += " ON CONFLICT (instrument, timestamp) DO NOTHING"

		if _, err := pool.Exec(ctx, query, args...); err != nil {
			return fmt.Errorf("insert batch: %w", err)
		}
	}
	return nil
}

// --- WebSocket ---

type wsMessage struct {
	Destination   string          `json:"destination"`
	CorrelationID string          `json:"correlationId,omitempty"`
	CST           string          `json:"cst,omitempty"`
	SecurityToken string          `json:"securityToken,omitempty"`
	Payload       json.RawMessage `json:"payload,omitempty"`
}

type quotePayload struct {
	Epic string  `json:"epic"`
	Bid  float64 `json:"bid"`
	Ofr  float64 `json:"ofr"`
}

func run(ctx context.Context, pool *pgxpool.Pool) {
	apiKey := os.Getenv("CAPITAL_API_KEY")
	identifier := os.Getenv("CAPITAL_IDENTIFIER")
	password := os.Getenv("CAPITAL_PASSWORD")

	if apiKey == "" || identifier == "" || password == "" {
		log.Fatal("Missing CAPITAL_API_KEY, CAPITAL_IDENTIFIER, or CAPITAL_PASSWORD")
	}

	var (
		mu         sync.Mutex
		buffer     []tick
		totalSaved int64
		lastTickAt time.Time
	)

	// Flush loop
	go func() {
		ticker := time.NewTicker(flushInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				mu.Lock()
				if len(buffer) == 0 {
					mu.Unlock()
					continue
				}
				batch := buffer
				buffer = nil
				mu.Unlock()

				if err := insertTicks(ctx, pool, batch); err != nil {
					log.Printf("ERROR flush: %v", err)
					// Return batch to buffer
					mu.Lock()
					buffer = append(batch, buffer...)
					mu.Unlock()
					continue
				}
				totalSaved += int64(len(batch))
			}
		}
	}()

	consecutiveAuthFailures := 0

	for {
		// Check context before reconnecting
		if ctx.Err() != nil {
			return
		}

		// Authenticate
		tokens, err := authenticate(apiKey, identifier, password)
		if err != nil {
			consecutiveAuthFailures++
			delay := time.Duration(math.Min(
				float64(reconnectDelay)*math.Pow(2, float64(consecutiveAuthFailures-1)),
				60*float64(time.Second),
			))
			log.Printf("Auth failed (%d): %v — retrying in %v", consecutiveAuthFailures, err, delay)
			select {
			case <-time.After(delay):
				continue
			case <-ctx.Done():
				return
			}
		}
		consecutiveAuthFailures = 0
		log.Println("Authenticated.")

		// Connect WebSocket
		dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
		conn, _, err := dialer.DialContext(ctx, "wss://api-streaming-capital.backend-capital.com/connect", nil)
		if err != nil {
			log.Printf("WebSocket dial: %v", err)
			select {
			case <-time.After(reconnectDelay):
				continue
			case <-ctx.Done():
				return
			}
		}
		log.Println("WebSocket connected.")

		// Subscribe
		subPayload, _ := json.Marshal(map[string][]string{"epics": recordedEpics})
		sub := wsMessage{
			Destination:   "marketData.subscribe",
			CorrelationID: "1",
			CST:           tokens.CST,
			SecurityToken: tokens.SecurityToken,
			Payload:       subPayload,
		}
		if err := conn.WriteJSON(sub); err != nil {
			log.Printf("Subscribe error: %v", err)
			conn.Close()
			continue
		}
		log.Printf("Subscribed to %v", recordedEpics)

		// Ping keepalive
		pingDone := make(chan struct{})
		go func() {
			ticker := time.NewTicker(pingInterval)
			defer ticker.Stop()
			for {
				select {
				case <-pingDone:
					return
				case <-ctx.Done():
					return
				case <-ticker.C:
					conn.WriteJSON(wsMessage{Destination: "ping"})
				}
			}
		}()

		// Watchdog
		watchdogDone := make(chan struct{})
		wsClose := make(chan struct{})
		go func() {
			ticker := time.NewTicker(watchdogInterval)
			defer ticker.Stop()
			for {
				select {
				case <-watchdogDone:
					return
				case <-ctx.Done():
					return
				case <-ticker.C:
					mu.Lock()
					lt := lastTickAt
					mu.Unlock()
					if !lt.IsZero() && time.Since(lt) > watchdogInterval {
						log.Printf("Watchdog: no ticks for %v — closing", time.Since(lt).Round(time.Second))
						conn.Close()
						return
					}
				}
			}
		}()

		// Read loop
		func() {
			defer func() {
				close(pingDone)
				close(watchdogDone)
				conn.Close()
				close(wsClose)
			}()

			for {
				_, raw, err := conn.ReadMessage()
				if err != nil {
					if ctx.Err() == nil {
						log.Printf("WebSocket read: %v", err)
					}
					return
				}

				var msg wsMessage
				if err := json.Unmarshal(raw, &msg); err != nil {
					continue
				}

				if msg.Destination != "quote" {
					continue
				}

				var q quotePayload
				if err := json.Unmarshal(msg.Payload, &q); err != nil || q.Epic == "" {
					continue
				}

				now := time.Now()
				mu.Lock()
				lastTickAt = now
				buffer = append(buffer, tick{
					Instrument: q.Epic,
					Timestamp:  now.UnixMilli(),
					Bid:        q.Bid,
					Ask:        q.Ofr,
				})
				mu.Unlock()
			}
		}()

		log.Println("WebSocket closed. Reconnecting...")
		select {
		case <-time.After(reconnectDelay):
		case <-ctx.Done():
			return
		}
	}
}

func main() {
	// Load .env from working directory
	godotenv.Load()

	log.SetFlags(log.Ldate | log.Ltime | log.Lmsgprefix)
	log.SetPrefix("[record-ticks] ")

	log.Printf("Recording %d instruments: %v", len(recordedEpics), recordedEpics)

	// Database
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		os.Getenv("PG_USER"), os.Getenv("PG_PASSWORD"),
		getEnvOr("PG_HOST", "127.0.0.1"), getEnvOr("PG_PORT", "5432"),
		os.Getenv("PG_DATABASE"),
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("Database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Database ping: %v", err)
	}
	log.Println("Database connected.")

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down...")
		cancel()
	}()

	run(ctx, pool)
	log.Println("Done.")
}

func getEnvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
