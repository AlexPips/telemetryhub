package mqtt

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v5/pgxpool"

	"telemetryhub/internal/config"
	storepkg "telemetryhub/internal/store"
)

// BrokerStats is a snapshot of one broker's runtime statistics.
type BrokerStats struct {
	Name              string    `json:"name"`
	Broker            string    `json:"broker"`
	Port              int       `json:"port"`
	Topic             string    `json:"topic"`
	Connected         bool      `json:"connected"`
	LastConnectedAt   time.Time `json:"last_connected_at,omitempty"`
	LastMessageAt     time.Time `json:"last_message_at,omitempty"`
	MessagesReceived  int64     `json:"messages_received"`
	Errors            int64     `json:"errors"`
	Dropped           int64     `json:"dropped"`
	ReconnectAttempts int64     `json:"reconnect_attempts"`
	LastError         string    `json:"last_error,omitempty"`
}

// Client wraps a single MQTT broker connection.
type Client struct {
	name    string
	broker  config.BrokerConfig
	pool    *pgxpool.Pool
	mqtt    mqtt.Client
	handler *Handler
	dedup   *Deduplicator

	totalMessages     atomic.Int64
	totalErrors       atomic.Int64
	totalDropped      atomic.Int64
	reconnectAttempts atomic.Int64
	lastMessageAt     time.Time
	lastConnectedAt   time.Time
	lastError         string
	lastErrorMu       sync.RWMutex
	mu                sync.RWMutex
	shutdownOnce      sync.Once
}

// NewClient creates a new MQTT client for the given broker config.
func NewClient(broker config.BrokerConfig, pool *pgxpool.Pool) (*Client, error) {
	store := storepkg.NewStore(pool)
	dedup := NewDeduplicator(1000, 5*time.Minute)
	handler := NewHandler(broker.Name, store, dedup)

	return &Client{
		name:    broker.Name,
		broker:  broker,
		pool:    pool,
		handler: handler,
		dedup:   dedup,
	}, nil
}

// Name returns the broker's logical name.
func (c *Client) Name() string { return c.name }

// Connect establishes the MQTT connection and subscribes to the broker's topic.
func (c *Client) Connect(ctx context.Context) error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(brokerAddr(c.broker))
	opts.SetClientID(c.broker.ClientID)
	opts.SetCleanSession(false)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(60 * time.Second)
	opts.SetConnectRetryInterval(1 * time.Second)

	if c.broker.TLS {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: c.broker.Insecure, //nolint:gosec
		}
		opts.SetTLSConfig(tlsConfig)
		if c.broker.Insecure {
			log.Printf("[%s] WARNING: TLS insecure mode enabled", c.name)
		}
	}

	if c.broker.Username != "" {
		opts.SetUsername(c.broker.Username)
	}
	if c.broker.Password != "" {
		opts.SetPassword(c.broker.Password)
	}

	opts.SetOnConnectHandler(func(client mqtt.Client) {
		log.Printf("[%s] MQTT connected to %s", c.name, brokerAddr(c.broker))
		c.mu.Lock()
		c.lastConnectedAt = time.Now()
		c.mu.Unlock()
		c.dedup.Reset()
	})

	opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		c.reconnectAttempts.Add(1)
		c.setLastError(err.Error())
		log.Printf("[%s] MQTT connection lost: %v", c.name, err)
	})

	opts.SetDefaultPublishHandler(c.messageHandler)

	c.mqtt = mqtt.NewClient(opts)

	token := c.mqtt.Connect()
	token.Wait()
	if token.Error() != nil {
		c.setLastError(token.Error().Error())
		return fmt.Errorf("[%s] MQTT connect: %w", c.name, token.Error())
	}

	qos := c.broker.QoS
	if qos < 0 {
		qos = 0
	} else if qos > 2 {
		qos = 2
	}
	subToken := c.mqtt.Subscribe(c.broker.Topic, byte(qos), nil)
	subToken.Wait()
	if subToken.Error() != nil {
		c.setLastError(subToken.Error().Error())
		return fmt.Errorf("[%s] subscribe to %q: %w", c.name, c.broker.Topic, subToken.Error())
	}
	log.Printf("[%s] Subscribed to %q (QoS %d)", c.name, c.broker.Topic, qos)

	return nil
}

