<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\QueryConfig;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active');
        $table->timestamps();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

it('creates DataTableRequest from HTTP query parameters', function (): void {
    $request = Request::create('/test?page=2&per_page=10&search=john&sort=-name&searches[name]=john&searches[email]=example&filters[status]=active');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->page)->toBe(2);
    expect($dataTableRequest->perPage)->toBe(10);
    expect($dataTableRequest->search)->toBe('john');
    expect($dataTableRequest->sorts->all())->toHaveCount(1);
    expect($dataTableRequest->sorts->first()?->column)->toBe('name');
    expect($dataTableRequest->sorts->first()?->direction)->toBe('desc');
    expect($dataTableRequest->searches->all())->toHaveCount(2);
    expect($dataTableRequest->filters->all())->toHaveCount(1);
    expect($dataTableRequest->filters->get('status')?->value)->toBe('active');
});

it('handles default values when query parameters are missing', function (): void {
    $request = Request::create('/test');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->page)->toBe(1);
    expect($dataTableRequest->perPage)->toBe(25); // default_per_page
    expect($dataTableRequest->search)->toBe('');
    expect($dataTableRequest->sorts->isEmpty())->toBeTrue();
    expect($dataTableRequest->searches->isEmpty())->toBeTrue();
    expect($dataTableRequest->filters->isEmpty())->toBeTrue();
});

it('enforces max_per_page limit', function (): void {
    $request = Request::create('/test?per_page=10000');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->perPage)->toBe(100); // max_per_page
});

it('handles searches parameter in both array and bracket notation', function (): void {
    // Array format: searches[name]=john
    $request1 = Request::create('/test?searches[name]=john&searches[email]=example');
    $dataTableRequest1 = DataTableRequest::fromRequest($request1);

    expect($dataTableRequest1->searches->all())->toHaveCount(2);

    // Bracket notation in keys: search[name]=john
    $request2 = Request::create('/test?search[name]=john&search[email]=example');
    $queryConfig = new QueryConfig(searches: 'search');
    $dataTableRequest2 = DataTableRequest::fromRequest($request2, $queryConfig);

    expect($dataTableRequest2->searches->all())->toHaveCount(2);
});

it('deduplicates searches by column name (last occurrence wins)', function (): void {
    $request = Request::create('/test?searches[name]=first&searches[name]=second');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->searches->all())->toHaveCount(1);
    expect($dataTableRequest->searches->get('name')?->value)->toBe('second');
});

it('handles multiple sort columns', function (): void {
    $request = Request::create('/test?sort=name,-email,created_at');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->sorts->all())->toHaveCount(3);
    expect($dataTableRequest->sorts->all()[0]->column)->toBe('name');
    expect($dataTableRequest->sorts->all()[0]->direction)->toBe('asc');
    expect($dataTableRequest->sorts->all()[1]->column)->toBe('email');
    expect($dataTableRequest->sorts->all()[1]->direction)->toBe('desc');
    expect($dataTableRequest->sorts->all()[2]->column)->toBe('created_at');
    expect($dataTableRequest->sorts->all()[2]->direction)->toBe('asc');
});

it('handles filters with various value types', function (): void {
    $request = Request::create('/test?filters[status]=active&filters[is_admin]=1&filters[deleted_at]=null&filters[not_deleted]=not_null');

    $dataTableRequest = DataTableRequest::fromRequest($request);

    expect($dataTableRequest->filters->all())->toHaveCount(4);
    expect($dataTableRequest->filters->get('status')?->value)->toBe('active');
    expect($dataTableRequest->filters->get('is_admin')?->value)->toBe('1');
    expect($dataTableRequest->filters->get('deleted_at')?->value)->toBe('null');
    expect($dataTableRequest->filters->get('not_deleted')?->value)->toBe('not_null');
});

it('handles custom QueryConfig parameter names', function (): void {
    $request = Request::create('/test?p=3&pp=15&q=test&s=-name&se[name]=john&fi[status]=active');
    $queryConfig = new QueryConfig(
        page: 'p',
        perPage: 'pp',
        search: 'q',
        searches: 'se',
        sort: 's',
        filters: 'fi'
    );

    $dataTableRequest = DataTableRequest::fromRequest($request, $queryConfig);

    expect($dataTableRequest->page)->toBe(3);
    expect($dataTableRequest->perPage)->toBe(15);
    expect($dataTableRequest->search)->toBe('test');
    expect($dataTableRequest->sorts->first()?->column)->toBe('name');
    expect($dataTableRequest->sorts->first()?->direction)->toBe('desc');
    expect($dataTableRequest->searches->get('name')?->value)->toBe('john');
    expect($dataTableRequest->filters->get('status')?->value)->toBe('active');
});

it('serializes DataTableRequest to array correctly', function (): void {
    $request = Request::create('/test?page=2&per_page=10&search=john&sort=-name&searches[name]=john&filters[status]=active');
    $dataTableRequest = DataTableRequest::fromRequest($request);

    $array = $dataTableRequest->toArray();

    expect($array)->toBeArray();
    expect($array['page'])->toBe(2);
    expect($array['per_page'])->toBe(10);
    expect($array['search'])->toBe('john');
    expect($array['sort'])->toHaveCount(1);
    expect($array['sort'][0]['column'])->toBe('name');
    expect($array['sort'][0]['direction'])->toBe('desc');
    expect($array['searches'])->toHaveCount(1);
    expect($array['searches'][0]['column'])->toBe('name');
    expect($array['searches'][0]['value'])->toBe('john');
    expect($array['filters'])->toHaveCount(1);
    expect($array['filters'][0]['column'])->toBe('status');
    expect($array['filters'][0]['value'])->toBe('active');
});

it('jsonSerializes DataTableRequest correctly', function (): void {
    $request = Request::create('/test?page=1&per_page=25&search=test');
    $dataTableRequest = DataTableRequest::fromRequest($request);

    $json = json_encode($dataTableRequest);
    $decoded = json_decode($json, true);

    expect($decoded['page'])->toBe(1);
    expect($decoded['per_page'])->toBe(25);
    expect($decoded['search'])->toBe('test');
});
