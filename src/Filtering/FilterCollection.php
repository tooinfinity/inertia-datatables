<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Filtering;

use ArrayIterator;
use Countable;
use Illuminate\Http\Request;
use IteratorAggregate;
use JsonSerializable;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;

/**
 * @implements IteratorAggregate<int, Filter>
 */
final readonly class FilterCollection implements Countable, IteratorAggregate, JsonSerializable
{
    /**
     * @param  array<int, Filter>  $filters
     */
    public function __construct(
        public array $filters = [],
    ) {}

    /**
     * @param  array<int, Filter>  $filters
     */
    public static function make(array $filters = []): self
    {
        return new self($filters);
    }

    /**
     * @param  int  $maxValues  Maximum number of values allowed in a single filter array
     * @param  int  $maxValueLength  Maximum length of each string value
     */
    public static function fromRequest(Request $request, string $filterParameter, int $maxValues = 20, int $maxValueLength = 500): self
    {
        $filters = [];
        $filtersInput = $request->query($filterParameter, []);

        if (! is_array($filtersInput)) {
            return new self;
        }

        foreach ($filtersInput as $column => $value) {
            if (! is_string($column) || $value === '' || $value === null) {
                continue;
            }

            $value = self::sanitizeValue($value, $maxValues, $maxValueLength, $column);
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

    public function limit(int $max): self
    {
        if (count($this->filters) <= $max) {
            return $this;
        }

        return new self(array_slice($this->filters, 0, $max));
    }

    /**
     * @param  int  $maxLength  Maximum length of string values
     * @param  int  $maxValues  Maximum number of values in an array
     */
    public function sanitizeValues(int $maxLength, int $maxValues = 20): self
    {
        $sanitized = [];

        foreach ($this->filters as $filter) {
            $value = $filter->value;

            $value = self::sanitizeValue($value, $maxValues, $maxLength, $filter->column);

            $sanitized[] = Filter::make($filter->column, $value);
        }

        return new self($sanitized);
    }

    /**
     * Validate array filter values against allowed options (for select filter type).
     *
     * @param  array<string, array<int, array{value: string, label: string}>>  $columnOptions  Map of column name to filter options
     *
     * @throws InvalidFilterException If any value is not in the allowed options
     */
    public function validateAgainstOptions(array $columnOptions): void
    {
        foreach ($this->filters as $filter) {
            $value = $filter->value;
            $column = $filter->column;

            if (! is_array($value)) {
                continue;
            }

            if (! isset($columnOptions[$column])) {
                continue;
            }

            $allowedValues = array_column($columnOptions[$column], 'value');

            foreach ($value as $item) {
                $itemString = is_string($item) ? $item : json_encode($item);
                if (! in_array($item, $allowedValues, true)) {
                    throw InvalidFilterException::invalidValue($column, "Value '{$itemString}' is not in allowed options");
                }
            }
        }
    }

    /**
     * @return array<int, array{column: string, value: mixed}>
     */
    public function toArray(): array
    {
        return array_map(fn (Filter $filter): array => $filter->toArray(), $this->filters);
    }

    /**
     * @return array<int, array{column: string, value: mixed}>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    /**
     * Sanitize a filter value - handles scalars, sequential arrays and flat
     * associative arrays (e.g. `{ from, to }` for date/number ranges).
     *
     * @param  int  $maxValues  Maximum number of values/keys allowed
     * @param  int  $maxValueLength  Maximum length of each string value
     *
     * @throws InvalidFilterException If value is a nested array/object or exceeds limits
     */
    private static function sanitizeValue(mixed $value, int $maxValues, int $maxValueLength, ?string $column = null): mixed
    {
        // Reject objects
        if (is_object($value)) {
            throw InvalidFilterException::invalidValue('filter', 'Filter values must be scalar or null');
        }

        if (is_array($value)) {
            $keys = array_keys($value);

            // Sequential integer array (e.g. filters[col][]=a&filters[col][]=b)
            if ($keys === range(0, count($keys) - 1)) {
                return self::sanitizeSequentialArray($value, $maxValues, $maxValueLength);
            }

            // Flat associative array with string keys (e.g. filters[col][from]=…&filters[col][to]=…)
            // Reject mixed or non-string keys.
            foreach ($keys as $key) {
                if (! is_string($key)) {
                    throw InvalidFilterException::invalidValue('filter', 'Nested arrays are not allowed');
                }
            }

            return self::sanitizeAssociativeArray($value, $maxValues, $maxValueLength, $column);
        }

        // Scalar value - truncate string if too long
        if (is_string($value) && strlen($value) > $maxValueLength) {
            return mb_substr($value, 0, $maxValueLength);
        }

        return $value;
    }

    /**
     * Sanitize a sequential array of filter values.
     *
     * @param  array<mixed, mixed>  $value
     * @return array<mixed, mixed>
     *
     * @throws InvalidFilterException If a value is nested or exceeds limits
     */
    private static function sanitizeSequentialArray(array $value, int $maxValues, int $maxValueLength): array
    {
        // Check for nested arrays in values
        foreach ($value as $item) {
            if (is_array($item)) {
                throw InvalidFilterException::invalidValue('filter', 'Nested arrays are not allowed');
            }
        }

        // Limit array size
        if (count($value) > $maxValues) {
            throw InvalidFilterException::invalidValue('filter', "Filter value array exceeds maximum of {$maxValues} items");
        }

        // Sanitize each item
        $sanitized = [];
        foreach ($value as $item) {
            if (is_scalar($item) || $item === null) {
                $sanitizedItem = $item;
                if (is_string($sanitizedItem) && strlen($sanitizedItem) > $maxValueLength) {
                    $sanitizedItem = mb_substr($sanitizedItem, 0, $maxValueLength);
                }
                $sanitized[] = $sanitizedItem;
            } else {
                throw InvalidFilterException::invalidValue('filter', 'Filter values must be scalar or null');
            }
        }

        return $sanitized;
    }

    /**
     * Sanitize a flat associative array of filter values (string keys only).
     *
     * @param  array<mixed, mixed>  $value
     * @return array<mixed, mixed>
     *
     * @throws InvalidFilterException If a value is nested or exceeds limits
     */
    private static function sanitizeAssociativeArray(array $value, int $maxValues, int $maxValueLength, ?string $column = null): array
    {
        // Limit number of keys
        if (count($value) > $maxValues) {
            throw InvalidFilterException::invalidValue($column ?? 'filter', "Filter value array exceeds maximum of {$maxValues} items");
        }

        $sanitized = [];
        foreach ($value as $key => $item) {
            if (is_array($item) || is_object($item)) {
                throw InvalidFilterException::invalidValue($column ?? 'filter', 'Nested arrays are not allowed');
            }

            if (! is_scalar($item) && $item !== null) {
                throw InvalidFilterException::invalidValue($column ?? 'filter', 'Filter values must be scalar or null');
            }

            // Range bounds ({from, to}) must be rejected when overlong rather than
            // truncated, because truncating can turn an invalid bound into a valid
            // prefix (e.g. "1" + 499 spaces + "x" becomes "1"). Ordinary scalar
            // filters keep their existing truncation behavior.
            $sanitizedItem = $item;
            if (is_string($sanitizedItem) && strlen($sanitizedItem) > $maxValueLength) {
                throw InvalidFilterException::invalidValue($column ?? 'filter', $sanitizedItem)->forRequest();
            }
            $sanitized[$key] = $sanitizedItem;
        }

        return $sanitized;
    }
}
