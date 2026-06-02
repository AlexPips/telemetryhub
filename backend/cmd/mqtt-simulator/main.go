package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// getEnvDefault returns the env var value or a fallback default.
func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Payload presets with realistic sensor data.
var presets = map[string]func(deviceID string) map[string]interface{}{
	"cardimed_9_1": cardimed91Payload,
	"cardimed_9_3": cardimed93Payload,
	"cirocco_gw":   ciroccoGatewayPayload,
	"cirocco_node": ciroccoNodePayload,
	"shelly3em":    shelly3EMPayload,
	"unknown":      unknownPayload,
}

var deviceIDs = map[string][]string{
	"cardimed_9_1": {"7D707D", "467066", "467053"},
	"cardimed_9_3": {"8A1B2C", "9D3E4F"},
	"cirocco_gw":   {"GW001", "GW002"},
	"cirocco_node": {"NODE01", "NODE02", "NODE03"},
	"shelly3em":    {"SHELLY_AABBCC", "SHELLY_DDEEFF"},
	"unknown":      {"TEST01"},
}

func main() {
	broker := flag.String("broker", getEnvDefault("MQTT_BROKER", "localhost:1883"), "MQTT broker address (or $MQTT_BROKER)")
	port := flag.String("port", getEnvDefault("MQTT_PORT", "1883"), "MQTT broker port")
	topic := flag.String("topic", getEnvDefault("SIM_TOPIC", "CARDIMED/EBOS/DEMO_9/"), "MQTT topic prefix (or $SIM_TOPIC)")
	format := flag.String("format", getEnvDefault("SIM_FORMAT", "all"), "Payload format: cardimed_9_1, cardimed_9_3, cirocco_gw, cirocco_node, shelly3em, unknown, all")
	interval := flag.Duration("interval", 10*time.Second, "Publish interval (or $SIM_INTERVAL)")
	devices := flag.Int("devices", 0, "Number of devices per format (0 = all)")
	flag.Parse()

	// Allow interval override via env
	if envInterval := os.Getenv("SIM_INTERVAL"); envInterval != "" {
		if d, err := time.ParseDuration(envInterval); err == nil {
			*interval = d
		}
	}

	addr := fmt.Sprintf("%s:%s", *broker, *port)
	opts := mqtt.NewClientOptions()
	opts.AddBroker(addr)
	opts.SetClientID("telemetryhub-simulator")
	opts.SetAutoReconnect(true)
	opts.SetConnectionLostHandler(func(c mqtt.Client, err error) {
		log.Printf("Connection lost: %v", err)
	})
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Println("Connected to MQTT broker")
	})

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to connect to MQTT: %v", token.Error())
	}
	defer client.Disconnect(1000)

	// Determine formats to use
	formats := []string{*format}
	if *format == "all" {
		formats = []string{"cardimed_9_1", "cardimed_9_3", "cirocco_gw", "cirocco_node", "shelly3em", "unknown"}
	}

	log.Printf("Starting simulator: addr=%s formats=%v interval=%v topic=%s", addr, formats, *interval, *topic)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	seq := 0
	for {
		select {
		case <-sigCh:
			log.Println("Shutting down simulator...")
			return
		case <-ticker.C:
			for _, f := range formats {
				generator, ok := presets[f]
				if !ok {
					log.Printf("Unknown format: %s", f)
					continue
				}

				ids := deviceIDs[f]
				count := *devices
				if count == 0 || count > len(ids) {
					count = len(ids)
				}

				for i := 0; i < count; i++ {
					payload := generator(ids[i])
					payload["time"] = seq * 15
					data, _ := json.Marshal(payload)

					pubTopic := fmt.Sprintf("%s%s/%s", *topic, f, ids[i])
					token := client.Publish(pubTopic, 1, false, data)
					token.Wait()
					log.Printf("Published to %s: %s", pubTopic, string(data))
				}
			}
			seq++
		}
	}
}

