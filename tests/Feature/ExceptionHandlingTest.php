<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Log;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use Workbench\App\Models\User;

it('renders invalid request parameters as unprocessable validation errors', function (string $query, string $message): void {
    makeTestRoute('/exception-handling', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->filterable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('created_at')->filterable()->filterType('date_range'),
    ]);

    $response = $this->getJson('/exception-handling?'.$query);

    $response->assertUnprocessable();
    $response->assertJsonPath('message', $message);
    $response->assertJsonPath('errors.query.0', $message);
})->with([
    'unknown sort column' => [
        'sort=unknown_column',
        'Column [unknown_column] is not sortable.',
    ],
    'non-sortable column' => [
        'sort=email',
        'Column [email] is not sortable.',
    ],
    'unknown filter column' => [
        'filters[unknown_column]=value',
        'Column [unknown_column] is not filterable.',
    ],
    'non-filterable column' => [
        'filters[name]=john',
        'Column [name] is not filterable.',
    ],
    'overlong range bound' => [
        'filters[created_at][from]='.str_repeat('a', 501),
        'Invalid filter value for column [created_at]: "'.str_repeat('a', 501).'"',
    ],
    'unknown search column' => [
        'searches[unknown_column]=john',
        'Column [unknown_column] is not allowed for search.',
    ],
    'non-searchable column' => [
        'searches[email]=john',
        'Column [email] is not allowed for search.',
    ],
]);

it('redirects Inertia requests back with validation errors', function (): void {
    makeTestRoute('/inertia-exception-handling', [
        Column::make('name')->searchable()->sortable(),
    ]);

    $response = $this
        ->withHeaders([
            'X-Inertia' => 'true',
            'Referer' => '/users',
        ])
        ->get('/inertia-exception-handling?sort=unknown_column');

    $response->assertRedirect('/users');
    $response->assertSessionHasErrors('query');
    expect(session('errors')->first('query'))
        ->toBe('Column [unknown_column] is not sortable.');
});

it('does not report invalid request parameters as server errors', function (): void {
    Log::spy();

    makeTestRoute('/exception-reporting', [
        Column::make('name')->searchable()->sortable(),
    ]);

    $this->getJson('/exception-reporting?sort=unknown_column')
        ->assertUnprocessable();

    Log::shouldNotHaveReceived('error');
    Log::shouldNotHaveReceived('critical');
    Log::shouldNotHaveReceived('emergency');
});

it('allows package exception handling to be disabled', function (): void {
    config()->set('inertia-datatables.handle_exceptions', false);
    Log::spy();

    makeTestRoute('/exception-handling-disabled', [
        Column::make('name')->searchable()->sortable(),
    ]);

    $this->getJson('/exception-handling-disabled?sort=unknown_column')
        ->assertStatus(500);

    Log::shouldHaveReceived('error');
});

it('keeps invalid default sort columns as developer-facing exceptions', function (): void {
    expect(fn (): DataTable => DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable(),
            Column::make('email')->sortable(),
        ])
        ->defaultSort('name'))
        ->toThrow(InvalidSortException::class, 'Column [name] is not sortable.');
});

it('keeps invalid default sort directions as developer-facing exceptions', function (): void {
    expect(fn (): DataTable => DataTable::query(User::query())
        ->defaultSort('name', 'invalid'))
        ->toThrow(InvalidSortException::class, 'Invalid sort direction [invalid]. Expected "asc" or "desc".');
});
