package config

import (
	"os"
	"strings"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("MQTT_BROKER")
	os.Unsetenv("MQTT_PORT")
	os.Unsetenv("MQTT_TOPIC")
	os.Unsetenv("MQTT_PASSWORD")
	os.Unsetenv("MQTT_BROKERS")
	os.Unsetenv("JWT_SECRET")

	cfg := Load()

	if cfg.MQTTPort != 1883 {
		t.Errorf("MQTTPort = %d, want 1883", cfg.MQTTPort)
	}
	if cfg.MQTTTopic != "#" {
		t.Errorf("MQTTTopic = %s, want #", cfg.MQTTTopic)
	}
	if cfg.MQTTQoS != 1 {
		t.Errorf("MQTTQoS = %d, want 1", cfg.MQTTQoS)
	}
	if cfg.APIHost != "0.0.0.0" {
		t.Errorf("APIHost = %s, want 0.0.0.0", cfg.APIHost)
	}
	if cfg.APIPort != 8080 {
		t.Errorf("APIPort = %d, want 8080", cfg.APIPort)
	}
	if cfg.SessionExpiry != 24 {
		t.Errorf("SessionExpiry = %d, want 24", cfg.SessionExpiry)
	}
	if cfg.DBMinConns != 2 {
		t.Errorf("DBMinConns = %d, want 2", cfg.DBMinConns)
	}
	if cfg.DBMaxConns != 10 {
		t.Errorf("DBMaxConns = %d, want 10", cfg.DBMaxConns)
	}
	if cfg.RateLimitPerSec != 20 {
		t.Errorf("RateLimitPerSec = %d, want 20", cfg.RateLimitPerSec)
	}
	if len(cfg.Brokers) != 0 {
		t.Errorf("Brokers = %d, want 0 when no MQTT configured", len(cfg.Brokers))
	}
}

func TestLoad_EnvVars(t *testing.T) {
	os.Setenv("MQTT_BROKER", "test.broker.com")
	os.Setenv("MQTT_PORT", "1883")
	os.Setenv("MQTT_TOPIC", "test/#")
	os.Setenv("MQTT_PASSWORD", "testpass")
	os.Unsetenv("MQTT_BROKERS")
	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-12345")
	os.Setenv("API_PORT", "9090")

	cfg := Load()

	if cfg.MQTTBroker != "test.broker.com" {
		t.Errorf("MQTTBroker = %s, want test.broker.com", cfg.MQTTBroker)
	}
	if cfg.MQTTPort != 1883 {
		t.Errorf("MQTTPort = %d, want 1883", cfg.MQTTPort)
	}
	if cfg.MQTTTopic != "test/#" {
		t.Errorf("MQTTTopic = %s, want test/#", cfg.MQTTTopic)
	}
	if cfg.MQTTPassword != "testpass" {
		t.Errorf("MQTTPassword = %s, want testpass", cfg.MQTTPassword)
	}
	if cfg.APIPort != 9090 {
		t.Errorf("APIPort = %d, want 9090", cfg.APIPort)
	}
	if len(cfg.Brokers) != 1 {
		t.Fatalf("Brokers = %d, want 1 (synthesized from single-broker env)", len(cfg.Brokers))
	}
	if cfg.Brokers[0].Broker != "test.broker.com" {
		t.Errorf("Brokers[0].Broker = %s, want test.broker.com", cfg.Brokers[0].Broker)
	}
	if cfg.Brokers[0].Name != "default" {
		t.Errorf("Brokers[0].Name = %s, want default", cfg.Brokers[0].Name)
	}

	os.Unsetenv("MQTT_BROKER")
	os.Unsetenv("MQTT_PORT")
	os.Unsetenv("MQTT_TOPIC")
	os.Unsetenv("MQTT_PASSWORD")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("API_PORT")
}

func TestLoad_MQTTBrokersJSON(t *testing.T) {
	os.Unsetenv("MQTT_BROKER")
	os.Unsetenv("MQTT_PASSWORD")
	jsonCfg := `[{"name":"coreic","broker":"mqtt.coreic.eu","port":8883,"topic":"CARDIMED/EBOS/DEMO_9/#","tls":true,"username":"ebos","password":"secret"},{"name":"local","broker":"mosquitto","port":1883,"topic":"sensors/#","tls":false,"username":"","password":"localpass"}]`
	os.Setenv("MQTT_BROKERS", jsonCfg)
	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-12345")
	defer os.Unsetenv("MQTT_BROKERS")
	defer os.Unsetenv("JWT_SECRET")

	cfg := Load()

	if len(cfg.Brokers) != 2 {
		t.Fatalf("Brokers = %d, want 2", len(cfg.Brokers))
	}
	if cfg.Brokers[0].Name != "coreic" || cfg.Brokers[0].Port != 8883 || !cfg.Brokers[0].TLS {
		t.Errorf("Brokers[0] wrong: %+v", cfg.Brokers[0])
	}
	if cfg.Brokers[1].Name != "local" || cfg.Brokers[1].Port != 1883 || cfg.Brokers[1].TLS {
		t.Errorf("Brokers[1] wrong: %+v", cfg.Brokers[1])
	}
}

