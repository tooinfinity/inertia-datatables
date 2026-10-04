<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Sorting;

use ArrayIterator;
use Countable;
use IteratorAggregate;

/**
 * @implements IteratorAggregate<int, Sort>
 */
final readonly class SortCollection implements Countable, IteratorAggregate
{
    /**
     * @param  array<int, Sort>  $sorts
     */
    public function __construct(
        private array $sorts = [],
    ) {}

    /**
     * @param  array<int, Sort>  $sorts
     */
    public static function make(array $sorts = []): self
    {
        return new self($sorts);
    }

    public static function fromQueryString(string $queryString): self
    {
        if ($queryString === '') {
            return new self;
        }

        $sorts = [];

        foreach (explode(',', $queryString) as $part) {
            $part = trim($part);

            if ($part === '') {
                continue;
            }

            $direction = 'asc';
            $column = $part;

            if (str_starts_with($part, '-')) {
                $direction = 'desc';
                $column = substr($part, 1);
            } elseif (str_starts_with($part, '+')) {
                $column = substr($part, 1);
            }

            if ($column === '') {
                continue;
            }

            $sorts[] = Sort::make($column, $direction);
        }

        return new self($sorts);
    }

    /**
     * @return array<int, Sort>
     */
    public function all(): array
    {
        return $this->sorts;
    }

    public function first(): ?Sort
    {
        return $this->sorts[0] ?? null;
    }

    /**
     * @return ArrayIterator<int, Sort>
     */
    public function getIterator(): ArrayIterator
    {
        return new ArrayIterator($this->sorts);
    }

    public function count(): int
    {
        return count($this->sorts);
    }

    public function isEmpty(): bool
    {
        return $this->sorts === [];
    }

    public function isNotEmpty(): bool
    {
        return ! $this->isEmpty();
    }

    /**
     * @return array<int, array{column: string, direction: string}>
     */
    public function toArray(): array
    {
        return array_map(fn (Sort $sort): array => $sort->toArray(), $this->sorts);
    }

    public function toQueryString(): string
    {
        return implode(',', array_map(
            fn (Sort $sort): string => ($sort->isDescending() ? '-' : '').$sort->column,
            $this->sorts,
        ));
    }

    /**
     * @return array<int, array{column: string, direction: string}>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
