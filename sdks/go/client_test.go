package mongo

import (
	"context"
	"errors"
	"testing"
	"time"
)

// mockPromise implements RPCPromise for testing.
type mockPromise struct {
	result any
	err    error
}

func (p *mockPromise) Await() (any, error) {
	return p.result, p.err
}

// mockRPCClient implements RPCClient for testing.
type mockRPCClient struct {
	connected bool
	calls     []mockCall
	callIndex int
}

type mockCall struct {
	method string
	args   []any
	result any
	err    error
}

func newMockRPCClient() *mockRPCClient {
	return &mockRPCClient{
		connected: true,
		calls:     []mockCall{},
		callIndex: 0,
	}
}

func (m *mockRPCClient) addCall(method string, result any, err error) {
	m.calls = append(m.calls, mockCall{
		method: method,
		result: result,
		err:    err,
	})
}

func (m *mockRPCClient) Call(method string, args ...any) RPCPromise {
	if m.callIndex >= len(m.calls) {
		return &mockPromise{err: errors.New("unexpected call: " + method)}
	}

	call := m.calls[m.callIndex]
	m.callIndex++

	return &mockPromise{
		result: call.result,
		err:    call.err,
	}
}

func (m *mockRPCClient) Close() error {
	m.connected = false
	return nil
}

func (m *mockRPCClient) IsConnected() bool {
	return m.connected
}

// TestNewClientWithRPC tests creating a client with a mock RPC client.
func TestNewClientWithRPC(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	if client == nil {
		t.Fatal("expected client, got nil")
	}

	if client.uri != "mongodb://localhost:27017" {
		t.Errorf("expected uri mongodb://localhost:27017, got %s", client.uri)
	}

	if !client.connected {
		t.Error("expected client to be connected")
	}
}

// TestClientDatabase tests getting a database handle.
func TestClientDatabase(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")

	if db == nil {
		t.Fatal("expected database, got nil")
	}

	if db.Name() != "testdb" {
		t.Errorf("expected name testdb, got %s", db.Name())
	}

	// Getting the same database should return the same instance
	db2 := client.Database("testdb")
	if db != db2 {
		t.Error("expected same database instance")
	}
}

// TestClientDisconnect tests disconnecting a client.
func TestClientDisconnect(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx := context.Background()
	err := client.Disconnect(ctx)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if client.connected {
		t.Error("expected client to be disconnected")
	}

	// Disconnecting again should be a no-op
	err = client.Disconnect(ctx)
	if err != nil {
		t.Errorf("unexpected error on second disconnect: %v", err)
	}
}

// TestClientConnect tests connecting a client.
func TestClientConnect(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx := context.Background()

	// Already connected, should be no-op
	err := client.Connect(ctx)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Disconnect and reconnect
	client.Disconnect(ctx)
	err = client.Connect(ctx)

	// Should fail because mock is not connected after disconnect
	if err == nil {
		t.Error("expected error after disconnect")
	}
}

// TestClientPing tests pinging the server.
func TestClientPing(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.ping", "pong", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	err := client.Ping(ctx)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestClientPingDisconnected tests pinging when disconnected.
func TestClientPingDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx := context.Background()
	client.Disconnect(ctx)

	err := client.Ping(ctx)
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestClientPingContextCanceled tests pinging with a canceled context.
func TestClientPingContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := client.Ping(ctx)
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestClientListDatabaseNames tests listing database names.
func TestClientListDatabaseNames(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.listDatabases", []any{"db1", "db2", "db3"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	names, err := client.ListDatabaseNames(ctx)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(names) != 3 {
		t.Errorf("expected 3 names, got %d", len(names))
	}

	if names[0] != "db1" {
		t.Errorf("expected db1, got %s", names[0])
	}
}

