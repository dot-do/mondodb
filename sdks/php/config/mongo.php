<?php

return [
    /*
    |--------------------------------------------------------------------------
    | MongoDB Connection URI
    |--------------------------------------------------------------------------
    |
    | The connection string for your MongoDB server. This can include
    | authentication credentials, replica set configuration, and other
    | connection options.
    |
    */
    'uri' => env('MONGO_URI', env('MONGO_DSN', 'mongodb://localhost:27017')),

    /*
    |--------------------------------------------------------------------------
    | Default Database
    |--------------------------------------------------------------------------
    |
    | The default database to use when none is specified. This can also
    | be included in the connection URI.
    |
    */
    'database' => env('MONGO_DATABASE', 'default'),

    /*
    |--------------------------------------------------------------------------
    | Connection Options
    |--------------------------------------------------------------------------
    |
    | Additional options for the MongoDB connection.
    |
    */
    'options' => [
        // Connection timeout in milliseconds
        'connectTimeoutMS' => env('MONGO_CONNECT_TIMEOUT', 10000),

        // Server selection timeout in milliseconds
        'serverSelectionTimeoutMS' => env('MONGO_SERVER_SELECTION_TIMEOUT', 30000),

        // Read preference (primary, primaryPreferred, secondary, secondaryPreferred, nearest)
        'readPreference' => env('MONGO_READ_PREFERENCE', 'primary'),

        // Write concern
        'w' => env('MONGO_WRITE_CONCERN', 'majority'),

        // Write concern timeout
        'wTimeoutMS' => env('MONGO_WRITE_TIMEOUT', 10000),

        // Retry writes
        'retryWrites' => env('MONGO_RETRY_WRITES', true),

        // App name for logging
        'appName' => env('APP_NAME', 'Laravel'),
    ],
];
