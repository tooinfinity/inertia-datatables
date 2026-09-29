<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

final readonly class Column
{
    public function __construct(
        public string $name,
        public string $label,
        public bool $searchable = false,
        public bool $sortable = false,
        public bool $filterable = false,
        public bool $hidden = false,
    ) {}

    public static function make(string $name): self
    {
        return new self(
            name: $name,
            label: self::formatLabel($name),
        );
    }

    public function label(string $label): self
    {
        return new self(
            name: $this->name,
            label: $label,
            searchable: $this->searchable,
            sortable: $this->sortable,
            filterable: $this->filterable,
            hidden: $this->hidden,
        );
    }

    public function searchable(bool $value = true): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $value,
            sortable: $this->sortable,
            filterable: $this->filterable,
            hidden: $this->hidden,
        );
    }

    public function sortable(bool $value = true): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $this->searchable,
            sortable: $value,
            filterable: $this->filterable,
            hidden: $this->hidden,
        );
    }

    public function filterable(bool $value = true): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $this->searchable,
            sortable: $this->sortable,
            filterable: $value,
            hidden: $this->hidden,
        );
    }

    public function hidden(bool $value = true): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $this->searchable,
            sortable: $this->sortable,
            filterable: $this->filterable,
            hidden: $value,
        );
    }

    /**
     * @return array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool}
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'label' => $this->label,
            'searchable' => $this->searchable,
            'sortable' => $this->sortable,
            'filterable' => $this->filterable,
            'hidden' => $this->hidden,
        ];
    }

    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    private static function formatLabel(string $name): string
    {
        return ucwords(str_replace(['_', '.'], ' ', $name));
    }
}
