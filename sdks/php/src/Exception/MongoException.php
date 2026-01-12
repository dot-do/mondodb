<?php

declare(strict_types=1);

namespace MongoDo\Exception;

use Exception;

/**
 * MongoException - Base exception for all MongoDB SDK errors.
 */
class MongoException extends Exception
{
    protected ?int $errorCode = null;
    protected ?string $errorLabels = null;

    public function __construct(
        string $message = '',
        int $code = 0,
        ?Exception $previous = null,
        ?int $errorCode = null,
    ) {
        parent::__construct($message, $code, $previous);
        $this->errorCode = $errorCode;
    }

    /**
     * Get the MongoDB error code.
     */
    public function getErrorCode(): ?int
    {
        return $this->errorCode;
    }

    /**
     * Check if this error is retriable.
     */
    public function isRetriable(): bool
    {
        // Network errors are generally retriable
        return $this instanceof ConnectionException ||
               $this instanceof TimeoutException;
    }
}

/**
 * ConnectionException - Connection-related errors.
 */
class ConnectionException extends MongoException {}

/**
 * WriteException - Write operation errors.
 */
class WriteException extends MongoException {}

/**
 * DuplicateKeyException - Duplicate key violations.
 */
class DuplicateKeyException extends WriteException
{
    public function __construct(string $message = 'Duplicate key error')
    {
        parent::__construct($message, 11000);
    }
}

/**
 * TimeoutException - Operation timeout errors.
 */
class TimeoutException extends MongoException {}

/**
 * TransportException - RPC transport errors.
 */
class TransportException extends MongoException {}

/**
 * AuthenticationException - Authentication errors.
 */
class AuthenticationException extends MongoException {}

/**
 * ValidationException - Document validation errors.
 */
class ValidationException extends MongoException {}
