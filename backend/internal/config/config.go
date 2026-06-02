package config

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
)

// BrokerConfig defines connection parameters for a single MQTT broker.
type BrokerConfig struct {
	Name     string `json:"name"`
	Broker   string `json:"broker"`
	Port     int    `json:"port"`
	Topic    string `json:"topic"`
	Username string `json:"username"`
	Password string `json:"password"`
	QoS      int    `json:"qos"`
	ClientID string `json:"client_id"`
	TLS      bool   `json:"tls"`
	Insecure bool   `json:"insecure"`
}

// Config holds all runtime configuration loaded from environment variables.
type Config struct {
	// Database
	DatabaseURL string

	// MQTT (single-broker fields kept for backward compatibility and as
	// defaults when MQTT_BROKERS_JSON is unset).
	MQTTBroker   string
	MQTTPort     int
	MQTTTopic    string
	MQTTUsername string
	MQTTPassword string
	MQTTQoS      int
	MQTTClientID string
	MQTTTLS      bool
	MQTTInsecure bool

	// Brokers is the resolved list of broker connections. When MQTT_BROKERS
	// is set, it overrides the single-broker fields above.
	Brokers []BrokerConfig

	// API Server
	APIHost string
	APIPort int

	// Frontend
	FrontendURL string

	// Auth
	JWTSecret     string
	SessionExpiry int

	// Database pool
	DBMinConns int32
	DBMaxConns int32

	// Rate limit
	RateLimitPerSec int

	// Admin seed
	AdminEmail    string
	AdminPassword string

	// Logging
	LogLevel string
}

// Load reads configuration from environment variables with defaults.
func Load() *Config {
	cfg := &Config{
		// Database
		DatabaseURL: getEnv("DATABASE_URL", "postgres://telemetryhub:password@localhost:5432/telemetryhub?sslmode=disable"),

		// MQTT
		MQTTBroker:   getEnv("MQTT_BROKER", ""),
		MQTTPort:     getEnvInt("MQTT_PORT", 1883),
		MQTTTopic:    getEnv("MQTT_TOPIC", "#"),
		MQTTUsername: getEnv("MQTT_USERNAME", ""),
		MQTTPassword: getEnv("MQTT_PASSWORD", ""),
		MQTTQoS:      getEnvInt("MQTT_QOS", 1),
		MQTTClientID: getEnv("MQTT_CLIENT_ID", ""),
		MQTTTLS:      getEnvBool("MQTT_TLS", true),
		MQTTInsecure: getEnvBool("MQTT_TLS_INSECURE", false),

		// API Server
		APIHost: getEnv("API_HOST", "0.0.0.0"),
		APIPort: getEnvInt("API_PORT", 8080),

		// Frontend
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),

		// Auth
		JWTSecret:     getEnv("JWT_SECRET", ""),
		SessionExpiry: getEnvInt("SESSION_EXPIRY_HOURS", 24),

		// Database pool
		DBMinConns: getEnvInt32("DB_MIN_CONNS", 2),
		DBMaxConns: getEnvInt32("DB_MAX_CONNS", 10),

		// Rate limit
		RateLimitPerSec: getEnvInt("RATE_LIMIT_PER_SEC", 20),

		// Admin seed
		AdminEmail:    getEnv("ADMIN_EMAIL", "admin@telemetryhub.local"),
		AdminPassword: getEnv("ADMIN_PASSWORD", ""),

		// Logging
		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	// Generate client ID if not set
	if cfg.MQTTClientID == "" {
		hostname, err := os.Hostname()
		if err != nil {
			hostname = "unknown"
		}
		cfg.MQTTClientID = fmt.Sprintf("telemetryhub-worker-%s", hostname)
	}

	cfg.Brokers = cfg.resolveBrokers()

	return cfg
}

