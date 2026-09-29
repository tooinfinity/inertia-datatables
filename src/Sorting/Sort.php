<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Sorting;

final readonly class Sort
{
    public function __construct(
        public string $column,
        public string $direction,
    ) {}

    public static function make(string $column, string $direction = 'asc'): self
    {
        return new self(
            column: $column,
            direction: strtolower($direction) === 'desc' ? 'desc' : 'asc',
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
