# frozen_string_literal: true

require 'json'
require 'socket'
require 'openssl'
require 'securerandom'
require 'base64'
require 'digest'
require 'timeout'

module Mongo
  # WebSocket RPC Transport for Mongo.do
  #
  # Connects to the Mongo.do service using WebSocket for real-time RPC calls
  # with support for pipelining, change streams, and bidirectional communication.
  #
  # @example Basic usage
  #   transport = MongoDo::WebSocketRpcTransport.new('wss://mongo.do')
  #   transport.call('insertOne', 'mydb', 'users', { name: 'John' })
  #   transport.close
  #
  # @example With pipelining
  #   transport = MongoDo::WebSocketRpcTransport.new('wss://mongo.do')
  #   # All calls are pipelined automatically
  #   result = transport.call('find', 'mydb', 'users', { status: 'active' })
  #
  class WebSocketRpcTransport
    include RpcTransport

    WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
    DEFAULT_TIMEOUT = 30
    DEFAULT_CONNECT_TIMEOUT = 10

    attr_reader :uri, :options

    # Create a new WebSocket RPC transport
    # @param url [String] WebSocket URL for the Mongo.do service
    # @param options [Hash] Transport options
    # @option options [String] :token Authentication token
    # @option options [Integer] :timeout Request timeout in seconds
    # @option options [Integer] :connect_timeout Connection timeout
    # @option options [Boolean] :auto_reconnect Enable auto-reconnect
    # @option options [Integer] :max_reconnects Maximum reconnection attempts
    # @option options [Hash] :headers Additional headers
    def initialize(url, options = {})
      @uri = build_uri(url)
      @options = options
      @token = options[:token]
      @timeout = options[:timeout] || DEFAULT_TIMEOUT
      @connect_timeout = options[:connect_timeout] || DEFAULT_CONNECT_TIMEOUT
      @auto_reconnect = options[:auto_reconnect] || false
      @max_reconnects = options[:max_reconnects] || 3
      @headers = options[:headers] || {}

      @closed = false
      @socket = nil
      @connected = false
      @mutex = Mutex.new
      @pending = {}
      @next_id = 0
      @receive_thread = nil
    end

    # Connect to the WebSocket server
    # @return [self]
    def connect
      return self if @connected

      @mutex.synchronize do
        return self if @connected

        establish_connection
        start_receive_thread
        @connected = true
      end

      self
    end

    # Make an RPC call
    # @param method [String] Method name
    # @param args [Array] Method arguments
    # @return [Object] Result from the RPC call
    def call(method, *args)
      raise TransportClosedError if @closed

      connect unless @connected

      id = next_id
      request = build_request(id, method, args)

      # Create a waiter for this request
      waiter = create_waiter(id)

      # Send the request
      send_message(request)

      # Wait for the response
      wait_for_response(id, waiter)
    end

    # Close the transport connection
    def close
      return if @closed

      @mutex.synchronize do
        @closed = true
        @connected = false

        # Cancel all pending requests
        @pending.each_value { |w| w[:error] = TransportClosedError.new }

        @receive_thread&.kill
        @receive_thread = nil

        @socket&.close
        @socket = nil
      end
    end

    # Check if transport is closed
    # @return [Boolean]
    def closed?
      @closed
    end

    # Check if connected
    # @return [Boolean]
    def connected?
      @connected
    end

    private

    # Build URI from URL string
    def build_uri(url)
      url = url.sub(%r{^http://}, 'ws://').sub(%r{^https://}, 'wss://')

      if url.start_with?('ws://') || url.start_with?('wss://')
        uri = URI.parse(url)
      elsif url.include?('.')
        uri = URI.parse("wss://#{url}")
      else
        raise ArgumentError, "Invalid URL: #{url}"
      end

      uri.path = '/rpc' if uri.path.empty? || uri.path == '/'
      uri
    end

    # Generate next request ID
    def next_id
      @mutex.synchronize do
        @next_id += 1
      end
    end

    # Establish WebSocket connection
    def establish_connection
      host = @uri.host
      port = @uri.port || (@uri.scheme == 'wss' ? 443 : 80)
      use_ssl = @uri.scheme == 'wss'

      # Create TCP socket
      Timeout.timeout(@connect_timeout) do
        @socket = TCPSocket.new(host, port)
      end

      # Wrap with SSL if needed
      if use_ssl
        ssl_context = OpenSSL::SSL::SSLContext.new
        ssl_context.verify_mode = OpenSSL::SSL::VERIFY_PEER

        ssl_socket = OpenSSL::SSL::SSLSocket.new(@socket, ssl_context)
        ssl_socket.hostname = host
        ssl_socket.connect
        @socket = ssl_socket
      end

      # Perform WebSocket handshake
      perform_handshake
    rescue Timeout::Error
      raise ConnectionError.new("Connection timeout after #{@connect_timeout}s")
    rescue SocketError => e
      raise ConnectionError.new("Failed to connect: #{e.message}")
    end

    # Perform WebSocket handshake
    def perform_handshake
      key = Base64.strict_encode64(SecureRandom.random_bytes(16))

      request_lines = [
        "GET #{@uri.request_uri} HTTP/1.1",
        "Host: #{@uri.host}",
        'Upgrade: websocket',
        'Connection: Upgrade',
        "Sec-WebSocket-Key: #{key}",
        'Sec-WebSocket-Version: 13'
      ]

      # Add authentication header
      request_lines << "Authorization: Bearer #{@token}" if @token

      # Add custom headers
      @headers.each { |k, v| request_lines << "#{k}: #{v}" }

      request_lines << ''
      request_lines << ''

      @socket.write(request_lines.join("\r\n"))

      # Read response
      response = @socket.gets("\r\n\r\n")
      raise ConnectionError.new('Invalid WebSocket response') unless response.include?('101')

      # Verify accept key
      expected_accept = Base64.strict_encode64(
        Digest::SHA1.digest("#{key}#{WEBSOCKET_GUID}")
      )

      unless response.include?(expected_accept)
        raise ConnectionError.new('Invalid WebSocket accept key')
      end
    end

    # Start background receive thread
    def start_receive_thread
      @receive_thread = Thread.new do
        receive_loop
      end
    end

    # Background loop to receive messages
    def receive_loop
      until @closed
        message = read_message
        break if message.nil?

        handle_message(message)
      end
    rescue StandardError
      # Connection lost - attempt reconnect if enabled
      handle_disconnect
    end

    # Read a WebSocket message
    def read_message
      return nil if @socket.nil? || @socket.closed?

      # Read frame header
      header = @socket.read(2)
      return nil if header.nil? || header.length < 2

      first_byte = header[0].ord
      second_byte = header[1].ord

      # Check for text frame (opcode 1) or close frame (opcode 8)
      opcode = first_byte & 0x0F
      return nil if opcode == 8 # Close frame

      # Get payload length
      len = second_byte & 0x7F
      len = @socket.read(2).unpack1('n') if len == 126
      len = @socket.read(8).unpack1('Q>') if len == 127

      # Read payload
      payload = @socket.read(len)
      return nil if payload.nil?

      payload
    rescue IOError, OpenSSL::SSL::SSLError
      nil
    end

    # Handle received message
    def handle_message(data)
      message = JSON.parse(data)

      id = message['id']
      return unless id && @pending[id]

      waiter = @pending.delete(id)

      if message['error']
        waiter[:error] = parse_error(message['error'])
      else
        waiter[:result] = deserialize_value(message['result'])
      end

      waiter[:cv]&.signal
    rescue JSON::ParserError
      # Ignore malformed messages
    end

    # Handle disconnect
    def handle_disconnect
      return if @closed

      @connected = false

      if @auto_reconnect
        reconnect_attempts = 0
        until @closed || @connected
          reconnect_attempts += 1
          break if reconnect_attempts > @max_reconnects

          sleep(2**reconnect_attempts * 0.5) # Exponential backoff

          begin
            establish_connection
            @connected = true
          rescue ConnectionError
            # Continue trying
          end
        end
      end
    end

    # Build RPC request
    def build_request(id, method, args)
      {
        'id' => id,
        'method' => method.to_s,
        'args' => serialize_args(args)
      }
    end

    # Create waiter for request
    def create_waiter(id)
      waiter = {
        result: nil,
        error: nil,
        cv: ConditionVariable.new
      }

      @mutex.synchronize do
        @pending[id] = waiter
      end

      waiter
    end

    # Send WebSocket message
    def send_message(data)
      json = JSON.generate(data)
      payload = json.bytes

      # Build frame
      frame = []
      frame << 0x81 # FIN + text frame

      # Payload length
      if payload.length < 126
        frame << (payload.length | 0x80) # Masked
      elsif payload.length < 65_536
        frame << (126 | 0x80)
        frame << ((payload.length >> 8) & 0xFF)
        frame << (payload.length & 0xFF)
      else
        frame << (127 | 0x80)
        8.times { |i| frame << ((payload.length >> (56 - i * 8)) & 0xFF) }
      end

      # Masking key
      mask = 4.times.map { rand(256) }
      frame.concat(mask)

      # Masked payload
      payload.each_with_index { |b, i| frame << (b ^ mask[i % 4]) }

      @mutex.synchronize do
        @socket.write(frame.pack('C*'))
      end
    end

    # Wait for response
    def wait_for_response(id, waiter)
      @mutex.synchronize do
        unless waiter[:result] || waiter[:error]
          waiter[:cv].wait(@mutex, @timeout)
        end
      end

      # Check for timeout
      unless waiter[:result] || waiter[:error]
        @pending.delete(id)
        raise Error.new("Request timeout after #{@timeout}s", code: 'TIMEOUT')
      end

      raise waiter[:error] if waiter[:error]

      waiter[:result]
    end

    # Serialize arguments
    def serialize_args(args)
      args.map { |arg| serialize_value(arg) }
    end

    # Serialize a value
    def serialize_value(value)
      case value
      when Hash
        value.transform_keys(&:to_s).transform_values { |v| serialize_value(v) }
      when Array
        value.map { |v| serialize_value(v) }
      when ObjectId
        { '$oid' => value.to_s }
      when Time
        { '$date' => value.iso8601(3) }
      when Symbol
        value.to_s
      else
        value
      end
    end

    # Deserialize a value
    def deserialize_value(value)
      case value
      when Hash
        if value.key?('$oid')
          ObjectId.from_string(value['$oid'])
        elsif value.key?('$date')
          Time.parse(value['$date'])
        else
          value.transform_values { |v| deserialize_value(v) }
        end
      when Array
        value.map { |v| deserialize_value(v) }
      else
        value
      end
    end

    # Parse error from response
    def parse_error(error)
      message = error['message'] || error.to_s
      code = error['code']

      case code
      when 'CONNECTION_ERROR'
        ConnectionError.new(message)
      when 'QUERY_ERROR'
        QueryError.new(message, suggestion: error['suggestion'])
      else
        Error.new(message, code: code, details: error['details'])
      end
    end
  end
end

module MongoDo
  # Re-export for MongoDo namespace
  WebSocketRpcTransport = Mongo::WebSocketRpcTransport
end