func (c *Client) messageHandler(client mqtt.Client, msg mqtt.Message) {
	c.totalMessages.Add(1)
	c.setLastMessageAt(time.Now())

	payload := msg.Payload()
	deviceID := extractDeviceID(payload, msg.Topic())

	if deviceID == "" {
		payloadStr := string(payload)
		if len(payloadStr) > 300 {
			payloadStr = payloadStr[:300] + "...(truncated)"
		}
		log.Printf("[%s] DEBUG msg: topic=%s payload=%s", c.name, msg.Topic(), payloadStr)
		log.Printf("[%s] Skipping message without ID from topic %s", c.name, msg.Topic())
		c.totalDropped.Add(1)
		return
	}

	if c.dedup.IsDuplicate(deviceID, payload) {
		log.Printf("[%s] Dedup dropped message from device %s", c.name, deviceID)
		c.totalDropped.Add(1)
		return
	}

	if err := c.handler.HandleMessage(deviceID, payload); err != nil {
		c.totalErrors.Add(1)
		c.setLastError(err.Error())
		log.Printf("[%s] Error handling message from device %s: %v", c.name, deviceID, err)
		return
	}

	if total := c.totalMessages.Load(); total%100 == 0 {
		log.Printf("[%s] Stats: received=%d errors=%d dropped=%d", c.name, total, c.totalErrors.Load(), c.totalDropped.Load())
	}
}

var deviceIDPattern = regexp.MustCompile(`^[A-Fa-f0-9]{6,}$`)

func extractDeviceID(payload []byte, topic string) string {
	var m map[string]interface{}
	if err := json.Unmarshal(payload, &m); err == nil {
		if id, ok := m["ID"].(string); ok && id != "" {
			return id
		}
	}
	segments := strings.Split(topic, "/")
	for i := len(segments) - 1; i >= 0; i-- {
		s := segments[i]
		if deviceIDPattern.MatchString(s) {
			return s
		}
	}
	return ""
}

func (c *Client) StartHealthServer(addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", c.healthHandler)
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Printf("Health server error: %v", err)
	}
}

func (c *Client) healthHandler(w http.ResponseWriter, r *http.Request) {
	c.mu.RLock()
	lastMsg := c.lastMessageAt
	lastConn := c.lastConnectedAt
	c.mu.RUnlock()

	connected := c.mqtt != nil && c.mqtt.IsConnected()
	healthy := connected && time.Since(lastMsg) < 15*time.Minute

	status := map[string]interface{}{
		"broker":             c.name,
		"mqtt_connected":     connected,
		"messages_received":  c.totalMessages.Load(),
		"errors":             c.totalErrors.Load(),
		"dropped":            c.totalDropped.Load(),
		"reconnect_attempts": c.reconnectAttempts.Load(),
		"last_message_at":    lastMsg.Format(time.RFC3339),
		"last_connected_at":  lastConn.Format(time.RFC3339),
	}

	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(status)
}

func (c *Client) Shutdown(ctx context.Context) {
	c.shutdownOnce.Do(func() {
		if c.mqtt != nil {
			c.mqtt.Disconnect(1000)
		}
	})
}

func (c *Client) setLastMessageAt(t time.Time) {
	c.mu.Lock()
	c.lastMessageAt = t
	c.mu.Unlock()
}

func (c *Client) setLastError(msg string) {
	c.lastErrorMu.Lock()
	c.lastError = msg
	c.lastErrorMu.Unlock()
}

func (c *Client) IsConnected() bool {
	return c.mqtt != nil && c.mqtt.IsConnected()
}

// Stats returns a snapshot of the broker's runtime statistics.
func (c *Client) Stats() BrokerStats {
	c.mu.RLock()
	lastMsg := c.lastMessageAt
	lastConn := c.lastConnectedAt
	c.mu.RUnlock()

	c.lastErrorMu.RLock()
	lastErr := c.lastError
	c.lastErrorMu.RUnlock()

	return BrokerStats{
		Name:              c.name,
		Broker:            c.broker.Broker,
		Port:              c.broker.Port,
		Topic:             c.broker.Topic,
		Connected:         c.IsConnected(),
		LastConnectedAt:   lastConn,
		LastMessageAt:     lastMsg,
		MessagesReceived:  c.totalMessages.Load(),
		Errors:            c.totalErrors.Load(),
		Dropped:           c.totalDropped.Load(),
		ReconnectAttempts: c.reconnectAttempts.Load(),
		LastError:         lastErr,
	}
}

func brokerAddr(b config.BrokerConfig) string {
	scheme := "tcp"
	if b.TLS {
		scheme = "ssl"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, b.Broker, b.Port)
}
