<?php

declare(strict_types=1);

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;
use Workbench\App\Models\Post;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active');
        $table->string('role')->default('user');
        $table->boolean('is_admin')->default(false);
        $table->timestamps();
        $table->softDeletes();
    });

    Schema::create('posts', function ($table): void {
        $table->id();
        $table->foreignId('user_id')->constrained()->cascadeOnDelete();
        $table->string('title');
        $table->text('body');
        $table->string('status')->default('draft');
        $table->timestamp('published_at')->nullable();
        $table->timestamps();
        $table->softDeletes();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('posts');
    Schema::dropIfExists('users');
});

function datatableRequest(
    string $search = '',
    array $sorts = [],
    array $searches = [],
    array $filters = [],
): DataTableRequest {
    return new DataTableRequest(
        1,
        25,
        $search,
        new SortCollection($sorts),
        new SearchCollection($searches),
        new FilterCollection($filters),
    );
}

function createPost(string $title, string $authorName, string $status = 'draft'): Post
{
    $user = createUser(['name' => $authorName]);

    return $user->posts()->create([
        'title' => $title,
        'body' => 'Body of '.$title,
        'status' => $status,
    ]);
}

describe('Column API: database fields', function (): void {
    it('exposes a joined column under its own key', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(
            Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name'),
            ])
            ->handle(datatableRequest());

        expect($result->paginator->total())->toBe(1);

        $row = $result->toArray()['data'][0];

        expect($row->title)->toBe('First post');
        expect($row->author_name)->toBe('Ada Lovelace');
    });

    it('searches a joined column on its database expression', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(
            Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name')->searchable(),
            ])
            ->handle(datatableRequest('Hopper'));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('sorts a joined column on its database expression', function (): void {
        createPost('First post', 'Zoe Adams');
        createPost('Second post', 'Ada Lovelace');

        $result = DataTable::query(
            Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name')->sortable(),
            ])
            ->handle(datatableRequest('', [new Sort('author_name', 'asc')]));

        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('exposes a joined column with the query builder', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(
            DB::table('posts')->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name')->searchable()->sortable(),
            ])
            ->handle(datatableRequest('Hopper', [new Sort('author_name', 'asc')]));

        expect($result->paginator->total())->toBe(1);

        $row = $result->toArray()['data'][0];

        expect($row->title)->toBe('Second post');
        expect($row->author_name)->toBe('Grace Hopper');
    });

    it('accepts an aliased database field', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(
            Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name as author_name')->searchable(),
            ])
            ->handle(datatableRequest('Hopper'));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Second post');
    });
});

