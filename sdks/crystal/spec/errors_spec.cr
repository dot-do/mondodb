require "./spec_helper"

describe Mongo::MongoError do
  it "creates a basic error" do
    error = Mongo::MongoError.new("Test error")
    error.message.should eq "Test error"
    error.code.should be_nil
    error.retriable?.should be_false
  end

  it "creates an error with code and retriable flag" do
    error = Mongo::MongoError.new("Test error", "ERR_CODE", retriable: true)
    error.message.should eq "Test error"
    error.code.should eq "ERR_CODE"
    error.retriable?.should be_true
  end
end

describe Mongo::ConnectionError do
  it "creates a connection error" do
    error = Mongo::ConnectionError.new("Connection failed", "localhost:27017")
    error.message.should eq "Connection failed"
    error.address.should eq "localhost:27017"
    error.retriable?.should be_true
    error.code.should eq "CONNECTION_ERROR"
  end
end

describe Mongo::QueryError do
  it "creates a query error with suggestion" do
    error = Mongo::QueryError.new("Invalid query", suggestion: "Did you mean 'users'?")
    error.message.should eq "Invalid query"
    error.suggestion.should eq "Did you mean 'users'?"
    error.retriable?.should be_false
  end

  it "creates a query error without suggestion" do
    error = Mongo::QueryError.new("Invalid query")
    error.suggestion.should be_nil
  end
end

describe Mongo::AuthenticationError do
  it "creates an authentication error" do
    error = Mongo::AuthenticationError.new
    error.message.should eq "Authentication failed"
    error.code.should eq "AUTH_ERROR"
    error.retriable?.should be_false
  end
end

describe Mongo::WriteError do
  it "creates a write error" do
    details = JSON::Any.new({"field" => JSON::Any.new("email")})
    error = Mongo::WriteError.new("Write failed", details)
    error.message.should eq "Write failed"
    error.details.should eq details
    error.code.should eq "WRITE_ERROR"
  end
end

describe Mongo::DocumentNotFoundError do
  it "creates a document not found error" do
    error = Mongo::DocumentNotFoundError.new
    error.message.should eq "Document not found"
    error.code.should eq "NOT_FOUND"
  end
end

describe Mongo::TimeoutError do
  it "creates a timeout error" do
    error = Mongo::TimeoutError.new
    error.message.should eq "Operation timed out"
    error.code.should eq "TIMEOUT"
    error.retriable?.should be_true
  end
end

describe Mongo::ValidationError do
  it "creates a validation error" do
    error = Mongo::ValidationError.new("Field 'email' is required")
    error.message.should eq "Field 'email' is required"
    error.code.should eq "VALIDATION_ERROR"
    error.retriable?.should be_false
  end
end

describe Mongo::TransactionError do
  it "creates a transaction error" do
    error = Mongo::TransactionError.new("Transaction aborted")
    error.message.should eq "Transaction aborted"
    error.code.should eq "TRANSACTION_ERROR"
    error.retriable?.should be_true
  end
end

describe Mongo::InvalidURIError do
  it "creates an invalid URI error" do
    error = Mongo::InvalidURIError.new("Invalid scheme: ftp")
    error.message.should eq "Invalid scheme: ftp"
    error.code.should eq "INVALID_URI"
  end
end

describe Mongo::CursorExhaustedError do
  it "creates a cursor exhausted error" do
    error = Mongo::CursorExhaustedError.new
    error.message.should eq "Cursor has been exhausted"
    error.code.should eq "CURSOR_EXHAUSTED"
  end
end

describe Mongo::DuplicateKeyError do
  it "creates a duplicate key error" do
    error = Mongo::DuplicateKeyError.new("Duplicate key error", "email")
    error.message.should eq "Duplicate key error"
    error.key.should eq "email"
  end
end