// cardimed91Payload generates a CARDIMED 9.1 payload with environmental readings.
func cardimed91Payload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return map[string]interface{}{
		"ID":           deviceID,
		"d9.1_tmp_0":   20.0 + rng.Float64()*10.0,
		"d9.1_hum_0":   40.0 + rng.Float64()*40.0,
		"d9.1_CO2_0":   400.0 + rng.Float64()*400.0,
		"d9.1_bat":     3.0 + rng.Float64()*0.6,
		"d9.1_PM1_0":   5.0 + rng.Float64()*20.0,
		"d9.1_PM2_5_0": 3.0 + rng.Float64()*15.0,
		"d9.1_PM10_0":  2.0 + rng.Float64()*10.0,
	}
}

// cardimed93Payload generates a CARDIMED 9.3 payload with BME + SCD + wind.
func cardimed93Payload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return map[string]interface{}{
		"ID":                    deviceID,
		"d9.3_tmp_sour_001_0":   20.0 + rng.Float64()*10.0,
		"d9.3_CO2_api_001_0":    400.0 + rng.Float64()*400.0,
		"BMEG0":                 100000.0 + rng.Float64()*2000.0,
		"BMEH0":                 40.0 + rng.Float64()*40.0,
		"BMET0":                 20.0 + rng.Float64()*10.0,
		"SCDC0":                 400.0 + rng.Float64()*400.0,
		"WS_m/s_0":              rng.Float64() * 10.0,
		"Bat":                   3.0 + rng.Float64()*0.6,
	}
}

func ciroccoGatewayPayload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return map[string]interface{}{
		"ID":       deviceID,
		"BMET0":    20.0 + rng.Float64()*10.0,
		"BMEH0":    40.0 + rng.Float64()*40.0,
		"SCDC0":    400.0 + rng.Float64()*400.0,
		"WS_m/s_0": rng.Float64() * 10.0,
		"Bat":      3.0 + rng.Float64()*0.6,
	}
}

func ciroccoNodePayload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return map[string]interface{}{
		"ID":        deviceID,
		"BMET0":     20.0 + rng.Float64()*10.0,
		"BMEH0":     40.0 + rng.Float64()*40.0,
		"SCDC0":     400.0 + rng.Float64()*400.0,
		"WS_m/s_0":  rng.Float64() * 10.0,
		"Bat":       3.0 + rng.Float64()*0.6,
		"LoRa_SYN":  1,
		"LoRa_ACK":  1,
	}
}

// shelly3EMPayload generates a Shelly Pro 3EM energy meter payload.
// Expected to arrive on /events subtopic with total energy and per-phase power readings.
func shelly3EMPayload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	basePower := 500.0 + rng.Float64()*2000.0 // 500-2500W base load
	return map[string]interface{}{
		"ID":              deviceID,
		"total_energy":    12345.6 + rng.Float64()*100.0, // kWh
		"power_total":     basePower,
		"power_a":         basePower * 0.4,
		"power_b":         basePower * 0.35,
		"power_c":         basePower * 0.25,
		"voltage_a":       230.0 + rng.Float64()*5.0,
		"voltage_b":       230.0 + rng.Float64()*5.0,
		"voltage_c":       230.0 + rng.Float64()*5.0,
		"current_a":       1.0 + rng.Float64()*8.0,
		"current_b":       1.0 + rng.Float64()*6.0,
		"current_c":       0.5 + rng.Float64()*4.0,
		"pf_total":        0.85 + rng.Float64()*0.15, // power factor 0.85-1.0
		"temperature":     35.0 + rng.Float64()*15.0,
	}
}

func unknownPayload(deviceID string) map[string]interface{} {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return map[string]interface{}{
		"ID":              deviceID,
		"random_field_X":  rng.Float64() * 100.0,
		"test1":           25.0 + rng.Float64()*5.0,
		"weird_sensor":    rng.Float64() * 50.0,
	}
}
