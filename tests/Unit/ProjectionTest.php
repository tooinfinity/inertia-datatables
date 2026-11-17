<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use TooInfinity\InertiaDataTables\Processing\Projection;

describe('Projection', function (): void {
    $projection = new Projection;

    it('splits a raw projection list preserving parenthesis and quotes', function () use ($projection): void {
        $sql = 'users.id, concat(users.first_name, ", ", users.last_name) as full_name, (select count(*) from posts where posts.user_id = users.id) as post_count, "quoted,column" as quoted';

        $items = $projection->splitList($sql);

        expect($items)->toHaveCount(4);
        expect($items[0])->toBe('users.id');
        expect($items[1])->toBe('concat(users.first_name, ", ", users.last_name) as full_name');
        expect($items[2])->toBe('(select count(*) from posts where posts.user_id = users.id) as post_count');
        expect($items[3])->toBe('"quoted,column" as quoted');
    });

    it('parses projected expressions and their aliases', function () use ($projection): void {
        expect($projection->parse('users.name'))->toBe(['users.name', null]);
        expect($projection->parse('users.name as user_name'))->toBe(['users.name', 'user_name']);
        expect($projection->parse('users.name AS "user_name"'))->toBe(['users.name', 'user_name']);
        expect($projection->parse('users.name as `user_name`'))->toBe(['users.name', 'user_name']);
    });

    it('normalizes identifiers by removing quotes and lowercasing', function () use ($projection): void {
        expect($projection->normalizeIdentifier('`users`.`ID`'))->toBe('users.id');
        expect($projection->normalizeIdentifier('"Users"."Name"'))->toBe('users.name');
    });

    it('identifies base wildcards', function () use ($projection): void {
        expect($projection->isBaseWildcard('*', 'users'))->toBeTrue();
        expect($projection->isBaseWildcard('users.*', 'users'))->toBeTrue();
        expect($projection->isBaseWildcard('`users`.*', 'users'))->toBeTrue();
        expect($projection->isBaseWildcard('posts.*', 'users'))->toBeFalse();
        expect($projection->isBaseWildcard('id', 'users'))->toBeFalse();
    });

    it('matches row keys', function () use ($projection): void {
        expect($projection->matchesKey('id', 'id', 'users'))->toBeTrue();
        expect($projection->matchesKey('users.id', 'id', 'users'))->toBeTrue();
        expect($projection->matchesKey('`users`.`id`', 'id', 'users'))->toBeTrue();
        expect($projection->matchesKey('posts.id', 'id', 'users'))->toBeFalse();
        expect($projection->matchesKey('name', 'id', 'users'))->toBeFalse();
    });

    it('matches grouping columns across qualifiers', function () use ($projection): void {
        expect($projection->matchesGroup('status', 'status', 'users'))->toBeTrue();
        expect($projection->matchesGroup('users.status', 'status', 'users'))->toBeTrue();
        expect($projection->matchesGroup('status', 'users.status', 'users'))->toBeTrue();
        expect($projection->matchesGroup('users.status', 'users.status', 'users'))->toBeTrue();
        expect($projection->matchesGroup('posts.status', 'users.status', 'users'))->toBeFalse();
    });

    it('detects aggregate expressions while ignoring window functions', function () use ($projection): void {
        expect($projection->isAggregateExpression('count(*)'))->toBeTrue();
        expect($projection->isAggregateExpression('SUM(total)'))->toBeTrue();
        expect($projection->isAggregateExpression('AVG(price)'))->toBeTrue();
        expect($projection->isAggregateExpression('MAX(score)'))->toBeTrue();
        expect($projection->isAggregateExpression('MIN(score)'))->toBeTrue();
        expect($projection->isAggregateExpression('name'))->toBeFalse();
        expect($projection->isAggregateExpression('count(*) over ()'))->toBeFalse();
    });

    it('resolves table qualifiers and base tables', function () use ($projection): void {
        $queryWithAlias = DB::table('users as u');
        expect($projection->tableQualifier($queryWithAlias))->toBe('u');
        expect($projection->baseTable($queryWithAlias->from))->toBe('users');

        $queryWithoutAlias = DB::table('my_schema.users');
        expect($projection->tableQualifier($queryWithoutAlias))->toBe('users');
        expect($projection->baseTable($queryWithoutAlias->from))->toBe('my_schema.users');
        expect($projection->tableName('my_schema.users'))->toBe('users');
        expect($projection->sameTable('users', 'my_schema.users'))->toBeTrue();
    });

    it('does not split commas inside SQL comments', function () use ($projection): void {
        $sql = 'title /* note, id, end */, id';
        $items = $projection->splitList($sql);

        expect($items)->toHaveCount(2);
        expect($items[0])->toBe('title /* note, id, end */');
        expect($items[1])->toBe('id');

        $lineSql = "title -- note, id\n, id";
        $lineItems = $projection->splitList($lineSql);

        expect($lineItems)->toHaveCount(2);
    });

    it('ignores aggregate names inside quoted string literals and comments', function () use ($projection): void {
        expect($projection->isAggregateExpression("'count(' as label"))->toBeFalse();
        expect($projection->isAggregateExpression("'sum(value)'"))->toBeFalse();
        expect($projection->isAggregateExpression('/* count(*) */ users.id'))->toBeFalse();
        expect($projection->isAggregateExpression("-- count(*)\n users.id"))->toBeFalse();
    });
});
