<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Filtering;

use ArrayIterator;
use Countable;
use Illuminate\Http\Request;
use IteratorAggregate;

final readonly class FilterCollection implements Countable, IteratorAggregate
{
    /**
     * @param  array<int, Filter>  $filters
     */
    public function __construct(
        private array $filters = [],
    ) {}

    /**
     * @param  array<int, Filter>  $filters
     */
    public static function make(array $filters = []): self
    {
        return new self($filters);
    }

    public static function fromRequest(Request $request, string $filterParameter): self
    {
        $filters = [];
        $filtersInput = $request->query($filterParameter, []);

        if (! is_array($filtersInput)) {
            return new self;
        }

        foreach ($filtersInput as $column => $value) {
            if ($value === '' || $value === null) {
                continue;
            }

            $filters[] = Filter::make($column, $value);
        }

        return new self($filters);
    }

    /**
     * @return array<int, Filter>
     */
    public function all(): array
    {
        return $this->filters;
    }

    public function get(string $column): ?Filter
    {
        foreach ($this->filters as $filter) {
            if ($filter->column === $column) {
                return $filter;
            }
        }

        return null;
    }

    public function has(string $column): bool
    {
        return $this->get($column) instanceof Filter;
    }

    public function getValue(string $column): mixed
    {
        $filter = $this->get($column);

        return $filter?->value;
    }

    /**
     * @return ArrayIterator<int, Filter>
     */
    public function getIterator(): ArrayIterator
    {
        return new ArrayIterator($this->filters);
    }

    public function count(): int
    {
        return count($this->filters);
    }

    public function isEmpty(): bool
    {
        return $this->filters === [];
    }

    public function isNotEmpty(): bool
    {
        return ! $this->isEmpty();
    }

    /**
     * @return array<int, array{column: string, value: mixed}>
     */
    public function toArray(): array
    {
        return array_map(fn (Filter $filter): array => $filter->toArray(), $this->filters);
    }
}