describe('Column API: relationships', function (): void {
    it('exposes a relation column under its own key', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name'),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row->title)->toBe('First post');
        expect($row->author_name)->toBe('Ada Lovelace');
    });

    it('does not expose the loaded relationship in the response', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name'),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row)->not->toHaveProperty('user');
    });

    it('searches a relation column with whereHas', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->searchable(),
            ])
            ->handle(datatableRequest('Hopper'));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('searches a relation column with a column specific search', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->searchable(),
            ])
            ->handle(datatableRequest('', [], [
                new TooInfinity\InertiaDataTables\Searching\Search('author_name', 'Lovelace'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('First post');
    });

    it('sorts a relation column with a correlated subquery', function (): void {
        createPost('First post', 'Zoe Adams');
        createPost('Second post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->sortable(),
            ])
            ->handle(datatableRequest('', [new Sort('author_name', 'asc')]));

        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('filters a relation column', function (): void {
        createPost('First post', 'Ada Lovelace');
        createPost('Second post', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->filterable(),
            ])
            ->handle(datatableRequest('', [], [], [
                new TooInfinity\InertiaDataTables\Filtering\Filter('author_name', 'Grace Hopper'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('rejects a relation column on a query builder', function (): void {
        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => DataTable::query(DB::table('posts'))
            ->columns([
                Column::make('author_name')->relation('user', 'name')->searchable(),
            ])
            ->handle(datatableRequest('Ada')))
            ->toThrow(InvalidColumnException::class, 'requires an Eloquent query');
    });

    it('rejects an unknown relationship', function (): void {
        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => DataTable::query(Post::query())
            ->columns([
                Column::make('author_name')->relation('missing', 'name')->searchable(),
            ])
            ->handle(datatableRequest('Ada')))
            ->toThrow(InvalidColumnException::class, 'unknown relationship');
    });
});

describe('Column API: computed columns', function (): void {
    it('exposes a computed value under the column key', function (): void {
        createPost('First post', 'Ada Lovelace', 'published');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('summary')->value(fn (Post $post): string => $post->title.' ('.$post->status.')'),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row->summary)->toBe('First post (published)');
    });

    it('exposes a computed value with the query builder', function (): void {
        createPost('First post', 'Ada Lovelace', 'published');

        $result = DataTable::query(DB::table('posts'))
            ->columns([
                Column::make('title'),
                Column::make('summary')->value(fn (object $row): string => $row->title.' ('.$row->status.')'),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row->summary)->toBe('First post (published)');
    });

    it('searches a computed column with a custom callback', function (): void {
        createPost('Alpha', 'Ada Lovelace');
        createPost('Beta', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('title_length')
                    ->searchable()
                    ->searchUsing(fn (EloquentBuilder $query, string $term): EloquentBuilder => $query->whereRaw('LENGTH(title) = ?', [(int) $term]))
                    ->value(fn (Post $post): int => strlen($post->title)),
            ])
            ->handle(datatableRequest('5'));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Alpha');
    });

    it('sorts a computed column with a custom callback', function (): void {
        createPost('A', 'Ada Lovelace');
        createPost('BBBB', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('title_length')
                    ->sortable()
                    ->sortUsing(fn (EloquentBuilder $query, string $direction): EloquentBuilder => $query->orderByRaw('LENGTH(title) '.$direction))
                    ->value(fn (Post $post): int => strlen($post->title)),
            ])
            ->handle(datatableRequest('', [new Sort('title_length', 'asc')]));

        expect($result->paginator->first()->title)->toBe('A');
    });

    it('filters a computed column with a custom callback', function (): void {
        createPost('Alpha', 'Ada Lovelace');
        createPost('Beta', 'Grace Hopper');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('title_length')
                    ->filterable()
                    ->filterUsing(fn (EloquentBuilder $query, mixed $value): EloquentBuilder => $query->whereRaw('LENGTH(title) = ?', [(int) $value]))
                    ->value(fn (Post $post): int => strlen($post->title)),
            ])
            ->handle(datatableRequest('', [], [], [
                new TooInfinity\InertiaDataTables\Filtering\Filter('title_length', '5'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Alpha');
    });

    it('filters a computed column with a custom callback on the query builder', function (): void {
        createPost('Alpha', 'Ada Lovelace');
        createPost('Beta', 'Grace Hopper');

        $result = DataTable::query(DB::table('posts'))
            ->columns([
                Column::make('title'),
                Column::make('title_length')
                    ->filterable()
                    ->filterUsing(fn (QueryBuilder $query, mixed $value): QueryBuilder => $query->whereRaw('LENGTH(title) = ?', [(int) $value]))
                    ->value(fn (object $row): int => strlen((string) $row->title)),
            ])
            ->handle(datatableRequest('', [], [], [
                new TooInfinity\InertiaDataTables\Filtering\Filter('title_length', '4'),
            ]));

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Beta');
    });
});

describe('Column API: column validation', function (): void {
    it('still rejects unknown columns', function (): void {
        createPost('First post', 'Ada Lovelace');

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => DataTable::query(Post::query())
            ->columns([
                Column::make('title')->sortable(),
            ])
            ->handle(datatableRequest('', [new Sort('unknown', 'asc')])))
            ->toThrow(TooInfinity\InertiaDataTables\Exceptions\InvalidSortException::class);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => DataTable::query(Post::query())
            ->columns([
                Column::make('title')->searchable(),
            ])
            ->handle(datatableRequest('', [], [
                new TooInfinity\InertiaDataTables\Searching\Search('unknown', 'value'),
            ])))
            ->toThrow(InvalidColumnException::class);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => DataTable::query(Post::query())
            ->columns([
                Column::make('title')->filterable(),
            ])
            ->handle(datatableRequest('', [], [], [
                new TooInfinity\InertiaDataTables\Filtering\Filter('unknown', 'value'),
            ])))
            ->toThrow(TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException::class);
    });

    it('does not expose attributes that are not declared', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name'),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row)->not->toHaveProperty('body');
        expect($row)->not->toHaveProperty('user_id');
    });

    it('keeps computed values when every attribute is exposed', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('summary')->value(fn (Post $post): string => $post->title.' ('.$post->status.')'),
            ])
            ->exposeAll()
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row->summary)->toBe('First post (draft)');
        expect($row->body)->toBe('Body of First post');
    });

    it('exposes hidden relation columns in the response data', function (): void {
        createPost('First post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->hidden(),
            ])
            ->handle(datatableRequest());

        $row = $result->toArray()['data'][0];

        expect($row->author_name)->toBe('Ada Lovelace');
        expect($result->columns[1]['hidden'])->toBeTrue();
    });

    it('sorts by a relation column with the default sort', function (): void {
        createPost('First post', 'Zoe Adams');
        createPost('Second post', 'Ada Lovelace');

        $result = DataTable::query(Post::query())
            ->columns([
                Column::make('title'),
                Column::make('author_name')->relation('user', 'name')->sortable(),
            ])
            ->defaultSort('author_name', 'asc')
            ->handle(datatableRequest());

        expect($result->paginator->first()->title)->toBe('Second post');
    });

    it('sorts by a database field with the default sort', function (): void {
        createPost('First post', 'Zoe Adams');
        createPost('Second post', 'Ada Lovelace');

        $result = DataTable::query(
            Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
        )
            ->columns([
                Column::make('title'),
                Column::make('author_name')->field('users.name')->sortable(),
            ])
            ->defaultSort('author_name', 'asc')
            ->handle(datatableRequest());

        expect($result->paginator->first()->title)->toBe('Second post');
    });
});
