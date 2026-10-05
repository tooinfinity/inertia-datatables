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
        public ?string $filterType = null,
        /** @var array<int, array{value: string, label: string}> */
        public array $filterOptions = [],
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
            filterType: $this->filterType,
            filterOptions: $this->filterOptions,
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
            filterType: $this->filterType,
            filterOptions: $this->filterOptions,
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
            filterType: $this->filterType,
            filterOptions: $this->filterOptions,
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
            filterType: $this->filterType,
            filterOptions: $this->filterOptions,
        );
    }

    public function filterType(string $type): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $this->searchable,
            sortable: $this->sortable,
            filterable: $this->filterable,
            hidden: $this->hidden,
            filterType: $type,
            filterOptions: $this->filterOptions,
        );
    }

    /**
     * @param  array<int, array{value: string, label: string}>  $options
     */
    public function filterOptions(array $options): self
    {
        return new self(
            name: $this->name,
            label: $this->label,
            searchable: $this->searchable,
            sortable: $this->sortable,
            filterable: $this->filterable,
            hidden: $this->hidden,
            filterType: $this->filterType ?? 'select',
            filterOptions: $options,
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
            filterType: $this->filterType,
            filterOptions: $this->filterOptions,
        );
    }

    /**
     * @return array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}
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
            'filter_type' => $this->filterType,
            'filter_options' => $this->filterOptions,
        ];
    }

    /**
     * @return array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    private static function formatLabel(string $name): string
    {
        return ucwords(str_replace(['_', '.'], ' ', $name));
    }
}
