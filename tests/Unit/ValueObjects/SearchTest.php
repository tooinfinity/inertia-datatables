<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Searching\Search;

describe('Search', function (): void {
    it('creates a search with column and value', function (): void {
        $search = Search::make('name', 'john');

        expect($search->column)->toBe('name');
        expect($search->value)->toBe('john');
    });

    it('returns correct array representation', function (): void {
        $search = Search::make('name', 'john');

        expect($search->toArray())->toBe([
            'column' => 'name',
            'value' => 'john',
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $search = Search::make('name', 'john');

        expect($search)->toBeInstanceOf(JsonSerializable::class);
        expect(json_encode($search))->toBe('{"column":"name","value":"john"}');
    });
});
