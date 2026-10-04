<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Searching;

use ArrayIterator;
use Countable;
use Illuminate\Http\Request;
use IteratorAggregate;

/**
 * @implements IteratorAggregate<int, Search>
 */
final readonly class SearchCollection implements Countable, IteratorAggregate
{
    /**
     * @param  array<int, Search>  $searches
     */
    public function __construct(
        private array $searches = [],
    ) {}

    /**
     * @param  array<int, Search>  $searches
     */
    public static function make(array $searches = []): self
    {
        return new self($searches);
    }

    public static function fromRequest(Request $request, string $searchParameter): self
    {
        $searches = [];
        $queryData = $request->query();

        // Handle array format: searches[name]=john&searches[email]=example
        if (isset($queryData[$searchParameter]) && is_array($queryData[$searchParameter])) {
            foreach ($queryData[$searchParameter] as $column => $value) {
                if (! is_string($column) || $value === '') {
                    continue;
                }
                $searches[$column] = Search::make($column, (string) $value);
            }
        }

        // Handle bracket notation in keys: search[name]=john
        $prefix = $searchParameter.'[';

        foreach ($queryData as $key => $value) {
            if (! str_starts_with($key, $prefix) || ! str_ends_with($key, ']')) {
                continue;
            }

            $column = substr($key, strlen($prefix), -1);

            if ($column === '' || $value === '') {
                continue;
            }

            // Use column as key to deduplicate (last occurrence wins)
            $searches[$column] = Search::make($column, (string) $value);
        }

        return new self(array_values($searches));
    }

    /**
     * @return array<int, Search>
     */
    public function all(): array
    {
        return $this->searches;
    }

    public function get(string $column): ?Search
    {
        foreach ($this->searches as $search) {
            if ($search->column === $column) {
                return $search;
            }
        }

        return null;
    }

    public function has(string $column): bool
    {
        return $this->get($column) instanceof Search;
    }

    /**
     * @return ArrayIterator<int, Search>
     */
    public function getIterator(): ArrayIterator
    {
        return new ArrayIterator($this->searches);
    }

    public function count(): int
    {
        return count($this->searches);
    }

    public function isEmpty(): bool
    {
        return $this->searches === [];
    }

    public function isNotEmpty(): bool
    {
        return ! $this->isEmpty();
    }

    /**
     * @return array<int, array{column: string, value: string}>
     */
    public function toArray(): array
    {
        return array_map(fn (Search $search): array => $search->toArray(), $this->searches);
    }

    /**
     * @return array<int, array{column: string, value: string}>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
