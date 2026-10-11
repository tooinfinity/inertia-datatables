<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use Workbench\App\Models\Post;
use Workbench\App\Models\User;

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

describe('Integration: Eloquent Scopes', function (): void {
    it('works with global scope', function (): void {
        // Add a global scope to User model for testing
        User::addGlobalScope('active', function ($query): void {
            $query->where('status', 'active');
        });

        createUser(['name' => 'Active User', 'status' => 'active']);
        createUser(['name' => 'Inactive User', 'status' => 'inactive']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = DataTable::query(User::query())
            ->columns($columns)
            ->handle($request);

        // Global scope should filter to only active users
        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('Active User');

        // Clean up
        User::withoutGlobalScope('active');
    });

    it('works with local scope applied before DataTable', function (): void {
        // Create users
        createUser(['name' => 'Admin User', 'role' => 'admin']);
        createUser(['name' => 'Regular User', 'role' => 'user']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('role')->filterable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Apply local scope before DataTable
        $result = DataTable::query(User::query()->where('role', 'admin'))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->role)->toBe('admin');
    });

    it('combines global scope with DataTable filters', function (): void {
        User::addGlobalScope('active', function ($query): void {
            $query->where('status', 'active');
        });

        createUser(['name' => 'Active Admin', 'status' => 'active', 'role' => 'admin']);
        createUser(['name' => 'Active User', 'status' => 'active', 'role' => 'user']);
        createUser(['name' => 'Inactive Admin', 'status' => 'inactive', 'role' => 'admin']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('role')->filterable()->sortable(),
        ];

        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('role', 'admin')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = DataTable::query(User::query())
            ->columns($columns)
            ->handle($request);

        // Global scope (active) + DataTable filter (role=admin) = 1 result
        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('Active Admin');

        User::withoutGlobalScope('active');
    });
});

describe('Integration: Relationships', function (): void {
    it('works with eager loaded relationships', function (): void {
        $user = createUser(['name' => 'John', 'email' => 'john@example.com']);
        $user->posts()->create(['title' => 'Post 1', 'body' => 'Content 1']);
        $user->posts()->create(['title' => 'Post 2', 'body' => 'Content 2']);

        $otherUser = createUser(['name' => 'Jane', 'email' => 'jane@example.com']);
        $otherUser->posts()->create(['title' => 'Post 3', 'body' => 'Content 3']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Eager load posts relationship
        $result = DataTable::query(User::query()->with('posts'))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(2);
        // Verify relationship is loaded
        expect($result->paginator->first()->relationLoaded('posts'))->toBeTrue();
    });

    it('works with has() relationship filter', function (): void {
        $user = createUser(['name' => 'John']);
        $user->posts()->create(['title' => 'Post 1', 'body' => 'Content 1']);

        createUser(['name' => 'Jane']); // No posts

        $columns = [
            Column::make('name')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Filter users who have posts
        $result = DataTable::query(User::query()->has('posts'))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });

    it('works with whereHas() relationship filter', function (): void {
        $user = createUser(['name' => 'John']);
        $user->posts()->create(['title' => 'Published Post', 'body' => 'Content', 'status' => 'published']);

        $user2 = createUser(['name' => 'Jane']);
        $user2->posts()->create(['title' => 'Draft Post', 'body' => 'Content', 'status' => 'draft']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Filter users who have published posts
        $result = DataTable::query(User::query()->whereHas('posts', function ($q): void {
            $q->where('status', 'published');
        }))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });
});

describe('Integration: Soft Deletes', function (): void {
    it('excludes soft deleted records by default', function (): void {
        $user = createUser(['name' => 'Active User']);
        $deletedUser = createUser(['name' => 'Deleted User']);
        $deletedUser->delete();

        $columns = [
            Column::make('name')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = DataTable::query(User::query())
            ->columns($columns)
            ->handle($request);

        // Soft deleted should be excluded
        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('Active User');
    });

    it('includes soft deleted with withTrashed()', function (): void {
        $user = createUser(['name' => 'Active User']);
        $deletedUser = createUser(['name' => 'Deleted User']);
        $deletedUser->delete();

        $columns = [
            Column::make('name')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = DataTable::query(User::withTrashed())
            ->columns($columns)
            ->handle($request);

        // withTrashed() should include soft deleted
        expect($result->paginator->total())->toBe(2);
    });

    it('shows only soft deleted with onlyTrashed()', function (): void {
        $user = createUser(['name' => 'Active User']);
        $deletedUser = createUser(['name' => 'Deleted User']);
        $deletedUser->delete();

        $columns = [
            Column::make('name')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = DataTable::query(User::onlyTrashed())
            ->columns($columns)
            ->handle($request);

        // onlyTrashed() should show only soft deleted
        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('Deleted User');
    });

    it('works with soft deletes and filters', function (): void {
        $user = createUser(['name' => 'Active Admin', 'status' => 'active']);
        $user2 = createUser(['name' => 'Inactive User', 'status' => 'inactive']);
        $deletedUser = createUser(['name' => 'Deleted Admin', 'status' => 'active']);
        $deletedUser->delete();

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ];

        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'active')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        // Default query (excludes soft deleted) + filter
        $result = DataTable::query(User::query())
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('Active Admin');

        // withTrashed + filter
        $resultWithTrashed = DataTable::query(User::withTrashed())
            ->columns($columns)
            ->handle($request);

        expect($resultWithTrashed->paginator->total())->toBe(2);
    });

    it('works with soft deletes on related model', function (): void {
        $user = createUser(['name' => 'John']);
        $post = $user->posts()->create(['title' => 'Active Post', 'body' => 'Content', 'status' => 'published']);
        $deletedPost = $user->posts()->create(['title' => 'Deleted Post', 'body' => 'Content', 'status' => 'draft']);
        $deletedPost->delete();

        $columns = [
            Column::make('title')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Query posts with soft deletes
        $result = DataTable::query(Post::query())
            ->columns($columns)
            ->handle($request);

        // Should exclude soft deleted post
        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->title)->toBe('Active Post');
    });

    it('includes soft deleted posts with withTrashed()', function (): void {
        $user = createUser(['name' => 'John']);
        $post = $user->posts()->create(['title' => 'Active Post', 'body' => 'Content', 'status' => 'published']);
        $deletedPost = $user->posts()->create(['title' => 'Deleted Post', 'body' => 'Content', 'status' => 'draft']);
        $deletedPost->delete();

        $columns = [
            Column::make('title')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = DataTable::query(Post::withTrashed())
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(2);
    });
});

describe('Integration: Select Columns', function (): void {
    it('works with select() on query', function (): void {
        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@example.com']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Select only specific columns
        $result = DataTable::query(User::query()->select('id', 'name'))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(2);
        expect($result->paginator->first()->name)->toBe('John');
        // email should not be loaded
        expect($result->paginator->first()->getAttributes())->not->toHaveKey('email');
    });

    it('works with select() and global search', function (): void {
        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@example.com']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ];

        $request = new DataTableRequest(1, 25, 'john', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Select only specific columns but search on both
        $result = DataTable::query(User::query()->select('id', 'name', 'email'))
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });
});

describe('Integration: Group By / Having', function (): void {
    it('works with groupBy on query', function (): void {
        $user = createUser(['name' => 'John']);
        $user->posts()->create(['title' => 'Post 1', 'body' => 'Content', 'status' => 'published']);
        $user->posts()->create(['title' => 'Post 2', 'body' => 'Content', 'status' => 'published']);
        $user->posts()->create(['title' => 'Post 3', 'body' => 'Content', 'status' => 'draft']);

        $columns = [
            Column::make('user_id')->sortable(),
            Column::make('posts_count')->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Group posts by user_id
        $result = DataTable::query(
            Post::query()
                ->selectRaw('user_id, count(*) as posts_count')
                ->groupBy('user_id')
        )
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->posts_count)->toBe(3);
    });
});

describe('Integration: Complex Queries', function (): void {
    it('works with subquery in select', function (): void {
        $user = createUser(['name' => 'John']);
        $user->posts()->create(['title' => 'Post 1', 'body' => 'Content']);
        $user->posts()->create(['title' => 'Post 2', 'body' => 'Content']);

        $user2 = createUser(['name' => 'Jane']);

        $columns = [
            Column::make('name')->searchable()->sortable(),
            Column::make('posts_count')->sortable(),
        ];

        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        // Subquery to count posts
        $result = DataTable::query(
            User::query()
                ->select('users.*')
                ->selectSub(function ($query): void {
                    $query->from('posts')
                        ->whereRaw('posts.user_id = users.id')
                        ->selectRaw('count(*)');
                }, 'posts_count')
        )
            ->columns($columns)
            ->handle($request);

        expect($result->paginator->total())->toBe(2);
        $john = collect($result->paginator->items())->firstWhere('name', 'John');
        $jane = collect($result->paginator->items())->firstWhere('name', 'Jane');
        expect($john->posts_count)->toBe(2);
        expect($jane->posts_count)->toBe(0);
    });
});
