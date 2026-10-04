<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Filtering;

final readonly class Filter
{
    public function __construct(
        public string $column,
        public mixed $value,
    ) {}

    public static function make(string $column, mixed $value): self
    {
        return new self(column: $column, value: $value);
    }

    /**
     * @return array{column: string, value: mixed}
     */
    public function toArray(): array
    {
        return [
            'column' => $this->column,
            'value' => $this->value,
        ];
    }

    /**
     * @return array{column: string, value: mixed}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
