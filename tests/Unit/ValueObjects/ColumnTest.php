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

    it('keeps every property when another property is changed', function (): void {
        $column = Column::make('name')
            ->searchable()
            ->sortable()
            ->filterable()
            ->filterType('select')
            ->filterOptions([['value' => 'a', 'label' => 'A']])
            ->hidden()
            ->label('Full Name');

        expect($column->name)->toBe('name');
        expect($column->label)->toBe('Full Name');
        expect($column->searchable)->toBeTrue();
        expect($column->sortable)->toBeTrue();
        expect($column->filterable)->toBeTrue();
        expect($column->hidden)->toBeTrue();
        expect($column->filterType)->toBe('select');
        expect($column->filterOptions)->toBe([['value' => 'a', 'label' => 'A']]);
    });

    it('allows setting a database field', function (): void {
        $column = Column::make('author_name')->field('users.name');

        expect($column->field)->toBe('users.name');
        expect($column->name)->toBe('author_name');
    });

    it('allows setting a relationship', function (): void {
        $column = Column::make('author_name')->relation('author', 'name');

        expect($column->relation)->toBe('author');
        expect($column->relationColumn)->toBe('name');
    });

    it('allows setting a relationship without a column', function (): void {
        $column = Column::make('author')->relation('author');

        expect($column->relation)->toBe('author');
        expect($column->relationColumn)->toBeNull();
    });

    it('allows setting custom search, sort and filter callbacks', function (): void {
        $search = fn ($query, string $term) => $query;
        $sort = fn ($query, string $direction) => $query;
        $filter = fn ($query, $value) => $query;
        $value = fn ($row) => $row;

        $column = Column::make('full_name')
            ->searchUsing($search)
            ->sortUsing($sort)
            ->filterUsing($filter)
            ->value($value);

        expect($column->searchUsing)->toBe($search);
        expect($column->sortUsing)->toBe($sort);
        expect($column->filterUsing)->toBe($filter);
        expect($column->value)->toBe($value);
    });

    it('does not expose the internal column details in the array representation', function (): void {
        $column = Column::make('author_name')
            ->field('users.name')
            ->relation('author', 'name')
            ->value(fn ($row) => $row);

        expect($column->toArray())->toBe([
            'name' => 'author_name',
            'label' => 'Author Name',
            'searchable' => false,
            'sortable' => false,
            'filterable' => false,
            'hidden' => false,
            'filter_type' => null,
            'filter_options' => [],
        ]);
    });
});