// TestClientListDatabaseNamesDisconnected tests listing databases when disconnected.
func TestClientListDatabaseNamesDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx := context.Background()
	client.Disconnect(ctx)

	_, err := client.ListDatabaseNames(ctx)
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestClientListDatabaseNamesContextCanceled tests with canceled context.
func TestClientListDatabaseNamesContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.ListDatabaseNames(ctx)
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestClientListDatabaseNamesUnexpectedResult tests with unexpected result type.
func TestClientListDatabaseNamesUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.listDatabases", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	_, err := client.ListDatabaseNames(ctx)
	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestClientStartSession tests starting a session.
func TestClientStartSession(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	session, err := client.StartSession()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if session == nil {
		t.Fatal("expected session, got nil")
	}

	if session.client != client {
		t.Error("expected session to have same client")
	}

	// End session (no-op)
	session.EndSession(context.Background())
}

// TestClientStartSessionDisconnected tests starting a session when disconnected.
func TestClientStartSessionDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx := context.Background()
	client.Disconnect(ctx)

	_, err := client.StartSession()
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestSessionWithTransaction tests running a function within a transaction.
func TestSessionWithTransaction(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	session, _ := client.StartSession()
	ctx := context.Background()

	result, err := session.WithTransaction(ctx, func(ctx context.Context) (any, error) {
		return "result", nil
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result != "result" {
		t.Errorf("expected result, got %v", result)
	}
}

// TestClientOptions tests client options.
func TestClientOptions(t *testing.T) {
	opts := DefaultClientOptions()

	if opts.Timeout != 30*time.Second {
		t.Errorf("expected 30s timeout, got %v", opts.Timeout)
	}

	opts.SetTimeout(60 * time.Second)
	if opts.Timeout != 60*time.Second {
		t.Errorf("expected 60s timeout, got %v", opts.Timeout)
	}

	opts.SetMaxPoolSize(200)
	if opts.MaxPoolSize != 200 {
		t.Errorf("expected 200 max pool size, got %d", opts.MaxPoolSize)
	}

	opts.SetMinPoolSize(10)
	if opts.MinPoolSize != 10 {
		t.Errorf("expected 10 min pool size, got %d", opts.MinPoolSize)
	}

	opts.SetMaxConnIdleTime(5 * time.Minute)
	if opts.MaxConnIdleTime != 5*time.Minute {
		t.Errorf("expected 5m max conn idle time, got %v", opts.MaxConnIdleTime)
	}

	opts.SetAppName("testapp")
	if opts.AppName != "testapp" {
		t.Errorf("expected testapp, got %s", opts.AppName)
	}
}

// TestConvertToRPCURI tests URI conversion.
func TestConvertToRPCURI(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"mongodb://localhost:27017", "wss://localhost:27017"},
		{"mongodb+srv://cluster.mongodb.net", "wss://cluster.mongodb.net"},
		{"https://api.example.com", "https://api.example.com"},
		{"wss://api.example.com", "wss://api.example.com"},
	}

	for _, tt := range tests {
		result := convertToRPCURI(tt.input)
		if result != tt.expected {
			t.Errorf("convertToRPCURI(%q) = %q, expected %q", tt.input, result, tt.expected)
		}
	}
}

// TestConvertToRPCURIInvalid tests URI conversion with invalid URI.
func TestConvertToRPCURIInvalid(t *testing.T) {
	// Invalid URIs should return unchanged
	result := convertToRPCURI("://invalid")
	if result != "://invalid" {
		t.Errorf("expected unchanged invalid URI, got %s", result)
	}
}

// TestNumberTypes tests number type aliases.
func TestNumberTypes(t *testing.T) {
	var nl NumberLong = 123456789
	var ni NumberInt = 12345
	var nd NumberDouble = 123.456

	if int64(nl) != 123456789 {
		t.Errorf("NumberLong conversion failed")
	}

	if int32(ni) != 12345 {
		t.Errorf("NumberInt conversion failed")
	}

	if float64(nd) != 123.456 {
		t.Errorf("NumberDouble conversion failed")
	}
}
