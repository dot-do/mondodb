package mongo

import (
	"context"
	"fmt"
	"net/url"
	"sync"
	"time"

	"go.rpc.do"
)

// RPCClient defines the interface for the underlying RPC client.
// This allows for mocking in tests.
type RPCClient interface {
	Call(method string, args ...any) RPCPromise
	Close() error
	IsConnected() bool
}

// RPCPromise defines the interface for RPC promises.
type RPCPromise interface {
	Await() (any, error)
}

// Client represents a MongoDB client connection.
type Client struct {
	mu           sync.RWMutex
	rpcClient    RPCClient
	uri          string
	connected    bool
	databases    map[string]*Database
	timeout      time.Duration
	ctx          context.Context
	cancel       context.CancelFunc
}

// ClientOptions configures the client.
type ClientOptions struct {
	Timeout         time.Duration
	MaxPoolSize     uint64
	MinPoolSize     uint64
	MaxConnIdleTime time.Duration
	AppName         string
}

// DefaultClientOptions returns the default client options.
func DefaultClientOptions() *ClientOptions {
	return &ClientOptions{
		Timeout:         30 * time.Second,
		MaxPoolSize:     100,
		MinPoolSize:     0,
		MaxConnIdleTime: 0,
	}
}

// SetTimeout sets the operation timeout.
func (o *ClientOptions) SetTimeout(d time.Duration) *ClientOptions {
	o.Timeout = d
	return o
}

// SetMaxPoolSize sets the maximum connection pool size.
func (o *ClientOptions) SetMaxPoolSize(size uint64) *ClientOptions {
	o.MaxPoolSize = size
	return o
}

// SetMinPoolSize sets the minimum connection pool size.
func (o *ClientOptions) SetMinPoolSize(size uint64) *ClientOptions {
	o.MinPoolSize = size
	return o
}

// SetMaxConnIdleTime sets the maximum connection idle time.
func (o *ClientOptions) SetMaxConnIdleTime(d time.Duration) *ClientOptions {
	o.MaxConnIdleTime = d
	return o
}

// SetAppName sets the application name.
func (o *ClientOptions) SetAppName(name string) *ClientOptions {
	o.AppName = name
	return o
}

// NewClient creates a new MongoDB client.
// The URI should be a mongodb:// or mongodb+srv:// URI.
//
// Example:
//
//	client, err := mongo.NewClient(ctx, "mongodb://localhost:27017")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Disconnect(ctx)
func NewClient(ctx context.Context, uri string, opts ...*ClientOptions) (*Client, error) {
	// Validate URI
	if uri == "" {
		return nil, ErrInvalidURI
	}

	parsedURI, err := url.Parse(uri)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURI, err)
	}

	// Accept mongodb://, mongodb+srv://, http://, https://, ws://, wss://
	switch parsedURI.Scheme {
	case "mongodb", "mongodb+srv", "http", "https", "ws", "wss":
		// Valid schemes
	default:
		return nil, fmt.Errorf("%w: unsupported scheme %s", ErrInvalidURI, parsedURI.Scheme)
	}

	// Apply options
	options := DefaultClientOptions()
	for _, opt := range opts {
		if opt != nil {
			if opt.Timeout > 0 {
				options.Timeout = opt.Timeout
			}
			if opt.MaxPoolSize > 0 {
				options.MaxPoolSize = opt.MaxPoolSize
			}
			if opt.MinPoolSize > 0 {
				options.MinPoolSize = opt.MinPoolSize
			}
			if opt.MaxConnIdleTime > 0 {
				options.MaxConnIdleTime = opt.MaxConnIdleTime
			}
			if opt.AppName != "" {
				options.AppName = opt.AppName
			}
		}
	}

	// Convert URI for RPC client
	rpcURI := convertToRPCURI(uri)

	// Create RPC client
	rpcClient, err := rpc.ConnectContext(ctx, rpcURI, rpc.WithTimeout(options.Timeout))
	if err != nil {
		return nil, &ConnectionError{Address: uri, Wrapped: err}
	}

	clientCtx, cancel := context.WithCancel(ctx)

	return &Client{
		rpcClient: &rpcClientWrapper{client: rpcClient},
		uri:       uri,
		connected: true,
		databases: make(map[string]*Database),
		timeout:   options.Timeout,
		ctx:       clientCtx,
		cancel:    cancel,
	}, nil
}

