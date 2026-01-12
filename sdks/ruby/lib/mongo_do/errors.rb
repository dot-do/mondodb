# frozen_string_literal: true

module Mongo
  # Base error class for all MongoDB errors
  class Error < StandardError
    attr_reader :code, :details

    def initialize(message, code: nil, details: nil)
      @code = code
      @details = details
      super(message)
    end
  end

  # Error raised when connection fails
  class ConnectionError < Error
    def initialize(message, details: nil)
      super(message, code: 'CONNECTION_ERROR', details: details)
    end
  end

  # Error raised for invalid operations
  class InvalidOperationError < Error
    def initialize(message, details: nil)
      super(message, code: 'INVALID_OPERATION', details: details)
    end
  end

  # Error raised for write concern issues
  class WriteConcernError < Error
    def initialize(message, details: nil)
      super(message, code: 'WRITE_CONCERN_ERROR', details: details)
    end
  end

  # Error raised when a query fails
  class QueryError < Error
    attr_reader :suggestion

    def initialize(message, suggestion: nil, details: nil)
      @suggestion = suggestion
      super(message, code: 'QUERY_ERROR', details: details)
    end
  end

  # Error raised when transport is closed
  class TransportClosedError < Error
    def initialize(message = 'Transport is closed')
      super(message, code: 'TRANSPORT_CLOSED')
    end
  end

  # Error raised for unknown RPC methods
  class UnknownMethodError < Error
    def initialize(method_name)
      super("Unknown method: #{method_name}", code: 'UNKNOWN_METHOD')
    end
  end
end
