package mqtt

import (
	"container/ring"
	"hash/fnv"
	"sync"
	"time"
)

// dedupEntry stores a hash and its insertion time.
type dedupEntry struct {
	hash uint64
	at   time.Time
}

// Deduplicator tracks recently seen message hashes to detect QoS-1 redelivery.
type Deduplicator struct {
	mu      sync.Mutex
	ring    *ring.Ring
	maxSize int
	ttl     time.Duration
}

// NewDeduplicator creates a deduplicator with the given ring size and TTL.
func NewDeduplicator(maxSize int, ttl time.Duration) *Deduplicator {
	r := ring.New(maxSize)
	// Initialize ring with zero entries
	for i := 0; i < maxSize; i++ {
		r.Value = dedupEntry{}
		r = r.Next()
	}
	return &Deduplicator{
		ring:    r,
		maxSize: maxSize,
		ttl:     ttl,
	}
}

// IsDuplicate checks if the message has been seen recently.
func (d *Deduplicator) IsDuplicate(deviceID string, payload []byte) bool {
	h := fnv.New64a()
	_, _ = h.Write([]byte(deviceID))
	if len(payload) > 100 {
		payload = payload[:100]
	}
	_, _ = h.Write(payload)
	key := h.Sum64()

	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()

	// Scan ring for matching hash within TTL
	start := d.ring
	current := start
	for i := 0; i < d.maxSize; i++ {
		if entry, ok := current.Value.(dedupEntry); ok && entry.hash != 0 {
			if entry.hash == key && now.Sub(entry.at) < d.ttl {
				return true
			}
		}
		current = current.Next()
	}

	// Insert new entry at current position
	d.ring.Value = dedupEntry{hash: key, at: now}
	d.ring = d.ring.Next()

	return false
}

// Reset clears all dedup state (called on reconnect).
func (d *Deduplicator) Reset() {
	d.mu.Lock()
	defer d.mu.Unlock()

	current := d.ring
	for i := 0; i < d.maxSize; i++ {
		current.Value = dedupEntry{}
		current = current.Next()
	}
}
