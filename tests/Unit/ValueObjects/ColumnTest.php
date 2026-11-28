<?php

declare(strict_types=1);

use TooInfinity\InertiaDataTables\Column;

enum TestPostStatus: string
{
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
}

enum TestPostPriority: int
{
    case Low = 1;
    case Medium = 2;
    case High = 3;
}

enum TestPostVisibility
{
    case Public;
    case Private;
}

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

    describe('filterEnum', function (): void {
        it('derives select options from a string-backed enum', function (): void {
            $column = Column::make('status')->filterable()->filterEnum(TestPostStatus::class);

            expect($column->filterType)->toBe('select');
            expect($column->filterOptions)->toBe([
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'published', 'label' => 'Published'],
                ['value' => 'archived', 'label' => 'Archived'],
            ]);
        });

        it('derives select options from an integer-backed enum', function (): void {
            $column = Column::make('priority')->filterable()->filterEnum(TestPostPriority::class);

            expect($column->filterType)->toBe('select');
            expect($column->filterOptions)->toBe([
                ['value' => 1, 'label' => 'Low'],
                ['value' => 2, 'label' => 'Medium'],
                ['value' => 3, 'label' => 'High'],
            ]);
        });

        it('overrides labels with a backed value map', function (): void {
            $column = Column::make('status')->filterable()->filterEnum(TestPostStatus::class, [
                'draft' => 'Brouillon',
                'published' => 'Publié',
            ]);

            expect($column->filterOptions)->toBe([
                ['value' => 'draft', 'label' => 'Brouillon'],
                ['value' => 'published', 'label' => 'Publié'],
                ['value' => 'archived', 'label' => 'Archived'],
            ]);
        });

        it('overrides labels with a label resolver', function (): void {
            $column = Column::make('status')->filterable()->filterEnum(
                TestPostStatus::class,
                null,
                fn (TestPostStatus $case): string => 'Status: '.$case->name,
            );

            expect($column->filterOptions)->toBe([
                ['value' => 'draft', 'label' => 'Status: Draft'],
                ['value' => 'published', 'label' => 'Status: Published'],
                ['value' => 'archived', 'label' => 'Status: Archived'],
            ]);
        });

        it('prefers the label resolver over the value map', function (): void {
            $column = Column::make('status')->filterable()->filterEnum(
                TestPostStatus::class,
                ['draft' => 'Map'],
                fn (): string => 'Resolver',
            );

            expect($column->filterOptions[0]['label'])->toBe('Resolver');
        });

        it('preserves the backed value type in the JSON representation', function (): void {
            $column = Column::make('priority')->filterable()->filterEnum(TestPostPriority::class);

            expect(json_decode(json_encode($column->filterOptions), true))->toBe([
                ['value' => 1, 'label' => 'Low'],
                ['value' => 2, 'label' => 'Medium'],
                ['value' => 3, 'label' => 'High'],
            ]);
        });

        it('returns a new immutable instance', function (): void {
            $original = Column::make('status');
            $modified = $original->filterEnum(TestPostStatus::class);

            expect($original->filterOptions)->toBe([]);
            expect($modified->filterOptions)->not->toBe([]);
            expect($original)->not->toBe($modified);
        });

        it('throws when the class does not exist', function (): void {
            expect(fn (): mixed => Column::make('status')->filterEnum(stdClass::class))
                ->toThrow(InvalidArgumentException::class, 'does not exist');
        });

        it('throws when the class is a unit enum', function (): void {
            expect(fn (): mixed => Column::make('visibility')->filterEnum(TestPostVisibility::class))
                ->toThrow(InvalidArgumentException::class, 'is not a backed enum');
        });
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
            'align' => 'left',
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

    it('defaults alignment to left', function (): void {
        $column = Column::make('name');

        expect($column->align)->toBe('left');
    });

    it('allows setting alignment to left', function (): void {
        $column = Column::make('name')->align('left');

        expect($column->align)->toBe('left');
    });

    it('allows setting alignment to center', function (): void {
        $column = Column::make('name')->align('center');

        expect($column->align)->toBe('center');
    });

    it('allows setting alignment to right', function (): void {
        $column = Column::make('name')->align('right');

        expect($column->align)->toBe('right');
    });

    it('rejects unsupported alignment values', function (): void {
        expect(fn (): mixed => Column::make('name')->align('justify'))
            ->toThrow(InvalidArgumentException::class, 'not supported');
    });

    it('rejects unsupported alignment passed directly to the constructor', function (): void {
        expect(fn (): mixed => new Column('balance', 'Balance', align: 'justify'))
            ->toThrow(InvalidArgumentException::class, 'not supported');
    });

    it('includes alignment in the array representation', function (): void {
        $column = Column::make('balance')->align('right');

        expect($column->toArray()['align'])->toBe('right');
    });

    it('includes alignment in the JSON representation', function (): void {
        $column = Column::make('status')->align('center');

        expect(json_decode(json_encode($column), true)['align'])->toBe('center');
    });

    it('preserves alignment when another property is changed', function (): void {
        $column = Column::make('balance')->align('right')->label('Balance');

        expect($column->align)->toBe('right');
        expect($column->label)->toBe('Balance');
    });

    it('returns a new immutable instance when setting alignment', function (): void {
        $original = Column::make('name');
        $modified = $original->align('center');

        expect($original->align)->toBe('left');
        expect($modified->align)->toBe('center');
        expect($original)->not->toBe($modified);
    });

    it('keeps alignment when constructed positionally without alignment', function (): void {
        $column = new Column('name', 'Name');

        expect($column->align)->toBe('left');
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
            'align' => 'left',
        ]);
    });
});
