<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing\Applicators;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Processing\ColumnRegistry;
use TooInfinity\InertiaDataTables\Processing\RelationResolver;

/**
 * Applies request filters to database queries.
 *
 * @internal
 */
final readonly class FilterApplier
{
    public function __construct(
        private ColumnRegistry $registry,
        private RelationResolver $relations,
        private SearchApplier $searchApplier,
    ) {}

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function apply(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): void
    {
        foreach ($request->filters->all() as $filter) {
            $column = $this->registry->find($filter->column);

            if (! $column->filterable) {
                throw InvalidFilterException::notAllowed($filter->column)->forRequest();
            }

            $this->applyFilter($query, $column, $filter->value);
        }
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function applyFilter(EloquentBuilder|QueryBuilder $query, Column $column, mixed $value): void
    {
        if ($column->filterUsing instanceof Closure) {
            ($column->filterUsing)($query, $value);

            return;
        }

        // An empty range filter applies no constraint. Handle it before
        // relation dispatch so applyRelationFilter does not add a "has related
        // row" constraint that would wrongly exclude parents without related
        // rows.
        if (($column->filterType === 'date_range' || $column->filterType === 'number_range')
            && is_array($value) && count($value) === 0) {
            return;
        }

        if ($column->relation !== null) {
            $this->applyRelationFilter($query, $column, $value);

            return;
        }

        $this->applyFilterToColumn($query, $column, $this->registry->fieldExpression($column), $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     */
    public function applyFilterToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $target,
        mixed $value,
    ): void {
        // Handle range filters (date_range / number_range): { from, to }
        if (($column->filterType === 'date_range' || $column->filterType === 'number_range')
            && is_array($value)) {
            $this->applyRangeFilter($query, $column, $target, $value);

            return;
        }

        // Handle array values - use whereIn for multi-value filtering
        if (is_array($value)) {
            // Range filters (date_range / number_range) returned above. Any
            // remaining associative array (e.g. filters[col][from]=x on a text
            // column) must be rejected; it would otherwise silently become an
            // IN constraint with its keys ignored.
            if (! array_is_list($value)) {
                throw InvalidFilterException::invalidValue($column->name, 'Associative array filter values are not allowed')->forRequest();
            }

            // For select / multi_select filter types, validate against allowed options
            if (($column->filterType === 'select' || $column->filterType === 'multi_select')
                && $column->filterOptions !== []) {
                $canonicalValues = [];
                foreach ($value as $item) {
                    $canonical = $this->resolveSelectValue($item, $column->filterOptions);
                    if ($canonical === null) {
                        $itemString = is_string($item) ? $item : json_encode($item);
                        throw InvalidFilterException::invalidValue($column->name, "Value '{$itemString}' is not in allowed options")->forRequest();
                    }
                    $canonicalValues[] = $canonical;
                }
                $value = $canonicalValues;
            }

            // Empty array means no results
            if ($value === []) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->whereIn($target, $value);

            return;
        }

        // Validate select / multi_select membership before the generic operator
        // branches so disallowed scalar values (e.g. "*", "true", "null",
        // "not_null") produce a validation error instead of a query constraint.
        if (
            in_array($column->filterType, ['select', 'multi_select'], true)
            && $column->filterOptions !== []
            && is_scalar($value)
        ) {
            $canonical = $this->resolveSelectValue($value, $column->filterOptions);

            if ($canonical === null) {
                throw InvalidFilterException::invalidValue($column->name, $value)->forRequest();
            }

            $value = $canonical;
        }

        // Handle boolean string values ("true"/"false"/"1"/"0") only for columns
        // that explicitly opt in with filterType('boolean'). For every other
        // column these are ordinary literal string values, so a string column can
        // still match the exact values "0", "1", "true" and "false".
        if (is_string($value) && $column->filterType === 'boolean') {
            $lowerValue = strtolower($value);
            if (in_array($lowerValue, ['true', '1'], true)) {
                $query->where($target, true);

                return;
            }
            if (in_array($lowerValue, ['false', '0'], true)) {
                $query->where($target, false);

                return;
            }
        }

        if (is_bool($value)) {
            $query->where($target, $value);

            return;
        }

        if ($value === 'null' || $value === 'NULL') {
            $query->whereNull($target);

            return;
        }

        if ($value === 'not_null' || $value === 'NOT_NULL') {
            $query->whereNotNull($target);

            return;
        }

        if (is_string($value) && str_contains($value, '*')) {
            $pattern = $this->searchApplier->escapeLikeValue($value, allowWildcards: true);

            $this->searchApplier->applyLike($query, $target, $pattern);

            return;
        }

        $query->where($target, $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     */
    public function applyRelationFilter(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        mixed $value,
    ): void {
        $resolved = $this->relations->resolve($query, $column);

        $resolved['eloquent']->has($this->relations->relationName($column), '>=', 1, 'and', function (EloquentBuilder $related) use ($column, $resolved, $value): void {
            $this->applyFilterToColumn($related, $column, $resolved['link']->relatedColumn, $value);
        });
    }

    /**
     * Coerce a numeric value to an int when it represents a representable
     * integer, preserving precision for large integers; otherwise to a float,
     * or to the original string when it is an out-of-range integer string.
     */
    private function coerceNumber(mixed $value): int|float|string
    {
        if (is_int($value)) {
            return $value;
        }

        if (! is_string($value)) {
            if (is_float($value)) {
                return $value;
            }

            return 0.0;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || ! is_numeric($trimmed)) {
            return (float) $value;
        }

        // Integer string: optional sign followed by digits only.
        if (preg_match('/^[+-]?\d+$/', $trimmed) === 1) {
            $intValue = (int) $trimmed;
            // The cast is exact only when it round-trips, i.e. the value fits
            // in the native integer range.
            if ((string) $intValue === ltrim($trimmed, '+')) {
                return $intValue;
            }

            // Out of native int range: keep the string for exact comparison.
            return $trimmed;
        }

        return (float) $value;
    }

    /**
     * Compare two integer strings exactly, without narrowing them to floats.
     *
     * @param  string  $a  An integer string, optionally signed.
     * @param  string  $b  An integer string, optionally signed.
     * @return int -1, 0, or 1.
     */
    private function compareIntegerStrings(string $a, string $b): int
    {
        $aNeg = str_starts_with($a, '-');
        $bNeg = str_starts_with($b, '-');

        if ($aNeg && ! $bNeg) {
            return -1;
        }
        if (! $aNeg && $bNeg) {
            return 1;
        }

        $aDigits = ltrim($a, '+-0');
        $bDigits = ltrim($b, '+-0');
        if ($aDigits === '') {
            $aDigits = '0';
        }
        if ($bDigits === '') {
            $bDigits = '0';
        }

        $lengthCmp = strlen($aDigits) <=> strlen($bDigits);
        if ($lengthCmp !== 0) {
            return $aNeg ? -$lengthCmp : $lengthCmp;
        }

        $digitCmp = strcmp($aDigits, $bDigits);

        return $aNeg ? -$digitCmp : $digitCmp;
    }

    /**
     * Compare two numeric values with full precision.
     *
     * Native integers compare exactly. Integer strings that fit the native int
     * range compare as integers. Out-of-range integer strings compare exactly
     * by magnitude and sign. Everything else compares as floats.
     *
     * @return int -1, 0, or 1.
     */
    private function compareNumbers(mixed $a, mixed $b): int
    {
        $ca = $this->coerceNumber($a);
        $cb = $this->coerceNumber($b);

        if (is_int($ca) && is_int($cb)) {
            return $ca <=> $cb;
        }

        // Compare integer and integer-string values exactly without float
        // conversion, so large integers keep their precision.
        if ((is_int($ca) && is_string($cb)) || (is_string($ca) && is_int($cb))) {
            return $this->compareIntegerStrings((string) $ca, (string) $cb);
        }

        if (is_string($ca) && is_string($cb)) {
            return $this->compareIntegerStrings($ca, $cb);
        }

        return (float) $ca <=> (float) $cb;
    }

    /**
     * Apply a range filter (date_range / number_range) where the value is a flat
     * associative array `{ from, to }`. Either bound may be omitted for a
     * one-sided constraint. When both are present, `from` must not be after `to`.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @param  array{from?: mixed, to?: mixed}  $value
     */
    private function applyRangeFilter(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $target,
        array $value,
    ): void {
        $from = $value['from'] ?? null;
        $to = $value['to'] ?? null;

        $hasFrom = $from !== null && $from !== '';
        $hasTo = $to !== null && $to !== '';

        if (! $hasFrom && ! $hasTo) {
            // Empty range applies no constraint.
            if (count($value) === 0) {
                return;
            }
            // A non-empty value with no named bounds is a malformed range (e.g.
            // a list such as ['1', '2']). Reject it instead of silently
            // applying no constraint.
            throw InvalidFilterException::invalidValue($column->name, 'Range filter requires "from" and/or "to" bounds')->forRequest();
        }

        $validateNumeric = $column->filterType === 'number_range';

        $resolvedFrom = $from;
        $resolvedTo = $to;
        $fromDate = null;
        $toDate = null;

        if ($validateNumeric) {
            if ($hasFrom && ! is_numeric($from)) {
                throw InvalidFilterException::invalidValue($column->name, 'From value must be a number')->forRequest();
            }
            if ($hasTo && ! is_numeric($to)) {
                throw InvalidFilterException::invalidValue($column->name, 'To value must be a number')->forRequest();
            }

            $resolvedFrom = $hasFrom ? $from : $from;
            $resolvedTo = $hasTo ? $to : $to;
        } else {
            // date_range: parse each bound so invalid dates are rejected before
            // they reach the query, and so the inverted-range check compares
            // real dates rather than raw strings.
            if ($hasFrom) {
                if (! is_string($from)) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid 'from' date: ".json_encode($from))->forRequest();
                }
                $fromDate = date_create_immutable($from);
                $fromErrors = DateTimeImmutable::getLastErrors();
                if (
                    $fromDate === false
                    || (($fromErrors['warning_count'] ?? 0) > 0)
                    || (($fromErrors['error_count'] ?? 0) > 0)
                ) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid 'from' date: {$from}")->forRequest();
                }
                // Normalize to a single timezone so formatted bounds compare
                // consistently regardless of input offsets.
                $fromDate = $fromDate->setTimezone(new DateTimeZone('UTC'));
            }
            if ($hasTo) {
                if (! is_string($to)) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid 'to' date: ".json_encode($to))->forRequest();
                }
                $toDate = date_create_immutable($to);
                $toErrors = DateTimeImmutable::getLastErrors();
                if (
                    $toDate === false
                    || (($toErrors['warning_count'] ?? 0) > 0)
                    || (($toErrors['error_count'] ?? 0) > 0)
                ) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid 'to' date: {$to}")->forRequest();
                }
                // Expand a date-only upper bound to the end of its calendar day
                // in its original timezone, then normalize to UTC so the bound
                // includes the whole selected day everywhere.
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) === 1) {
                    $toDate = $toDate->setTime(23, 59, 59);
                }
                $toDate = $toDate->setTimezone(new DateTimeZone('UTC'));
            }
        }

        if ($hasFrom) {
            $query->where($target, '>=', $validateNumeric ? $resolvedFrom : ($fromDate?->format('Y-m-d H:i:s') ?? $from));
        }
        if ($hasTo) {
            $query->where($target, '<=', $validateNumeric ? $resolvedTo : ($toDate?->format('Y-m-d H:i:s') ?? $to));
        }

        // Reject inverted ranges when both bounds are present. The comparison
        // uses the normalized upper bound used by the query (end of day for a
        // date-only `to`).
        if ($hasFrom && $hasTo) {
            if ($validateNumeric) {
                if ($this->compareNumbers($from, $to) > 0) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid range: 'from' must be before or equal to 'to'")->forRequest();
                }
            } else {
                if ($fromDate > $toDate) {
                    throw InvalidFilterException::invalidValue($column->name, "Invalid range: 'from' must be before or equal to 'to'")->forRequest();
                }
            }
        }
    }

    /**
     * Resolve a submitted filter value against the allowed select options'
     * wire representations, returning the canonical option value when a match
     * is found (e.g. the string `"2"` matches the integer option `2`).
     *
     * @param  array<int, array{value: int|string, label: string}>  $options
     * @return mixed|null The canonical option value, or null when no match exists.
     */
    private function resolveSelectValue(mixed $value, array $options): mixed
    {
        $allowedValues = array_column($options, 'value');

        if (in_array($value, $allowedValues, true)) {
            return $value;
        }

        foreach ($allowedValues as $allowed) {
            $allowedString = (string) $allowed;

            if (is_string($value) && $value === $allowedString) {
                return $allowed;
            }

            if (is_int($value) || is_float($value)) {
                if ((string) $value === $allowedString) {
                    return $allowed;
                }
            }
        }

        return null;
    }
}
