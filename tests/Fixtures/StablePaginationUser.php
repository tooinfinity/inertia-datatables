<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests\Fixtures;

use Illuminate\Database\Eloquent\Model;

/**
 * @property string $email
 * @property string $status
 */
final class StablePaginationUser extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $table = 'users';

    protected $primaryKey = 'email';

    protected $keyType = 'string';
}
