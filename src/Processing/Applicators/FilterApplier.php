<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing\Applicators;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Query\Expression;
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
        // Built-in range columns require a { from, to } map. A scalar value
        // does not name a bound and must be rejected instead of falling through
        // to an equality filter. Custom callback precedence is handled earlier
        // in applyFilter(); one-sided range maps (only from or only to) remain
        // valid and are handled by applyRangeFilter.
        if (($column->filterType === 'date_range' || $column->filterType === 'number_range')
            && ! is_array($value)) {
            throw InvalidFilterException::invalidValue($column->name, 'Range filter requires "from" and/or "to" bounds')->forRequest();
        }

        // Handle range filters (date_range / number_range): { from, to }
        // Non-array values on range columns were already rejected above.
        if ($column->filterType === 'date_range' || $column->filterType === 'number_range') {
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
        // A validated scalar option is applied as a literal equality predicate,
        // which prevents option values such as "not_null" from being interpreted
        // as operators (e.g. whereNotNull) and ensures a scalar multi_select
        // matches only the literal option.
        if (
            in_array($column->filterType, ['select', 'multi_select'], true)
            && $column->filterOptions !== []
            && is_scalar($value)
        ) {
            $canonical = $this->resolveSelectValue($value, $column->filterOptions);

            if ($canonical === null) {
                throw InvalidFilterException::invalidValue($column->name, $value)->forRequest();
            }

            $query->where($target, $canonical);

            return;
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

        // Decimal string: keep as string for exact comparison without
        // imprecise float conversion.
        return $trimmed;
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

        // Strip sign and leading zeros to get the significant digits.
        $aDigits = ltrim($a, '+-0') ?: '0';
        $bDigits = ltrim($b, '+-0') ?: '0';

        // Zero is zero regardless of sign (e.g. 0 vs -0 or +0).
        if ($aDigits === '0' && $bDigits === '0') {
            return 0;
        }

        if ($aNeg && ! $bNeg) {
            return -1;
        }
        if (! $aNeg && $bNeg) {
            return 1;
        }

        $lengthCmp = strlen($aDigits) <=> strlen($bDigits);
        if ($lengthCmp !== 0) {
            return $aNeg ? -$lengthCmp : $lengthCmp;
        }

        $digitCmp = strcmp($aDigits, $bDigits);

        return $aNeg ? -$digitCmp : $digitCmp;
    }

    /**
     * Check whether a string represents a whole integer (optional sign,
     * digits only, no decimal point or exponent).
     *
     * @param  string  $value  A numeric string.
     * @return bool True when the string is an integer representation.
     */
    private function isIntegerString(string $value): bool
    {
        return preg_match('/^[+-]?\d+$/', $value) === 1;
    }

    /**
     * Compare two numeric string representations exactly, normalizing decimal
     * and exponent forms without converting to imprecise floats.
     *
     * @param  string  $a  A numeric string.
     * @param  string  $b  A numeric string.
     * @return int -1, 0, or 1.
     */
    private function compareNumericStrings(string $a, string $b): int
    {
        // Scientific notation values are compared by exponent/mantissa to
        // avoid unbounded memory allocation from decimal expansion.
        if (str_contains($a, 'e') || str_contains($a, 'E')
            || str_contains($b, 'e') || str_contains($b, 'E')) {
            return $this->compareScientificNotation($a, $b);
        }

        $a = $this->normalizeNumericString($a);
        $b = $this->normalizeNumericString($b);

        $aNeg = str_starts_with($a, '-');
        $bNeg = str_starts_with($b, '-');

        if ($aNeg && ! $bNeg) {
            return -1;
        }
        if (! $aNeg && $bNeg) {
            return 1;
        }

        $a = ltrim($a, '+-');
        $b = ltrim($b, '+-');

        // Split into integer and fractional parts.
        [$aInt, $aFrac] = str_contains($a, '.') ? explode('.', $a, 2) : [$a, ''];
        [$bInt, $bFrac] = str_contains($b, '.') ? explode('.', $b, 2) : [$b, ''];

        // Normalize integer parts (strip leading zeros).
        $aInt = ltrim($aInt, '0') ?: '0';
        $bInt = ltrim($bInt, '0') ?: '0';

        $sign = $aNeg ? -1 : 1;

        // Compare integer parts by length then lexicographically.
        $intLenCmp = strlen($aInt) <=> strlen($bInt);
        if ($intLenCmp !== 0) {
            return $sign * $intLenCmp;
        }

        $intCmp = strcmp($aInt, $bInt);
        if ($intCmp !== 0) {
            return $sign * $intCmp;
        }

        // Compare fractional parts (right-pad shorter with zeros).
        $maxFracLen = max(strlen($aFrac), strlen($bFrac));
        $aFrac = str_pad($aFrac, $maxFracLen, '0');
        $bFrac = str_pad($bFrac, $maxFracLen, '0');
        $fracCmp = strcmp($aFrac, $bFrac);

        return $sign * $fracCmp;
    }

    /**
     * Normalize a numeric string: handle scientific notation and strip
     * trailing zeros from the fractional part.
     *
     * @param  string  $value  A numeric string.
     * @return string The normalized numeric string.
     */
    private function normalizeNumericString(string $value): string
    {
        // Trim whitespace so values like " 2.0" compare correctly.
        $value = trim($value);

        // Handle scientific notation like "1e10", "1.5E-3", or ".5e1".
        if (preg_match('/^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/', $value) === 1) {
            return $this->scientificToDecimal($value);
        }

        // Strip trailing zeros after the decimal point.
        if (str_contains($value, '.')) {
            $value = rtrim($value, '0');
            if (str_ends_with($value, '.')) {
                $value = substr($value, 0, -1);
            }
        }

        // Normalize -0 to 0.
        if ($value === '-0' || $value === '-0.') {
            $value = '0';
        }

        return $value;
    }

    /**
     * Convert a scientific notation string to a decimal string.
     *
     * @param  string  $value  A value in scientific notation (e.g. "1e10").
     * @return string The decimal representation.
     */
    private function scientificToDecimal(string $value): string
    {
        // Split into mantissa and exponent.
        $parts = preg_split('/[eE]/', $value, 2);
        if ($parts === false || count($parts) !== 2) {
            return $value;
        }
        $mantissa = $parts[0];
        $exponent = (int) $parts[1];

        // Refuse to expand exponents that would allocate excessive memory
        // (e.g. 1e1000000000). Callers handle such values via exponent
        // comparison instead.
        if (abs($exponent) > 1000) {
            return $value;
        }

        // Track sign.
        $sign = '';
        if (str_starts_with($mantissa, '-')) {
            $sign = '-';
            $mantissa = ltrim($mantissa, '-');
        } elseif (str_starts_with($mantissa, '+')) {
            $mantissa = ltrim($mantissa, '+');
        }

        // Split into integer and fractional parts.
        if (str_contains($mantissa, '.')) {
            [$intPart, $fracPart] = explode('.', $mantissa, 2);
        } else {
            $intPart = $mantissa;
            $fracPart = '';
        }

        $intPart = ltrim($intPart, '0') ?: '0';
        $digits = ltrim($intPart.$fracPart, '0') ?: '0';

        // Decimal position in the mantissa (digits after the decimal point).
        $decimalPos = strlen($fracPart);
        // New decimal position after applying the exponent.
        $newDecimalPos = $decimalPos - $exponent;

        if ($newDecimalPos <= 0) {
            // Decimal point is at or before the first digit: append zeros.
            $result = $digits.str_repeat('0', -$newDecimalPos);
        } elseif ($newDecimalPos >= strlen($digits)) {
            // Need leading zeros after the decimal point.
            $zeros = str_repeat('0', $newDecimalPos - strlen($digits));
            $result = '0.'.$zeros.$digits;
        } else {
            // Decimal point lands within the digits.
            $split = strlen($digits) - $newDecimalPos;
            $result = substr($digits, 0, $split).'.'.substr($digits, $split);
        }

        // Strip trailing zeros from the fractional part.
        if (str_contains($result, '.')) {
            $result = rtrim($result, '0');
            if (str_ends_with($result, '.')) {
                $result = substr($result, 0, -1);
            }
        }

        // Normalize all-zero results and -0.
        if (in_array($result, ['', '-0', '-0.'], true)) {
            $result = '0';
        }

        return $sign.$result;
    }

    /**
     * Compare two values that may be in scientific notation by parsing
     * mantissa and exponent, without expanding to decimal strings.
     * This avoids unbounded memory allocation for extreme exponents
     * (e.g. 1e1000000000).
     *
     * @param  string  $a  A numeric string, possibly in scientific notation.
     * @param  string  $b  A numeric string, possibly in scientific notation.
     * @return int -1, 0, or 1.
     */
    private function compareScientificNotation(string $a, string $b): int
    {
        $pa = $this->parseScientificNotation($a);
        $pb = $this->parseScientificNotation($b);

        // Zero is zero regardless of exponent or sign (e.g. 0e5 vs 0e-2).
        if ($pa['mantissa'] === '0' && $pb['mantissa'] === '0') {
            return 0;
        }

        // Compare signs.
        if ($pa['sign'] !== $pb['sign']) {
            return $pa['sign'] === '-' ? -1 : 1;
        }
        $sign = $pa['sign'] === '-' ? -1 : 1;

        // Effective exponent accounts for mantissa length AND the original
        // decimal-point position: 1.23e5 == 123e3, so combine exponent with
        // mantissa length and decimal digits to compare magnitudes exactly.
        // Out-of-range exponents are stored as strings and compared without the
        // saturating (int) cast.
        $expCmp = $this->compareEffectiveExponents($pa, $pb);
        if ($expCmp !== null) {
            return $sign * $expCmp;
        }

        // Same effective exponent: compare mantissas digit by digit.
        $maxLen = max(strlen($pa['mantissa']), strlen($pb['mantissa']));
        $ma = str_pad($pa['mantissa'], $maxLen, '0');
        $mb = str_pad($pb['mantissa'], $maxLen, '0');
        $cmp = strcmp($ma, $mb);

        return $sign * $cmp;
    }

    /**
     * Compare the effective exponents of two parsed scientific values.
     *
     * Returns null when the effective exponents are equal (callers should fall
     * back to a mantissa comparison), or -1/0/1 when the order is decided by
     * the exponent alone. Out-of-range exponents (strings) dominate any
     * in-range exponent by their sign; two out-of-range exponents are compared
     * as signed numeric strings so they never saturate to equality.
     *
     * @param  array{sign: string, mantissa: string, exponent: int|string, decimalDigits: int}  $pa  A parsed scientific value.
     * @param  array{sign: string, mantissa: string, exponent: int|string, decimalDigits: int}  $pb  A parsed scientific value.
     * @return int|null -1, 0, or 1, or null when exponents are equal.
     */
    private function compareEffectiveExponents(array $pa, array $pb): ?int
    {
        $aExponent = $pa['exponent'];
        $bExponent = $pb['exponent'];
        $aIsString = is_string($aExponent);
        $bIsString = is_string($bExponent);

        if (! $aIsString && ! $bIsString) {
            // Both exponents are native ints; combine with mantissa length and
            // decimal digits to compare magnitudes exactly.
            $expA = $aExponent - $pa['decimalDigits'] + strlen($pa['mantissa']);
            $expB = $bExponent - $pb['decimalDigits'] + strlen($pb['mantissa']);

            return $expA === $expB ? null : ($expA <=> $expB);
        }

        if ($aIsString && $bIsString) {
            $cmp = $this->compareExponentStrings($aExponent, $bExponent);

            return $cmp !== 0 ? $cmp : null;
        }

        // Exactly one exponent is out of range (a string). It dominates any
        // in-range exponent by its sign.
        if ($aIsString) {
            $stringSign = str_starts_with($aExponent, '-') ? -1 : 1;

            return $stringSign === -1 ? -1 : 1;
        }

        $stringSign = str_starts_with($bExponent, '-') ? -1 : 1;

        return $stringSign === -1 ? 1 : -1;
    }

    /**
     * Compare two signed numeric exponent strings without casting to int.
     *
     * @return int -1, 0, or 1.
     */
    private function compareExponentStrings(string $a, string $b): int
    {
        $aNeg = str_starts_with($a, '-');
        $bNeg = str_starts_with($b, '-');

        if ($aNeg && ! $bNeg) {
            return -1;
        }
        if (! $aNeg && $bNeg) {
            return 1;
        }

        $sign = $aNeg ? -1 : 1;
        $aDigits = ltrim($a, '-+0') ?: '0';
        $bDigits = ltrim($b, '-+0') ?: '0';

        $lengthCmp = strlen($aDigits) <=> strlen($bDigits);
        if ($lengthCmp !== 0) {
            return $sign * $lengthCmp;
        }

        return $sign * (strcmp($aDigits, $bDigits));
    }

    /**
     * Parse a numeric string (possibly in scientific notation) into sign,
     * mantissa digits, and exponent.
     *
     * @param  string  $value  A numeric string.
     * @return array{sign: string, mantissa: string, exponent: int|string, decimalDigits: int}
     */
    private function parseScientificNotation(string $value): array
    {
        $sign = '+';
        if (str_starts_with($value, '-')) {
            $sign = '-';
            $value = ltrim($value, '-');
        } elseif (str_starts_with($value, '+')) {
            $value = ltrim($value, '+');
        }

        $parts = preg_split('/[eE]/', $value, 2);
        if ($parts === false) {
            $parts = [$value];
        }
        $mantissa = $parts[0];
        $exponentRaw = $parts[1] ?? '0';
        // Keep the exponent as a native int when it fits, otherwise preserve it
        // as a string so distinct out-of-range exponents do not saturate to the
        // same value under the (int) cast (e.g. 1e-9223372036854775809 vs
        // 1e-9223372036854775810).
        $exponentInt = (int) $exponentRaw;
        if ((string) $exponentInt === ltrim($exponentRaw, '+')) {
            $exponent = $exponentInt;
        } else {
            $exponent = $exponentRaw;
        }

        // Track digits after the decimal point in the original mantissa.
        $decimalDigits = str_contains($mantissa, '.') ? strlen(explode('.', $mantissa, 2)[1]) : 0;

        // Remove decimal point and leading zeros from mantissa.
        $mantissa = str_replace('.', '', $mantissa);
        $mantissa = ltrim($mantissa, '0') ?: '0';

        return [
            'sign' => $sign,
            'mantissa' => $mantissa,
            'exponent' => $exponent,
            'decimalDigits' => $decimalDigits,
        ];
    }

    /**
     * Compare two numeric values with full precision.
     *
     * Native integers compare exactly. Integer strings that fit the native int
     * range compare as integers. Out-of-range integer strings compare exactly
     * by magnitude and sign. Decimal and exponent forms are normalized and
     * compared exactly without imprecise float conversion.
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

        // Compare integer values exactly without float conversion. Only use
        // compareIntegerStrings() when both sides are actual integers; decimals
        // and exponent forms go through compareNumericStrings().
        if (is_int($ca) && is_string($cb) && $this->isIntegerString($cb)) {
            return $this->compareIntegerStrings((string) $ca, $cb);
        }
        if (is_string($ca) && $this->isIntegerString($ca) && is_int($cb)) {
            return $this->compareIntegerStrings($ca, (string) $cb);
        }

        // One or both values are decimals or exponent forms: compare exactly
        // without imprecise float conversion.
        return $this->compareNumericStrings((string) $ca, (string) $cb);
    }

    /**
     * Format a date bound for SQL binding, preserving fractional seconds when
     * present. Falls back to whole-second formatting when there are no
     * microseconds, so existing whole-second comparisons are unchanged.
     */
    private function formatDateTime(?DateTimeImmutable $date): ?string
    {
        if (! $date instanceof DateTimeImmutable) {
            return null;
        }

        $micro = (int) $date->format('u');
        if ($micro !== 0) {
            return $date->format('Y-m-d H:i:s.u');
        }

        return $date->format('Y-m-d H:i:s');
    }

    /**
     * Apply a range filter (date_range / number_range) where the value is a flat
     * associative array `{ from, to }`. Either bound may be omitted for a
     * one-sided constraint. When both are present, `from` must not be after `to`.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @param  array<mixed, mixed>  $value
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

        // Reject unknown keys so a typo such as [t0] cannot silently drop a
        // bound. A map with only "from" or only "to" remains valid.
        foreach (array_keys($value) as $key) {
            if (! in_array($key, ['from', 'to'], true)) {
                throw InvalidFilterException::invalidValue($column->name, 'Range filter requires "from" and/or "to" bounds')->forRequest();
            }
        }

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
                // Normalize to UTC so validation and SQL binding use the same
                // instant regardless of the input offset.
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
                    $toDate = $toDate->setTime(23, 59, 59, 999999);
                }
                $toDate = $toDate->setTimezone(new DateTimeZone('UTC'));
            }
        }

        if ($hasFrom) {
            if ($validateNumeric && $query->getConnection() instanceof PostgresConnection) {
                // PostgreSQL can compare against an exact `numeric` parameter,
                // preserving precision for large integer and decimal bounds
                // without first converting them to a (lossy) PHP float. The
                // column itself is passed through where() so Laravel qualifies
                // it correctly, and PostgreSQL casts the bound to numeric.
                $query->where($target, '>=', new Expression('?::numeric'));
                $query->addBinding($resolvedFrom);
            } else {
                // For a date-only lower bound, bind the calendar date itself so
                // SQLite DATE columns stored as date-only text include rows on
                // the inclusive lower endpoint (text '2026-02-15' sorts before
                // '2026-02-15 00:00:00'). Time-bearing bounds keep their time.
                $lowerBound = $this->formatDateTime($fromDate);
                if (! $validateNumeric && preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($from)) === 1) {
                    $lowerBound = trim($from);
                }
                $query->where($target, '>=', $validateNumeric ? (float) $resolvedFrom : $lowerBound);
            }
        }
        if ($hasTo) {
            if ($validateNumeric && $query->getConnection() instanceof PostgresConnection) {
                $query->where($target, '<=', new Expression('?::numeric'));
                $query->addBinding($resolvedTo);
            } else {
                $query->where($target, '<=', $validateNumeric ? (float) $resolvedTo : $this->formatDateTime($toDate));
            }
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
