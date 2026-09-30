<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Sorting;

use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;

final readonly class Sort
{
    public function __construct(
        public string $column,
        public string $direction,
    ) {}

    public static function make(string $column, string $direction = 'asc'): self
    {
        $normalizedDirection = strtolower($direction);

        if (! in_array($normalizedDirection, ['asc', 'desc'], true)) {
            throw InvalidSortException::invalidDirection($direction);
        }

        return new self(
            column: $column,
            direction: $normalizedDirection,
        );
    }

    public function isAscending(): bool
    {
        return $this->direction === 'asc';
    }

    public function isDescending(): bool
    {
        return $this->direction === 'desc';
    }

    /**
     * @return array{column: string, direction: string}
     */
    public function toArray(): array
    {
        return [
            'column' => $this->column,
            'direction' => $this->direction,
        ];
    }
}