// resolveBrokers builds the final broker list. If MQTT_BROKERS is set, it is
// parsed as a JSON array of BrokerConfig and the single-broker fields are
// ignored. Otherwise a single broker is synthesized from the single-broker
// fields (or the list is empty when no broker is configured).
func (c *Config) resolveBrokers() []BrokerConfig {
	if raw := os.Getenv("MQTT_BROKERS"); raw != "" {
		var brokers []BrokerConfig
		if err := json.Unmarshal([]byte(raw), &brokers); err != nil {
			log.Printf("Warning: invalid MQTT_BROKERS JSON, falling back to single-broker config: %v", err)
		} else {
			hostname, herr := os.Hostname()
			if herr != nil {
				hostname = "unknown"
			}
			for i := range brokers {
				if brokers[i].Name == "" {
					brokers[i].Name = fmt.Sprintf("broker-%d", i+1)
				}
				if brokers[i].QoS < 0 || brokers[i].QoS > 2 {
					brokers[i].QoS = 1
				}
				if brokers[i].Port == 0 {
					if brokers[i].TLS {
						brokers[i].Port = 8883
					} else {
						brokers[i].Port = 1883
					}
				}
				if brokers[i].Topic == "" {
					brokers[i].Topic = "#"
				}
				if brokers[i].ClientID == "" {
					brokers[i].ClientID = fmt.Sprintf("telemetryhub-%s-%s", brokers[i].Name, hostname)
				}
			}
			return brokers
		}
	}

	if c.MQTTBroker == "" {
		return nil
	}

	qos := c.MQTTQoS
	if qos < 0 || qos > 2 {
		qos = 1
	}
	return []BrokerConfig{{
		Name:     "default",
		Broker:   c.MQTTBroker,
		Port:     c.MQTTPort,
		Topic:    c.MQTTTopic,
		Username: c.MQTTUsername,
		Password: c.MQTTPassword,
		QoS:      qos,
		ClientID: c.MQTTClientID,
		TLS:      c.MQTTTLS,
		Insecure: c.MQTTInsecure,
	}}
}

// Validate checks API-server required fields.
func (c *Config) Validate() error {
	if c.JWTSecret == "" {
		return fmt.Errorf("missing required environment variable: JWT_SECRET")
	}
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	return nil
}

// ValidateMQTT checks MQTT-worker required fields (calls Validate first).
func (c *Config) ValidateMQTT() error {
	if err := c.Validate(); err != nil {
		return err
	}
	if len(c.Brokers) == 0 {
		return fmt.Errorf("no MQTT brokers configured (set MQTT_BROKERS or MQTT_BROKER)")
	}
	for i, b := range c.Brokers {
		if b.Broker == "" {
			return fmt.Errorf("broker[%d] (%s): missing broker host", i, b.Name)
		}
		if b.Password == "" {
			return fmt.Errorf("broker[%d] (%s): missing password", i, b.Name)
		}
	}
	return nil
}

// MQTTBrokerAddr returns the broker address in paho URI format (scheme://host:port).
// Scheme is "ssl" when MQTT_TLS is enabled, "tcp" otherwise. paho.mqtt.golang
// decides whether to use TLS based on this scheme (NOT on SetTLSConfig alone).
func (c *Config) MQTTBrokerAddr() string {
	scheme := "tcp"
	if c.MQTTTLS {
		scheme = "ssl"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, c.MQTTBroker, c.MQTTPort)
}

// APIAddr returns the API server address in host:port format.
func (c *Config) APIAddr() string {
	return fmt.Sprintf("%s:%d", c.APIHost, c.APIPort)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	s := os.Getenv(key)
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		log.Printf("Warning: invalid %s=%q, using default %d", key, s, fallback)
		return fallback
	}
	return v
}

func getEnvInt32(key string, fallback int32) int32 {
	s := os.Getenv(key)
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		log.Printf("Warning: invalid %s=%q, using default %d", key, s, fallback)
		return fallback
	}
	if v > math.MaxInt32 {
		log.Printf("Warning: %s=%d exceeds int32 maximum, clamping to %d", key, v, math.MaxInt32)
		return math.MaxInt32
	}
	if v < math.MinInt32 {
		log.Printf("Warning: %s=%d below int32 minimum, clamping to %d", key, v, math.MinInt32)
		return math.MinInt32
	}
	return int32(v) //nolint:gosec // bounds-checked above
}

func getEnvBool(key string, fallback bool) bool {
	s := os.Getenv(key)
	if s == "" {
		return fallback
	}
	v, err := strconv.ParseBool(s)
	if err != nil {
		log.Printf("Warning: invalid %s=%q, using default %v", key, s, fallback)
		return fallback
	}
	return v
}
