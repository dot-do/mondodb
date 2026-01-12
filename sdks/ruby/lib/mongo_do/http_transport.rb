# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'

module Mongo
  # HTTP RPC Transport for Mongo.do
  #
  # Connects to the Mongo.do service using HTTP/HTTPS for RPC calls.
  # Supports both single-request mode and request batching.
  #
  # @example Basic usage
  #   transport = MongoDo::HttpRpcTransport.new('https://mongo.do')
  #   transport.call('insertOne', 'mydb', 'users', { name: 'John' })
  #   transport.close
  #
  # @example With authentication
  #   transport = MongoDo::HttpRpcTransport.new('https://mongo.do', token: 'your-api-token')
  #
  class HttpRpcTransport
    include RpcTransport

    DEFAULT_TIMEOUT = 30
    DEFAULT_OPEN_TIMEOUT = 10
    DEFAULT_RETRY_COUNT = 3
    DEFAULT_RETRY_DELAY = 0.5

    attr_reader :uri, :options

    # Create a new HTTP RPC transport
    # @param url [String] Base URL for the Mongo.do service
    # @param options [Hash] Transport options
    # @option options [String] :token Authentication token
    # @option options [Integer] :timeout Request timeout in seconds
    # @option options [Integer] :open_timeout Connection open timeout
    # @option options [Integer] :retry_count Number of retries for transient errors
    # @option options [Float] :retry_delay Initial retry delay in seconds
    # @option options [Hash] :headers Additional headers
    def initialize(url, options = {})
      @uri = build_uri(url)
      @options = options
      @token = options[:token]
      @timeout = options[:timeout] || DEFAULT_TIMEOUT
      @open_timeout = options[:open_timeout] || DEFAULT_OPEN_TIMEOUT
      @retry_count = options[:retry_count] || DEFAULT_RETRY_COUNT
      @retry_delay = options[:retry_delay] || DEFAULT_RETRY_DELAY
      @headers = options[:headers] || {}
      @closed = false
      @http = nil
      @request_id = 0
    end

    # Make an RPC call
    # @param method [String] Method name
    # @param args [Array] Method arguments
    # @return [Object] Result from the RPC call
    def call(method, *args)
      raise TransportClosedError if @closed

      request = build_request(method, args)
      response = execute_with_retry(request)
      parse_response(response)
    end

    # Make multiple RPC calls in a batch
    # @param calls [Array<Array>] Array of [method, *args] calls
    # @return [Array<Object>] Results from each call
    def batch(*calls)
      raise TransportClosedError if @closed

      requests = calls.map { |call_args| build_request(call_args[0], call_args[1..]) }
      batch_request = {
        'type' => 'batch',
        'requests' => requests
      }

      response = execute_with_retry(batch_request)
      results = parse_response(response)

      results.map { |r| r['error'] ? raise_rpc_error(r['error']) : r['result'] }
    end

    # Close the transport connection
    def close
      return if @closed

      @closed = true
      @http&.finish if @http&.started?
      @http = nil
    end

    # Check if transport is closed
    # @return [Boolean]
    def closed?
      @closed
    end

    private

    # Build URI from URL string
    def build_uri(url)
      # Handle different URL formats
      if url.start_with?('http://') || url.start_with?('https://')
        uri = URI.parse(url)
      elsif url.include?('.')
        # Assume it's a domain like "mongo.do"
        uri = URI.parse("https://#{url}")
      else
        raise ArgumentError, "Invalid URL: #{url}"
      end

      # Ensure /rpc endpoint
      uri.path = '/rpc' if uri.path.empty? || uri.path == '/'
      uri
    end

    # Build RPC request payload
    def build_request(method, args)
      @request_id += 1
      {
        'id' => @request_id,
        'method' => method.to_s,
        'args' => serialize_args(args)
      }
    end

    # Serialize arguments for JSON transport
    def serialize_args(args)
      args.map { |arg| serialize_value(arg) }
    end

    # Serialize a single value
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

    # Execute request with retry logic
    def execute_with_retry(request)
      attempts = 0
      delay = @retry_delay

      loop do
        attempts += 1
        begin
          return execute_request(request)
        rescue Errno::ECONNREFUSED, Errno::ETIMEDOUT, Net::OpenTimeout, Net::ReadTimeout => e
          raise ConnectionError.new("Connection failed: #{e.message}") if attempts > @retry_count

          sleep(delay)
          delay *= 2 # Exponential backoff
        rescue SocketError => e
          raise ConnectionError.new("DNS resolution failed: #{e.message}")
        end
      end
    end

    # Execute a single HTTP request
    def execute_request(request)
      http = get_http_client
      req = Net::HTTP::Post.new(@uri.request_uri)

      # Set headers
      req['Content-Type'] = 'application/json'
      req['Accept'] = 'application/json'
      req['Authorization'] = "Bearer #{@token}" if @token
      req['User-Agent'] = "Mongo.do Ruby SDK/#{VERSION}"
      @headers.each { |k, v| req[k.to_s] = v }

      # Set body
      req.body = JSON.generate(request)

      # Execute
      response = http.request(req)

      # Handle HTTP errors
      case response.code.to_i
      when 200..299
        response.body
      when 401
        raise Error.new('Unauthorized: Invalid or missing authentication token', code: 'UNAUTHORIZED')
      when 403
        raise Error.new('Forbidden: Access denied', code: 'FORBIDDEN')
      when 404
        raise Error.new('Not found: Invalid endpoint', code: 'NOT_FOUND')
      when 429
        retry_after = response['Retry-After']&.to_i || 5
        raise Error.new("Rate limited: Try again in #{retry_after} seconds", code: 'RATE_LIMITED')
      when 500..599
        raise Error.new("Server error: #{response.code}", code: 'SERVER_ERROR')
      else
        raise Error.new("HTTP error: #{response.code}", code: 'HTTP_ERROR')
      end
    end

    # Get or create HTTP client
    def get_http_client
      return @http if @http&.started?

      @http = Net::HTTP.new(@uri.host, @uri.port)
      @http.use_ssl = @uri.scheme == 'https'
      @http.open_timeout = @open_timeout
      @http.read_timeout = @timeout
      @http.write_timeout = @timeout
      @http.start

      @http
    end

    # Parse RPC response
    def parse_response(body)
      response = JSON.parse(body)

      if response['error']
        raise_rpc_error(response['error'])
      else
        deserialize_value(response['result'])
      end
    rescue JSON::ParserError => e
      raise Error.new("Invalid JSON response: #{e.message}", code: 'PARSE_ERROR')
    end

    # Raise appropriate error from RPC error response
    def raise_rpc_error(error)
      message = error['message'] || error.to_s
      code = error['code']

      case code
      when 'CONNECTION_ERROR'
        raise ConnectionError.new(message)
      when 'QUERY_ERROR'
        raise QueryError.new(message, suggestion: error['suggestion'])
      when 'WRITE_CONCERN_ERROR'
        raise WriteConcernError.new(message)
      else
        raise Error.new(message, code: code, details: error['details'])
      end
    end

    # Deserialize a value from JSON
    def deserialize_value(value)
      case value
      when Hash
        # Check for special types
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
  end
end

module MongoDo
  # Re-export for MongoDo namespace
  HttpRpcTransport = Mongo::HttpRpcTransport
end
