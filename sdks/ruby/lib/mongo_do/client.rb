# frozen_string_literal: true

module Mongo
  # MongoDB Client - the main entry point for database connections
  #
  # @example Basic usage
  #   client = Mongo::Client.new('mongodb://localhost/mydb')
  #   db = client.database
  #   users = db[:users]
  #   users.insert_one(name: 'John')
  #   client.close
  #
  class Client
    attr_reader :uri, :options

    # Create a new MongoDB client
    # @param uri [String] MongoDB connection URI
    # @param options [Hash] Client options
    # @option options [Integer] :timeout Request timeout in milliseconds
    # @option options [Boolean] :auto_reconnect Enable auto-reconnect
    # @option options [Integer] :max_retries Maximum number of retries
    # @option options [Integer] :reconnect_interval Reconnect interval in milliseconds
    # @option options [String] :token Authentication token
    def initialize(uri, options = {})
      @uri = uri
      @options = options
      @transport = nil
      @connected = false
      @databases = {}
      @default_db_name = nil

      # Parse the URI to get default database name
      parse_uri
    end

    # Connect to the database
    # @return [Client] self
    def connect
      return self if @connected

      # Create the transport
      @transport = create_transport
      @transport.call('connect', @uri)
      @connected = true
      self
    end

    # Get the database
    # @param name [String, nil] Database name (uses default if nil)
    # @return [Database]
    def database(name = nil)
      raise Mongo::Error, 'Client must be connected before calling database()' unless @transport

      db_name = name || @default_db_name || 'test'

      @databases[db_name] ||= Database.new(@transport, db_name)
    end

    alias db database

    # Get a database or collection using bracket syntax
    # @param name [String, Symbol] Database or collection name
    # @return [Database, Collection]
    def [](name)
      database[name]
    end

    # Close the connection
    def close
      if @transport
        @transport.close
        @transport = nil
      end
      @connected = false
      @databases.clear
    end

    # Check if connected
    # @return [Boolean]
    def connected?
      @connected
    end

    # Get the internal transport (for testing)
    # @return [RpcTransport, nil]
    def transport
      @transport
    end

    # Set a custom transport (for testing or custom RPC implementations)
    # @param transport [RpcTransport] Custom transport instance
    def transport=(transport)
      @transport = transport
      @connected = true
    end

    # Create and connect a client
    # @param uri [String] MongoDB connection URI
    # @param options [Hash] Client options
    # @return [Client]
    def self.connect(uri, options = {})
      client = new(uri, options)
      client.connect
    end

    # Use a database
    # @param name [String] Database name
    # @return [Client] A new client using the specified database
    def use(name)
      client = self.class.new(@uri, @options)
      client.instance_variable_set(:@default_db_name, name)
      client.instance_variable_set(:@transport, @transport)
      client.instance_variable_set(:@connected, @connected)
      client
    end

    private

    # Parse the connection URI
    def parse_uri
      @parsed = self.class.parse_connection_uri(@uri)
      @default_db_name = @parsed[:database]
    rescue StandardError
      # Ignore parse errors - may be handled later or use defaults
    end

    # Create the transport
    def create_transport
      transport_type = @options[:transport] || detect_transport_type

      case transport_type
      when :websocket, :ws, :wss
        create_websocket_transport
      when :http, :https
        create_http_transport
      when :mock
        create_mock_transport
      else
        # Use default transport class
        Mongo.default_transport_class.new
      end
    end

    # Detect transport type from URI
    def detect_transport_type
      return :mock unless @uri

      case @uri
      when /^wss?:\/\//
        :websocket
      when /^https?:\/\//
        :http
      when /^mongodb\+srv:\/\//
        :http # Use HTTP for mongodb+srv
      when /^mongodb:\/\//
        # Standard MongoDB URI - use mock for local, HTTP for remote
        @parsed && @parsed[:host]&.include?('.do') ? :http : :mock
      else
        :mock
      end
    end

    # Create WebSocket transport
    def create_websocket_transport
      url = build_transport_url(:websocket)
      Mongo::WebSocketRpcTransport.new(url, transport_options)
    end

    # Create HTTP transport
    def create_http_transport
      url = build_transport_url(:http)
      Mongo::HttpRpcTransport.new(url, transport_options)
    end

    # Create mock transport
    def create_mock_transport
      MongoDo::MockRpcTransport.new
    end

    # Build transport URL from connection URI
    def build_transport_url(type)
      return @uri if @uri.start_with?('ws', 'http')

      # Parse MongoDB URI and convert to service URL
      if @parsed
        host = @parsed[:host] || 'mongo.do'
        port = @parsed[:port]
        protocol = type == :websocket ? 'wss' : 'https'

        url = "#{protocol}://#{host}"
        url += ":#{port}" if port
        url += '/rpc'
        url
      else
        type == :websocket ? 'wss://mongo.do/rpc' : 'https://mongo.do/rpc'
      end
    end

    # Extract transport options from client options
    def transport_options
      {
        token: @options[:token] || @options[:api_key],
        timeout: @options[:timeout],
        headers: @options[:headers],
        auto_reconnect: @options[:auto_reconnect],
        max_reconnects: @options[:max_reconnects]
      }.compact
    end

    class << self
      # Parse a MongoDB connection URI
      # @param uri [String] MongoDB URI
      # @return [Hash] Parsed URI components
      def parse_connection_uri(uri)
        # Handle mongodb:// and mongodb+srv://
        match = uri.match(%r{^(mongodb(?:\+srv)?):\/\/})
        raise Mongo::Error, 'Invalid MongoDB URI: must start with mongodb:// or mongodb+srv://' unless match

        protocol = match[1]
        remaining = uri[match[0].length..]

        # Extract credentials if present
        username = nil
        password = nil

        if (at_index = remaining.index('@'))
          credentials = remaining[0...at_index]
          remaining = remaining[(at_index + 1)..]

          if (colon_index = credentials.index(':'))
            username = URI.decode_www_form_component(credentials[0...colon_index])
            password = URI.decode_www_form_component(credentials[(colon_index + 1)..])
          else
            username = URI.decode_www_form_component(credentials)
          end
        end

        # Extract query string if present
        options = {}
        if (query_index = remaining.index('?'))
          query_string = remaining[(query_index + 1)..]
          remaining = remaining[0...query_index]

          query_string.split('&').each do |pair|
            key, value = pair.split('=', 2)
            options[URI.decode_www_form_component(key)] = URI.decode_www_form_component(value || '')
          end
        end

        # Extract database name
        database = nil
        host_part = remaining

        if (path_index = remaining.index('/'))
          host_part = remaining[0...path_index]
          db_path = remaining[(path_index + 1)..]
          database = db_path.empty? ? nil : db_path
        end

        # Parse host and port
        port_match = host_part.match(/:(\d+)$/)
        host = host_part
        port = nil

        if port_match
          host = host_part[0...-port_match[0].length]
          port = port_match[1].to_i
        end

        {
          protocol: protocol,
          host: host,
          port: port,
          database: database,
          username: username,
          password: password,
          options: options
        }
      end
    end
  end
end
