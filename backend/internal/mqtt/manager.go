package mqtt

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"telemetryhub/internal/config"
)

// BrokerManager owns one Client per configured broker and provides aggregate
// lifecycle and statistics.
type BrokerManager struct {
	brokers []config.BrokerConfig
	clients []*Client
}

// NewBrokerManager creates a manager wrapping one client per broker config.
func NewBrokerManager(brokers []config.BrokerConfig, pool *pgxpool.Pool) (*BrokerManager, error) {
	if len(brokers) == 0 {
		return nil, fmt.Errorf("no brokers configured")
	}

	clients := make([]*Client, 0, len(brokers))
	for _, b := range brokers {
		c, err := NewClient(b, pool)
		if err != nil {
			return nil, fmt.Errorf("create client for broker %q: %w", b.Name, err)
		}
		clients = append(clients, c)
	}
	return &BrokerManager{brokers: brokers, clients: clients}, nil
}

// ConnectAll dials every broker and subscribes. Per-broker failures are
// logged and skipped so a single bad broker cannot block the others. Returns
// the names of brokers that failed to connect.
func (m *BrokerManager) ConnectAll(ctx context.Context) []string {
	if m == nil {
		return nil
	}
	var (
		mu     sync.Mutex
		failed []string
		wg     sync.WaitGroup
	)
	for _, c := range m.clients {
		wg.Add(1)
		go func(client *Client) {
			defer wg.Done()
			if err := client.Connect(ctx); err != nil {
				log.Printf("broker %q connect failed: %v", client.Name(), err)
				mu.Lock()
				failed = append(failed, client.Name())
				mu.Unlock()
				return
			}
			log.Printf("broker %q ready", client.Name())
		}(c)
	}
	wg.Wait()
	return failed
}

// Shutdown disconnects every broker client.
func (m *BrokerManager) Shutdown(ctx context.Context) {
	if m == nil {
		return
	}
	var wg sync.WaitGroup
	for _, c := range m.clients {
		wg.Add(1)
		go func(client *Client) {
			defer wg.Done()
			done := make(chan struct{})
			go func() {
				client.Shutdown(ctx)
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				log.Printf("broker %q shutdown timed out", client.Name())
			}
		}(c)
	}
	wg.Wait()
}

// Stats returns a per-broker statistics snapshot.
func (m *BrokerManager) Stats() []BrokerStats {
	if m == nil {
		return nil
	}
	out := make([]BrokerStats, 0, len(m.clients))
	for _, c := range m.clients {
		out = append(out, c.Stats())
	}
	return out
}

// IsConfigured reports whether at least one broker is configured.
func (m *BrokerManager) IsConfigured() bool {
	return m != nil && len(m.clients) > 0
}

// BrokersConnected returns the number of brokers currently connected.
func (m *BrokerManager) BrokersConnected() int {
	if m == nil {
		return 0
	}
	n := 0
	for _, c := range m.clients {
		if c.IsConnected() {
			n++
		}
	}
	return n
}
