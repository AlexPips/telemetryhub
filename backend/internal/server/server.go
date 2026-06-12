package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"telemetryhub/internal/auth"
	"telemetryhub/internal/config"
	"telemetryhub/internal/handlers"
	ocmw "telemetryhub/internal/middleware"
	"telemetryhub/internal/mqtt"

	_ "telemetryhub/docs"

	echoSwagger "github.com/swaggo/echo-swagger"
)

// Server represents the API server.
type Server struct {
	echo    *echo.Echo
	pool    *pgxpool.Pool
	cfg     *config.Config
	authH   *auth.Handler
	devH    *handlers.DeviceHandler
	readH   *handlers.ReadingHandler
	renameH *handlers.RenameHandler
	mqttMgr *mqtt.BrokerManager
}

// New creates a new API server with all routes configured.
// mqttMgr may be nil (MQTT is optional).
func New(cfg *config.Config, pool *pgxpool.Pool, mqttMgr *mqtt.BrokerManager) (*Server, error) {
	e := echo.New()
	e.HideBanner = true

	// Global middleware
	e.Use(middleware.Recover())
	e.Use(middleware.Logger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{cfg.FrontendURL},
		AllowHeaders: []string{echo.HeaderAuthorization, echo.HeaderContentType},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
	}))

	// Auth handler
	authH := auth.NewHandler(pool, cfg.JWTSecret, cfg.SessionExpiry)

	// Store adapter for handlers
	store := NewStoreAdapter(pool)

	// Handlers
	devH := handlers.NewDeviceHandler(store)
	readH := handlers.NewReadingHandler(store)
	renameH := handlers.NewRenameHandler(store)

	s := &Server{
		echo:    e,
		pool:    pool,
		cfg:     cfg,
		authH:   authH,
		devH:    devH,
		readH:   readH,
		renameH: renameH,
		mqttMgr: mqttMgr,
	}

	s.setupRoutes()
	return s, nil
}

func (s *Server) setupRoutes() {
	e := s.echo

	// Public endpoints (no auth)
	e.POST("/api/v1/auth/login", s.authH.Login)
	e.POST("/api/v1/auth/register", s.authH.RegisterPublic)
	e.GET("/api/v1/health", s.healthHandler)
	e.GET("/swagger/*", echoSwagger.WrapHandler)

	// API v1 group
	v1 := e.Group("/api/v1")

	// Auth-protected routes
	authGroup := v1.Group("", ocmw.JWTAuth(s.cfg.JWTSecret))

	// Auth endpoints
	authGroup.POST("/auth/logout", s.authH.Logout)
	authGroup.GET("/auth/me", s.authH.Me)
	authGroup.POST("/auth/change-password", s.authH.ChangePassword)

	// Device endpoints
	authGroup.GET("/devices", s.devH.ListDevices)
	authGroup.GET("/devices/:id", s.devH.GetDevice)
	authGroup.GET("/devices/:id/fields", s.devH.GetDeviceFields)
	authGroup.GET("/devices/:id/readings", s.readH.GetReadings)

	// Admin endpoints (admin only)
	adminGroup := authGroup.Group("", ocmw.RequireRole("admin"))
	adminGroup.PUT("/devices/:id", s.devH.UpdateDevice)
	adminGroup.DELETE("/devices/:id", s.devH.DeleteDevice)

	// Field rename endpoints
	adminGroup.POST("/devices/:id/renames", s.renameH.CreateRename)
	adminGroup.GET("/devices/:id/renames", s.renameH.ListRenames)
	adminGroup.PUT("/devices/:id/renames/:field", s.renameH.UpdateRename)
	adminGroup.DELETE("/devices/:id/renames/:field", s.renameH.DeleteRename)

	// Broker status (admin)
	adminGroup.GET("/brokers", s.listBrokers)
}

// Start starts the HTTP server.
func (s *Server) Start(addr string) error {
	return s.echo.Start(addr)
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) {
	if err := s.echo.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
}

// healthHandler  Health check
// @Summary      Health check
// @Description  Returns the API server health status, uptime, MQTT connection status, and current timestamp.
// @Tags         system
// @Produce      json
// @Success      200 {object} map[string]interface{}
// @Router       /health [get]
func (s *Server) healthHandler(c echo.Context) error {
	mqttStatus := map[string]interface{}{
		"configured":        false,
		"brokers_total":     0,
		"brokers_connected": 0,
	}
	if s.mqttMgr != nil && s.mqttMgr.IsConfigured() {
		stats := s.mqttMgr.Stats()
		mqttStatus = map[string]interface{}{
			"configured":        true,
			"brokers_total":     len(stats),
			"brokers_connected": s.mqttMgr.BrokersConnected(),
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"uptime":    time.Since(startTime).String(),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"mqtt":      mqttStatus,
	})
}

// listBrokers returns per-broker runtime statistics.
// @Summary      List MQTT brokers
// @Description  Returns runtime statistics for every configured MQTT broker (admin only).
// @Tags         admin
// @Produce      json
// @Success      200 {array} mqtt.BrokerStats
// @Router       /brokers [get]
func (s *Server) listBrokers(c echo.Context) error {
	if s.mqttMgr == nil {
		return c.JSON(http.StatusOK, []mqtt.BrokerStats{})
	}
	return c.JSON(http.StatusOK, s.mqttMgr.Stats())
}

var startTime = time.Now()

// SeedAdmin creates an admin user if one doesn't exist.
func SeedAdmin(pool *pgxpool.Pool, email, password string) error {
	if email == "" || password == "" {
		return fmt.Errorf("admin email and password required")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	_, err = pool.Exec(context.Background(), `
		INSERT INTO users (email, password_hash, role)
		VALUES ($1, $2, 'admin')
		ON CONFLICT (email) DO NOTHING
	`, email, hash)
	return err
}
