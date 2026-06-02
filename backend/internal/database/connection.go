package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect creates a pgx connection pool with the given database URL.
func Connect(ctx context.Context, databaseURL string, minConns, maxConns int32) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	config.MinConns = minConns
	config.MaxConns = maxConns
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 15 * time.Minute
	config.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// ConnectWithRetry attempts to connect with exponential backoff.
func ConnectWithRetry(ctx context.Context, databaseURL string, minConns, maxConns int32, maxAttempts int) (*pgxpool.Pool, error) {
	var pool *pgxpool.Pool
	var err error

	for i := 1; i <= maxAttempts; i++ {
		pool, err = Connect(ctx, databaseURL, minConns, maxConns)
		if err == nil {
			return pool, nil
		}

		if i < maxAttempts {
			wait := time.Duration(i) * 2 * time.Second
			fmt.Printf("Database connection attempt %d/%d failed: %v. Retrying in %v...\n", i, maxAttempts, err, wait)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(wait):
			}
		}
	}

	return nil, fmt.Errorf("failed to connect after %d attempts: %w", maxAttempts, err)
}

// Close gracefully closes the connection pool.
func Close(pool *pgxpool.Pool) {
	if pool != nil {
		pool.Close()
	}
}
