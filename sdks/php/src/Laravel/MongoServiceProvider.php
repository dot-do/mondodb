<?php

declare(strict_types=1);

namespace MongoDo\Laravel;

use Illuminate\Support\ServiceProvider;
use MongoDo\MongoClient;

/**
 * Laravel Service Provider for MongoDB SDK.
 */
class MongoServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        $this->mergeConfigFrom(
            __DIR__ . '/../../config/mongo.php',
            'mongo'
        );

        $this->app->singleton(MongoClient::class, function ($app) {
            $config = $app['config']['mongo'];

            $uri = $config['uri'] ?? $config['dsn'] ?? 'mongodb://localhost:27017';
            $options = $config['options'] ?? [];

            $client = new MongoClient($uri, $options);
            $client->connect();

            return $client;
        });

        // Alias
        $this->app->alias(MongoClient::class, 'mongo');
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../../config/mongo.php' => config_path('mongo.php'),
            ], 'mongo-config');
        }
    }

    /**
     * Get the services provided by the provider.
     *
     * @return array<string>
     */
    public function provides(): array
    {
        return [
            MongoClient::class,
            'mongo',
        ];
    }
}
