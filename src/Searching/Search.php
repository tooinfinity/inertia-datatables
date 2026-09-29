<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Searching;

final readonly class Search
{
    public function __construct(
        public string $column,
        public string $value,
    ) {}

    public static function make(string $column, string $value): self
    {
        return new self(column: $column, value: $value);
    }

    /**
     * @return array{column: string, value: string}
     */
    public function toArray(): array
    {
        return [
            'column' => $this->column,
            'value' => $this->value,
        ];
    }
}
