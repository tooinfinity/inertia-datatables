<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Column;

describe('Column', function (): void {
    it('creates a column with minimal parameters', function (): void {
        $column = Column::make('name');

        expect($column->name)->toBe('name');
        expect($column->label)->toBe('Name');
        expect($column->searchable)->toBeFalse();
        expect($column->sortable)->toBeFalse();
        expect($column->filterable)->toBeFalse();
        expect($column->hidden)->toBeFalse();
        expect($column->filterType)->toBeNull();
        expect($column->filterOptions)->toBe([]);
    });

    it('formats label from snake_case name', function (): void {
        $column = Column::make('first_name');

        expect($column->label)->toBe('First Name');
    });

    it('formats label from dot notation name', function (): void {
        $column = Column::make('user.name');

        expect($column->label)->toBe('User Name');
    });

    it('allows custom label', function (): void {
        $column = Column::make('name')->label('Full Name');

        expect($column->label)->toBe('Full Name');
    });

    it('allows enabling searchable', function (): void {
        $column = Column::make('name')->searchable();

        expect($column->searchable)->toBeTrue();
    });

    it('allows disabling searchable', function (): void {
        $column = Column::make('name')->searchable()->searchable(false);

        expect($column->searchable)->toBeFalse();
    });

    it('allows enabling sortable', function (): void {
        $column = Column::make('name')->sortable();

        expect($column->sortable)->toBeTrue();
    });

    it('allows enabling filterable', function (): void {
        $column = Column::make('name')->filterable();

        expect($column->filterable)->toBeTrue();
    });

    it('allows setting filter type', function (): void {
        $column = Column::make('status')->filterable()->filterType('select');

        expect($column->filterType)->toBe('select');
    });

    it('allows setting filter options', function (): void {
        $options = [
            ['value' => 'active', 'label' => 'Active'],
            ['value' => 'inactive', 'label' => 'Inactive'],
        ];
        $column = Column::make('status')->filterable()->filterOptions($options);

        expect($column->filterOptions)->toBe($options);
        expect($column->filterType)->toBe('select'); // defaults to select when options provided
    });

    it('allows setting hidden', function (): void {
        $column = Column::make('secret')->hidden();

        expect($column->hidden)->toBeTrue();
    });

    it('returns correct array representation', function (): void {
        $column = Column::make('name')
            ->label('Name')
            ->searchable()
            ->sortable()
            ->filterable()
            ->filterType('select')
            ->filterOptions([['value' => 'a', 'label' => 'A']])
            ->hidden();

        $array = $column->toArray();

        expect($array)->toBe([
            'name' => 'name',
            'label' => 'Name',
            'searchable' => true,
            'sortable' => true,
            'filterable' => true,
            'hidden' => true,
            'filter_type' => 'select',
            'filter_options' => [['value' => 'a', 'label' => 'A']],
        ]);
    });

    it('implements JsonSerializable', function (): void {
        $column = Column::make('name')->searchable();

        expect($column)->toBeInstanceOf(JsonSerializable::class);
        expect(json_encode($column))->toContain('"searchable":true');
    });

    it('each fluent method returns new instance (immutability)', function (): void {
        $original = Column::make('name');
        $modified = $original->searchable();

        expect($original->searchable)->toBeFalse();
        expect($modified->searchable)->toBeTrue();
        expect($original)->not->toBe($modified);
    });
});
