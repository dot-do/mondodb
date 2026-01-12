module Mongo
  # MongoDB client for connecting to the .do platform
  class Client
    getter uri : String
    @http_client : HTTP::Client?
    @databases : Hash(String, Database) = {} of String => Database
    @connected : Bool = false
    @config : Config

    # Create a new client with a URI
    #
    # Example:
    #   client = Mongo::Client.new("https://your-worker.workers.dev")
    #   client = Mongo::Client.new("mongodb://localhost:27017")
    def initialize(uri : String, config : Config? = nil)
      @uri = normalize_uri(uri)
      @config = config || Mongo.config
      @http_client = create_http_client
      @connected = true
    end

    # Create a new client with config
    def self.new(config : Config)
      new(config.uri, config)
    end

    # Get a database by name
    #
    # Example:
    #   db = client["myapp"]
    #   db = client.database("myapp")
    def [](name : String) : Database
      database(name)
    end

    # Get a database by name
    def database(name : String) : Database
      @databases[name] ||= Database.new(self, name)
    end

    # List all database names
    def list_database_names : Array(String)
      response = rpc_call("mongo.listDatabases")
      response["databases"]?.try(&.as_a.map(&.as_s)) || [] of String
    end

    # List all databases with metadata
    def list_databases : Array(JSON::Any)
      response = rpc_call("mongo.listDatabases", {"includeStats" => true})
      response["databases"]?.try(&.as_a) || [] of JSON::Any
    end

    # Ping the server
    #
    # Example:
    #   if client.ping
    #     puts "Connected!"
    #   end
    def ping : Bool
      response = rpc_call("mongo.ping")
      response["ok"]?.try(&.as_i64) == 1
    rescue
      false
    end

    # Check if connected
    def connected? : Bool
      @connected
    end

    # Close the connection
    def close : Nil
      @http_client.try(&.close)
      @http_client = nil
      @connected = false
    end

    # Start a session
    def start_session : Session
      Session.new(self)
    end

    # Run a command on the admin database
    def admin_command(command : Hash(String, JSON::Any) | NamedTuple) : JSON::Any
      database("admin").run_command(command)
    end

    # Internal: Make an RPC call to the server
    def rpc_call(method : String, params : Hash(String, _) | NamedTuple = {} of String => String) : JSON::Any
      raise ConnectionError.new("Client is not connected", @uri) unless @connected

      client = @http_client
      raise ConnectionError.new("HTTP client not initialized", @uri) unless client

      body = {
        "jsonrpc" => "2.0",
        "method"  => method,
        "params"  => params,
        "id"      => Random.new.hex(8),
      }.to_json

      headers = @config.headers

      response = client.post("/rpc", headers: headers, body: body)

      unless response.success?
        handle_http_error(response)
      end

      result = JSON.parse(response.body)

      if error = result["error"]?
        handle_rpc_error(error)
      end

      result["result"]? || JSON::Any.new(nil)
    end

    # Normalize the URI to HTTP(S)
    private def normalize_uri(uri : String) : String
      parsed = URI.parse(uri)

      case parsed.scheme
      when "mongodb", "mongodb+srv"
        # Convert MongoDB URI to HTTPS
        "https://#{parsed.host}#{parsed.port ? ":#{parsed.port}" : ""}"
      when "http", "https", "ws", "wss"
        # Use as-is but ensure https for ws schemes
        if parsed.scheme == "ws"
          "http://#{parsed.host}#{parsed.port ? ":#{parsed.port}" : ""}"
        elsif parsed.scheme == "wss"
          "https://#{parsed.host}#{parsed.port ? ":#{parsed.port}" : ""}"
        else
          uri
        end
      when nil
        # Assume HTTPS if no scheme
        "https://#{uri}"
      else
        raise InvalidURIError.new("Unsupported scheme: #{parsed.scheme}")
      end
    end

    # Create the HTTP client
    private def create_http_client : HTTP::Client
      parsed = URI.parse(@uri)
      host = parsed.host || "localhost"
      port = parsed.port

      client = if parsed.scheme == "https"
                 HTTP::Client.new(host, port || 443, tls: true)
               else
                 HTTP::Client.new(host, port || 80)
               end

      client.connect_timeout = @config.timeout
      client.read_timeout = @config.timeout
      client
    end

    # Handle HTTP errors
    private def handle_http_error(response : HTTP::Client::Response) : NoReturn
      case response.status_code
      when 401, 403
        raise AuthenticationError.new("Authentication failed: #{response.status_code}")
      when 404
        raise ConnectionError.new("Endpoint not found", @uri)
      when 408, 504
        raise TimeoutError.new("Request timed out")
      when 500..599
        raise ConnectionError.new("Server error: #{response.status_code}", @uri)
      else
        raise MongoError.new("HTTP error: #{response.status_code} - #{response.body}")
      end
    end

    # Handle RPC errors
    private def handle_rpc_error(error : JSON::Any) : NoReturn
      code = error["code"]?.try(&.as_i64) || -1
      message = error["message"]?.try(&.as_s) || "Unknown error"
      data = error["data"]?

      case code
      when 11000
        raise DuplicateKeyError.new(message, details: data)
      when -32600
        raise ValidationError.new("Invalid request: #{message}")
      when -32601
        raise QueryError.new("Method not found: #{message}")
      when -32602
        raise ValidationError.new("Invalid params: #{message}")
      when -32603
        raise MongoError.new("Internal error: #{message}")
      else
        suggestion = data.try(&.["suggestion"]?.try(&.as_s))
        raise QueryError.new(message, suggestion, code.to_s)
      end
    end
  end

  # Session for transaction support
  class Session
    getter client : Client
    @id : String

    def initialize(@client : Client)
      @id = Random.new.hex(16)
    end

    # End the session
    def end_session : Nil
      # Sessions are currently handled server-side
    end

    # Run a function within a transaction
    def with_transaction(&)
      begin
        yield
      rescue ex
        raise TransactionError.new("Transaction failed: #{ex.message}")
      end
    end
  end

  # Transaction for atomic operations
  class Transaction
    @config : Config
    @operations : Array(Hash(String, JSON::Any)) = [] of Hash(String, JSON::Any)
    @committed : Bool = false

    def initialize(@config : Config)
    end

    # Execute a natural language query within the transaction
    def query(query_string : String) : MongoQuery(JSON::Any)
      MongoQuery(JSON::Any).new(query_string, @config, self)
    end

    # Add an operation to the transaction
    def add_operation(operation : Hash(String, JSON::Any)) : Nil
      @operations << operation
    end

    # Commit the transaction
    def commit : Nil
      return if @committed
      # Operations would be sent to server atomically
      @committed = true
    end

    # Rollback the transaction
    def rollback : Nil
      @operations.clear
      @committed = true
    end
  end
end
