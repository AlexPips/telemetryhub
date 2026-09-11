package server

import (
	"strings"
	"sync"
	"time"

	"telemetryhub/internal/handlers"
)

const readingsCacheMaxEntries = 512

type readingCacheEntry struct {
	results  []handlers.ReadingResult
	inserted time.Time
}

// readingsCache is a small TTL cache for downsampled readings responses.
// Guards a map with a mutex; evicts expired entries on write and drops the
// oldest entry when over cap. ttl=0 disables storage entirely.
type readingsCache struct {
	mu      sync.Mutex
	ttl     time.Duration
	max     int
	entries map[string]readingCacheEntry
}

func newReadingsCache(ttl time.Duration, maxEntries int) *readingsCache {
	return &readingsCache{
		ttl:     ttl,
		max:     maxEntries,
		entries: make(map[string]readingCacheEntry),
	}
}

// key builds a cache key. from/to are truncated to the minute so dashboard
// polls with slightly shifting now-based timestamps share entries.
func (c *readingsCache) key(deviceID string, fields []string, from, to time.Time) string {
	return deviceID + "\x00" + strings.Join(fields, ",") + "\x00" +
		from.Truncate(time.Minute).UTC().Format(time.RFC3339) + "\x00" +
		to.Truncate(time.Minute).UTC().Format(time.RFC3339)
}

func (c *readingsCache) get(k string) ([]handlers.ReadingResult, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[k]
	if !ok {
		return nil, false
	}
	if time.Since(e.inserted) > c.ttl {
		delete(c.entries, k)
		return nil, false
	}
	return e.results, true
}

func (c *readingsCache) set(k string, results []handlers.ReadingResult) {
	if c.ttl <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for kk, e := range c.entries {
		if now.Sub(e.inserted) > c.ttl {
			delete(c.entries, kk)
		}
	}
	if len(c.entries) >= c.max {
		var oldestKey string
		var oldest time.Time
		first := true
		for kk, e := range c.entries {
			if first || e.inserted.Before(oldest) {
				oldestKey, oldest, first = kk, e.inserted, false
			}
		}
		delete(c.entries, oldestKey)
	}
	c.entries[k] = readingCacheEntry{results: results, inserted: now}
}