// newClientWithRPC creates a client with a custom RPC client (for testing).
func newClientWithRPC(rpcClient RPCClient, uri string) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{
		rpcClient: rpcClient,
		uri:       uri,
		connected: true,
		databases: make(map[string]*Database),
		timeout:   30 * time.Second,
		ctx:       ctx,
		cancel:    cancel,
	}
}

// convertToRPCURI converts a MongoDB URI to an RPC-compatible URI.
func convertToRPCURI(uri string) string {
	parsedURI, err := url.Parse(uri)
	if err != nil {
		return uri
	}

	switch parsedURI.Scheme {
	case "mongodb", "mongodb+srv":
		parsedURI.Scheme = "wss"
	}

	return parsedURI.String()
}

// rpcClientWrapper wraps the rpc.Client to implement RPCClient interface.
type rpcClientWrapper struct {
	client *rpc.Client
}

func (w *rpcClientWrapper) Call(method string, args ...any) RPCPromise {
	return w.client.Call(method, args...)
}

func (w *rpcClientWrapper) Close() error {
	return w.client.Close()
}

func (w *rpcClientWrapper) IsConnected() bool {
	return w.client.IsConnected()
}

// Connect establishes the connection to the server.
// This is a no-op if already connected via NewClient.
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		return nil
	}

	// Check if RPC client is connected
	if c.rpcClient != nil && c.rpcClient.IsConnected() {
		c.connected = true
		return nil
	}

	return ErrClientDisconnected
}

// Disconnect closes the connection to the server.
func (c *Client) Disconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return nil
	}

	c.connected = false
	c.cancel()

	if c.rpcClient != nil {
		return c.rpcClient.Close()
	}

	return nil
}

// Database returns a handle for the specified database.
func (c *Client) Database(name string) *Database {
	c.mu.Lock()
	defer c.mu.Unlock()

	if db, ok := c.databases[name]; ok {
		return db
	}

	db := &Database{
		client:      c,
		name:        name,
		collections: make(map[string]*Collection),
	}
	c.databases[name] = db

	return db
}

// ListDatabaseNames returns the names of all databases.
func (c *Client) ListDatabaseNames(ctx context.Context) ([]string, error) {
	c.mu.RLock()
	connected := c.connected
	rpcClient := c.rpcClient
	c.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.listDatabases")
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse result
	if names, ok := result.([]any); ok {
		result := make([]string, len(names))
		for i, name := range names {
			if s, ok := name.(string); ok {
				result[i] = s
			}
		}
		return result, nil
	}

	return nil, fmt.Errorf("unexpected result type: %T", result)
}

// Ping verifies the connection to the server.
func (c *Client) Ping(ctx context.Context) error {
	c.mu.RLock()
	connected := c.connected
	rpcClient := c.rpcClient
	c.mu.RUnlock()

	if !connected {
		return ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.ping")
	_, err := promise.Await()
	return err
}

// StartSession starts a new session (for future transaction support).
func (c *Client) StartSession() (*Session, error) {
	c.mu.RLock()
	connected := c.connected
	c.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	return &Session{client: c}, nil
}

// Session represents a MongoDB session.
type Session struct {
	client *Client
}

// EndSession ends the session.
func (s *Session) EndSession(ctx context.Context) {
	// No-op for now
}

// WithTransaction runs a function within a transaction.
func (s *Session) WithTransaction(ctx context.Context, fn func(ctx context.Context) (any, error)) (any, error) {
	// For now, just execute without transaction support
	return fn(ctx)
}

// NumberLong represents a 64-bit integer.
type NumberLong int64

// NumberInt represents a 32-bit integer.
type NumberInt int32

// NumberDouble represents a 64-bit floating point number.
type NumberDouble float64
