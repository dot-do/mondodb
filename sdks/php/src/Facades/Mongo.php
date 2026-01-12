<?php

declare(strict_types=1);

namespace MongoDo\Facades;

use Illuminate\Support\Facades\Facade;
use MongoDo\MongoClient;
use MongoDo\Database;
use MongoDo\Collection;

/**
 * Mongo Facade for Laravel.
 *
 * @method static MongoClient connect()
 * @method static Database selectDatabase(?string $name = null)
 * @method static Database db(?string $name = null)
 * @method static array listDatabases()
 * @method static array listDatabaseNames()
 * @method static bool dropDatabase(string $name)
 * @method static void close()
 * @method static array ping()
 * @method static bool isConnected()
 * @method static string getUri()
 *
 * @see \MongoDo\MongoClient
 */
class Mongo extends Facade
{
    /**
     * Get the registered name of the component.
     */
    protected static function getFacadeAccessor(): string
    {
        return MongoClient::class;
    }
}