func TestLoad_MQTTBrokersJSON_DefaultsFilledIn(t *testing.T) {
	os.Unsetenv("MQTT_BROKER")
	os.Setenv("MQTT_BROKERS", `[{"name":"","broker":"x.example.com","topic":"","tls":true}]`)
	defer os.Unsetenv("MQTT_BROKERS")
	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-12345")
	defer os.Unsetenv("JWT_SECRET")

	cfg := Load()
	if len(cfg.Brokers) != 1 {
		t.Fatalf("Brokers = %d, want 1", len(cfg.Brokers))
	}
	if cfg.Brokers[0].Name == "" {
		t.Error("expected empty name to be filled with a default")
	}
	if cfg.Brokers[0].Topic != "#" {
		t.Errorf("Topic = %s, want #", cfg.Brokers[0].Topic)
	}
	if cfg.Brokers[0].Port != 8883 {
		t.Errorf("Port = %d, want 8883 (TLS default port)", cfg.Brokers[0].Port)
	}
}

func TestLoad_MQTTBrokersJSON_InvalidFallsBack(t *testing.T) {
	os.Unsetenv("MQTT_BROKER")
	os.Setenv("MQTT_BROKER", "fallback.example.com")
	os.Setenv("MQTT_PASSWORD", "fb")
	os.Setenv("MQTT_BROKERS", "not-valid-json")
	defer os.Unsetenv("MQTT_BROKERS")
	defer os.Unsetenv("MQTT_BROKER")
	defer os.Unsetenv("MQTT_PASSWORD")
	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-12345")
	defer os.Unsetenv("JWT_SECRET")

	cfg := Load()
	if len(cfg.Brokers) != 1 || cfg.Brokers[0].Broker != "fallback.example.com" {
		t.Errorf("expected fallback to single-broker config, got %+v", cfg.Brokers)
	}
}

func TestValidate_MissingJWTSecret(t *testing.T) {
	cfg := &Config{JWTSecret: ""}
	err := cfg.Validate()
	if err == nil {
		t.Error("Validate should return error when JWT_SECRET is missing")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("Error should mention JWT_SECRET: %v", err)
	}
}

func TestValidate_ShortJWTSecret(t *testing.T) {
	cfg := &Config{JWTSecret: "short"}
	err := cfg.Validate()
	if err == nil {
		t.Error("Validate should return error when JWT_SECRET is too short")
	}
	if !strings.Contains(err.Error(), "32") {
		t.Errorf("Error should mention 32 characters: %v", err)
	}
}

func TestValidate_OK(t *testing.T) {
	cfg := &Config{JWTSecret: "this-is-a-very-long-secret-key-for-testing-12345"}
	if err := cfg.Validate(); err != nil {
		t.Errorf("Validate should return nil for valid config: %v", err)
	}
}

func TestValidateMQTT_MissingPassword(t *testing.T) {
	cfg := &Config{
		JWTSecret: "this-is-a-very-long-secret-key-for-testing-12345",
		Brokers: []BrokerConfig{{
			Name:     "test",
			Broker:   "broker.example.com",
			Port:     8883,
			Topic:    "#",
			Username: "u",
			Password: "",
			TLS:      true,
		}},
	}
	err := cfg.ValidateMQTT()
	if err == nil {
		t.Error("ValidateMQTT should return error when broker password is missing")
	}
	if !strings.Contains(err.Error(), "password") {
		t.Errorf("Error should mention password: %v", err)
	}
}

func TestValidateMQTT_MissingBroker(t *testing.T) {
	cfg := &Config{
		JWTSecret: "this-is-a-very-long-secret-key-for-testing-12345",
		Brokers:   nil,
	}
	err := cfg.ValidateMQTT()
	if err == nil {
		t.Error("ValidateMQTT should return error when no brokers configured")
	}
	if !strings.Contains(err.Error(), "MQTT_BROKERS") {
		t.Errorf("Error should mention MQTT_BROKERS: %v", err)
	}
}

func TestValidateMQTT_OK(t *testing.T) {
	cfg := &Config{
		JWTSecret: "this-is-a-very-long-secret-key-for-testing-12345",
		Brokers: []BrokerConfig{{
			Name:     "test",
			Broker:   "broker.example.com",
			Port:     8883,
			Topic:    "#",
			Username: "u",
			Password: "p",
			TLS:      true,
		}},
	}
	if err := cfg.ValidateMQTT(); err != nil {
		t.Errorf("ValidateMQTT should return nil for valid config: %v", err)
	}
}

func TestMQTTBrokerAddr(t *testing.T) {
	cfg := &Config{MQTTBroker: "broker.example.com", MQTTPort: 8883, MQTTTLS: true}
	addr := cfg.MQTTBrokerAddr()
	if addr != "ssl://broker.example.com:8883" {
		t.Errorf("MQTTBrokerAddr() = %s, want ssl://broker.example.com:8883", addr)
	}
}

func TestAPIAddr(t *testing.T) {
	cfg := &Config{APIHost: "0.0.0.0", APIPort: 8080}
	addr := cfg.APIAddr()
	if addr != "0.0.0.0:8080" {
		t.Errorf("APIAddr() = %s, want 0.0.0.0:8080", addr)
	}
}
