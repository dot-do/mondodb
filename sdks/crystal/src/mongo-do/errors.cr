module Mongo
  # Base error class for all MongoDB errors
  class MongoError < Exception
    getter code : String?
    getter retriable : Bool

    def initialize(message : String, @code : String? = nil, @retriable : Bool = false)
      super(message)
    end

    def retriable? : Bool
      @retriable
    end
  end

  # Connection errors
  class ConnectionError < MongoError
    getter address : String?

    def initialize(message : String, @address : String? = nil)
      super(message, "CONNECTION_ERROR", retriable: true)
    end
  end

  # Query errors with optional suggestion
  class QueryError < MongoError
    getter suggestion : String?

    def initialize(message : String, @suggestion : String? = nil, code : String? = nil)
      super(message, code, retriable: false)
    end
  end

  # Authentication errors
  class AuthenticationError < MongoError
    def initialize(message : String = "Authentication failed")
      super(message, "AUTH_ERROR", retriable: false)
    end
  end

  # Write errors
  class WriteError < MongoError
    getter details : JSON::Any?

    def initialize(message : String, @details : JSON::Any? = nil)
      super(message, "WRITE_ERROR", retriable: false)
    end
  end

  # Document not found error
  class DocumentNotFoundError < MongoError
    def initialize(message : String = "Document not found")
      super(message, "NOT_FOUND", retriable: false)
    end
  end

  # Timeout error
  class TimeoutError < MongoError
    def initialize(message : String = "Operation timed out")
      super(message, "TIMEOUT", retriable: true)
    end
  end

  # Validation error
  class ValidationError < MongoError
    def initialize(message : String)
      super(message, "VALIDATION_ERROR", retriable: false)
    end
  end

  # Transaction error
  class TransactionError < MongoError
    def initialize(message : String)
      super(message, "TRANSACTION_ERROR", retriable: true)
    end
  end

  # Invalid URI error
  class InvalidURIError < MongoError
    def initialize(message : String = "Invalid URI format")
      super(message, "INVALID_URI", retriable: false)
    end
  end

  # Cursor exhausted error
  class CursorExhaustedError < MongoError
    def initialize
      super("Cursor has been exhausted", "CURSOR_EXHAUSTED", retriable: false)
    end
  end

  # Duplicate key error
  class DuplicateKeyError < WriteError
    getter key : String?

    def initialize(message : String, @key : String? = nil, details : JSON::Any? = nil)
      super(message, details)
    end
  end
end
