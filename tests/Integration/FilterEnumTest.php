<?php

declare(strict_types=1);

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Filtering\Filter;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

enum IntegrationPostStatus: string
{
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
}

enum IntegrationPostPriority: int
{
    case Low = 1;
    case Medium = 2;
    case High = 3;
}

function enumDatatableRequest(array $filters = []): DataTableRequest
{
    return new DataTableRequest(
        1,
        25,
        '',
        new SortCollection,
        new SearchCollection,
        new FilterCollection($filters),
    );
}

describe('BackedEnum select filters', function (): void {
    $fixture = new class extends Model
    {
        protected $table = 'posts';

        protected $casts = [
            'status' => IntegrationPostStatus::class,
            'priority' => IntegrationPostPriority::class,
        ];

        /** @var array<int, string> */
        protected $fillable = ['title', 'body', 'status', 'priority'];
    };

    beforeEach(function () use ($fixture): void {
        Schema::create('posts', function ($table): void {
            $table->id();
            $table->string('title');
            $table->text('body');
            $table->string('status')->default('draft');
            $table->unsignedTinyInteger('priority')->default(1);
            $table->timestamps();
            $table->softDeletes();
        });

        $fixture::query()->create(['title' => 'Draft post', 'body' => '...', 'status' => 'draft', 'priority' => 1]);
        $fixture::query()->create(['title' => 'Published post', 'body' => '...', 'status' => 'published', 'priority' => 2]);
        $fixture::query()->create(['title' => 'Archived post', 'body' => '...', 'status' => 'archived', 'priority' => 3]);
    });

    afterEach(function (): void {
        Schema::dropIfExists('posts');
    });

    it('exposes select options derived from a string-backed enum', function () use ($fixture): void {
        $result = DataTable::query($fixture::query())
            ->columns([
                Column::make('title'),
                Column::make('status')->filterable()->filterEnum(IntegrationPostStatus::class),
            ])
            ->handle(enumDatatableRequest());

        expect($result->columns[1]['filter_type'])->toBe('select');
        expect($result->columns[1]['filter_options'])->toBe([
            ['value' => 'draft', 'label' => 'Draft'],
            ['value' => 'published', 'label' => 'Published'],
            ['value' => 'archived', 'label' => 'Archived'],
        ]);
    });

    it('exposes select options derived from an integer-backed enum', function () use ($fixture): void {
        $result = DataTable::query($fixture::query())
            ->columns([
                Column::make('priority')->filterable()->filterEnum(IntegrationPostPriority::class),
            ])
            ->handle(enumDatatableRequest());

        expect($result->columns[0]['filter_options'])->toBe([
            ['value' => 1, 'label' => 'Low'],
            ['value' => 2, 'label' => 'Medium'],
            ['value' => 3, 'label' => 'High'],
        ]);
    });

    it('preserves the backed value type (string or integer) in filter options', function () use ($fixture): void {
        $status = DataTable::query($fixture::query())
            ->columns([Column::make('status')->filterable()->filterEnum(IntegrationPostStatus::class)])
            ->handle(enumDatatableRequest())->columns[0]['filter_options'];

        $priority = DataTable::query($fixture::query())
            ->columns([Column::make('priority')->filterable()->filterEnum(IntegrationPostPriority::class)])
            ->handle(enumDatatableRequest())->columns[0]['filter_options'];

        expect($status[0]['value'])->toBe('draft');
        expect(is_int($status[0]['value']))->toBeFalse();
        expect($priority[0]['value'])->toBe(1);
        expect(is_int($priority[0]['value']))->toBeTrue();
    });

    it('filters rows by a string-backed enum value', function () use ($fixture): void {
        $result = DataTable::query($fixture::query())
            ->columns([
                Column::make('title'),
                Column::make('status')->filterable()->filterEnum(IntegrationPostStatus::class),
            ])
            ->handle(enumDatatableRequest([
                new Filter('status', 'draft'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Draft post');
    });

    it('filters rows by an integer-backed enum value', function () use ($fixture): void {
        $result = DataTable::query($fixture::query())
            ->columns([
                Column::make('title'),
                Column::make('priority')->filterable()->filterEnum(IntegrationPostPriority::class),
            ])
            ->handle(enumDatatableRequest([
                new Filter('priority', 2),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Published post');
    });

    it('filters an Eloquent enum-cast attribute', function () use ($fixture): void {
        $post = $fixture::query()->where('status', 'draft')->first();

        expect($post->status)->toBeInstanceOf(IntegrationPostStatus::class);
        expect($post->status->value)->toBe('draft');

        $result = DataTable::query($fixture::query())
            ->columns([
                Column::make('title'),
                Column::make('status')->filterable()->filterEnum(IntegrationPostStatus::class),
            ])
            ->handle(enumDatatableRequest([
                new Filter('status', 'published'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Published post');
    });

    it('rejects submitted values that are not enum backed values', function () use ($fixture): void {
        expect(fn (): mixed => DataTable::query($fixture::query())
            ->columns([
                Column::make('status')->filterable()->filterEnum(IntegrationPostStatus::class),
            ])
            ->handle(enumDatatableRequest([
                new Filter('status', 'invalid'),
            ])))
            ->toThrow(InvalidFilterException::class, 'Invalid filter value for column [status]');
    });
});
