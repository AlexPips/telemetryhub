// @title           TelemetryHub API
// @version         1.0
// @description     Real-time multi-broker MQTT sensor dashboard with JWT authentication. Provides device management, sensor readings with TimescaleDB downsampling, and field rename configuration.
// @termsOfService  https://telemetryhub.local/terms

// @contact.name   API Support
// @contact.email  admin@telemetryhub.local

// @license.name  MIT
// @license.url   https://opensource.org/licenses/MIT

// @BasePath  /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description JWT Bearer token obtained from /auth/login
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"telemetryhub/internal/config"
	"telemetryhub/internal/database"
	"telemetryhub/internal/mqtt"
	"telemetryhub/internal/server"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Config validation failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Println("Starting API Server...")

	// Connect to database with retry
	pool, err := database.ConnectWithRetry(ctx, cfg.DatabaseURL, cfg.DBMinConns, cfg.DBMaxConns, 3)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close(pool)
	log.Println("Database connected")

	// Run migrations
	if err := database.RunMigrations(cfg.DatabaseURL, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Migrations applied")

	// Seed admin user if configured
	if cfg.AdminPassword != "" {
		if err := server.SeedAdmin(pool, cfg.AdminEmail, cfg.AdminPassword); err != nil {
			log.Printf("Warning: failed to seed admin user: %v", err)
		} else {
			log.Println("Admin user seeded")
		}
	}

	// Create optional MQTT broker manager (runs in background, only if at least
	// one broker is configured).
	var mqttMgr *mqtt.BrokerManager
	if len(cfg.Brokers) > 0 {
		var err error
		mqttMgr, err = mqtt.NewBrokerManager(cfg.Brokers, pool)
		if err != nil {
			log.Fatalf("Failed to create MQTT broker manager: %v", err)
		}

		go func() {
			// Retry loop — broker(s) might not be ready yet
			for attempt := 1; attempt <= 10; attempt++ {
				failed := mqttMgr.ConnectAll(ctx)
				if len(failed) < len(cfg.Brokers) {
					log.Printf("MQTT: %d/%d broker(s) connected", len(cfg.Brokers)-len(failed), len(cfg.Brokers))
					return
				}
				log.Printf("MQTT: all %d broker(s) failed to connect (attempt %d/10): %v", len(cfg.Brokers), attempt, failed)
				time.Sleep(5 * time.Second)
			}
			log.Println("MQTT: all connect attempts exhausted, running without MQTT")
		}()
	} else {
		log.Println("MQTT not configured — skipping (set MQTT_BROKERS or MQTT_BROKER)")
	}

	// Create and start API server (pass MQTT manager for health stats)
	srv, err := server.New(cfg, pool, mqttMgr)
	if err != nil {
		log.Fatalf("Failed to create API server: %v", err)
	}

	go func() {
		if err := srv.Start(cfg.APIAddr()); err != nil {
			log.Fatalf("API server error: %v", err)
		}
	}()
	log.Printf("API Server listening on %s", cfg.APIAddr())

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	// Graceful shutdown
	if mqttMgr != nil {
		mqttMgr.Shutdown(ctx)
	}
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
	cancel()
	log.Println("API Server stopped")
}
